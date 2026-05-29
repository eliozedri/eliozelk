# Elkayam OCR sidecar

The OCR engines (native Tesseract `heb+eng`, optional PaddleOCR) that **cannot run
inside a Vercel Function** live here as a small container. JARVIS (the Next.js app
on Vercel) stays where it is and calls this service over HTTP, behind
`src/lib/supplierDocuments/ocrAdapter.ts` → `httpOcrProvider`.

```
JARVIS (Vercel)  ──POST /ocr (multipart + Bearer)──▶  this service (container)
ocrAdapter                                              native Tesseract heb+eng
  httpOcrProvider  ◀── JSON {text, pageConfidence, …} ─┘  (+ optional PaddleOCR)
  tesseractWasmProvider  ← crash-safe in-process fallback if this service is down
```

## Why a container (not Vercel)
Vercel Functions have **no system package manager** (can't `apt-get` tesseract /
poppler), a **250 MB / 500 MB** bundle cap, and an ephemeral per-instance
filesystem. Native Tesseract and especially PaddleOCR don't fit that model. A
container does, trivially.

## Endpoints
- `GET /health` → `{ ok, engines, authRequired }`
- `POST /ocr` (multipart): `file` (required), `lang` (default `heb+eng`),
  `engine` (`auto` | `tesseract` | `paddle`). Header `Authorization: Bearer <token>`.
  Returns `{ text, pageConfidence (0..1), lowConfidenceTerms[], scanned, engine }`.

## Environment
| Var | Purpose |
|-----|---------|
| `OCR_SERVICE_TOKEN` | shared bearer secret; MUST match JARVIS. If unset, auth is disabled (dev only — logs a warning). |
| `PADDLE_ENABLED` | `true`/`false`. Set automatically by the `INSTALL_PADDLE` build arg. |
| `PORT` | injected by the host (Cloud Run sets it); defaults to 8080. |

## Run locally (Docker — matches production)
```bash
docker build -t elkayam-ocr ./ocr-service
docker run -p 8080:8080 -e OCR_SERVICE_TOKEN=dev-secret elkayam-ocr
# test:
curl -s localhost:8080/health
curl -s -H "Authorization: Bearer dev-secret" \
  -F file=@"מקורות מידע/catalog/catalog.pdf" -F lang=heb+eng localhost:8080/ocr | jq .pageConfidence
```

## Run locally (no Docker — needs tesseract + poppler on your machine)
```bash
brew install tesseract tesseract-lang poppler   # macOS
cd ocr-service && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
OCR_SERVICE_TOKEN=dev-secret uvicorn app:app --port 8080
```

## With PaddleOCR (optional, heavy)
```bash
docker build --build-arg INSTALL_PADDLE=true -t elkayam-ocr-paddle ./ocr-service
docker run -p 8080:8080 -e OCR_SERVICE_TOKEN=dev-secret elkayam-ocr-paddle
# request engine=paddle; Hebrew still uses tesseract (Paddle has no Hebrew model).
```
PaddleOCR is **isolated**: if it isn't installed or fails at runtime, `/ocr`
transparently falls back to Tesseract and reports `note: paddle_unavailable`. It
can never break the OCR flow.

## Deploy (recommended: Google Cloud Run — scale-to-zero)
```bash
gcloud run deploy elkayam-ocr \
  --source ./ocr-service \
  --region europe-west1 \
  --memory 2Gi --cpu 2 --timeout 120 \
  --set-env-vars OCR_SERVICE_TOKEN=<strong-secret> \
  --allow-unauthenticated     # auth is enforced by the bearer token in-app
```
Then in Vercel set `OCR_SERVICE_URL=https://<cloud-run-url>` and
`OCR_SERVICE_TOKEN=<same-secret>`. Fly.io / Railway / Render / a small VPS work
equally well — any Docker host.
```
