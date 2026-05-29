// Central Tesseract engine — the single OCR entry point for the whole system.
// Used by both the image path and the scanned-PDF path so there is ONE engine,
// shared by "סריקת מסמך" and "צי רכב ומכונות".
//
// Hebrew-first: loads the high-accuracy `tessdata_best` Hebrew + English LSTM
// models. If the best-model CDN is unreachable at runtime, it falls back to the
// default tesseract.js models so OCR never regresses below today's baseline.

import { createWorker, PSM, type Worker } from "tesseract.js";

// High-accuracy LSTM models (tessdata_best). Hebrew here is materially better
// than the default/fast model — this is the priority Hebrew upgrade.
const BEST_LANG_PATH = "https://tessdata.projectnaptha.com/4.0.0_best";
// Only writable directory on Vercel serverless — models are cached here per
// instance so warm invocations skip the download.
const CACHE_PATH = "/tmp";
const LANGS = ["heb", "eng"];

export const OCR_ENGINE_LABEL =
  "tesseract.js 7 · tessdata_best (עברית + אנגלית, LSTM)";
export const OCR_ENGINE_LABEL_FALLBACK =
  "tesseract.js 7 · מודל ברירת מחדל (עברית + אנגלית)";

export interface OcrPageResult {
  text: string;
  /** Page-level confidence 0..1 (reliable at page scale, noisy per-word). */
  pageConfidence: number;
  /** Distinct terms Tesseract was least sure about — surfaced as "verify" hints. */
  lowConfidenceTerms: string[];
  /** Whether the high-accuracy Hebrew model loaded, or we fell back. */
  usedBestModel: boolean;
}

interface RunOptions {
  /** Page segmentation mode. AUTO is best for full invoices/forms. */
  psm?: PSM;
}

// Hard ceiling for a single page recognition. tesseract.js on a cold serverless
// instance must download the WASM core + Hebrew LSTM models before it can run;
// without a ceiling a stalled download or a runaway recognition hangs the whole
// request until the platform kills the function (leaving documents orphaned in
// the "extracting" state with no explanation). When we hit this we reject with a
// clear, catchable error so the caller can fall back to manual entry.
const RECOGNIZE_TIMEOUT_MS = 90_000;

// tesseract.js compiles/loads a WASM core. When that core aborts mid-recognition
// (e.g. a SIMD/`DotProductSSE` build mismatch, or OOM) the library rethrows the
// abort via `process.nextTick(() => { throw err })` on the MAIN thread — which a
// normal try/catch around `worker.recognize()` CANNOT catch, so the entire
// function process dies and the request hangs. This guard scopes a temporary
// `uncaughtException` listener to the OCR call: a tesseract/WASM abort becomes a
// catchable rejection (caller degrades to manual entry), while any UNRELATED
// uncaught error is re-thrown so default crash behavior is preserved.
function isTesseractAbort(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Aborted|missing function|RuntimeError|tesseract|wasm/i.test(msg);
}

function runWithCrashGuard<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn2: () => void) => {
      if (settled) return;
      settled = true;
      process.removeListener("uncaughtException", onCrash);
      clearTimeout(timer);
      fn2();
    };
    const onCrash = (err: Error) => {
      if (isTesseractAbort(err)) {
        finish(() => reject(new Error(`${label}: OCR engine crashed (${err.message})`)));
      } else {
        // Not ours — restore default behavior so we never mask real bugs.
        process.removeListener("uncaughtException", onCrash);
        process.nextTick(() => { throw err; });
      }
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error(`${label}: OCR timed out after ${RECOGNIZE_TIMEOUT_MS / 1000}s`))),
      RECOGNIZE_TIMEOUT_MS,
    );
    process.on("uncaughtException", onCrash);
    fn()
      .then((v) => finish(() => resolve(v)))
      .catch((e) => finish(() => reject(e)));
  });
}

// ── Worker lifecycle ────────────────────────────────────────────────────────

async function createBestWorker(): Promise<{ worker: Worker; best: boolean }> {
  try {
    const worker = await createWorker(LANGS, 1, {
      langPath: BEST_LANG_PATH,
      cachePath: CACHE_PATH,
      gzip: true,
    });
    return { worker, best: true };
  } catch {
    // CDN unreachable / model load failed → never regress: use library defaults.
    const worker = await createWorker(LANGS, 1, { cachePath: CACHE_PATH });
    return { worker, best: false };
  }
}

// ── Word collection (tesseract returns nested blocks→paragraphs→lines→words) ──

interface MinimalWord { text: string; confidence: number }

function collectWords(blocks: unknown): MinimalWord[] {
  const out: MinimalWord[] = [];
  if (!Array.isArray(blocks)) return out;
  for (const block of blocks) {
    const paragraphs = (block as { paragraphs?: unknown[] })?.paragraphs ?? [];
    for (const para of paragraphs) {
      const lines = (para as { lines?: unknown[] })?.lines ?? [];
      for (const line of lines) {
        const words = (line as { words?: unknown[] })?.words ?? [];
        for (const w of words) {
          const word = w as { text?: string; confidence?: number };
          if (typeof word.text === "string") {
            out.push({ text: word.text, confidence: Number(word.confidence ?? 0) });
          }
        }
      }
    }
  }
  return out;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Run OCR on a single image buffer. Returns raw text, page-level confidence,
 * and the distinct low-confidence terms to surface for human verification.
 */
export async function runTesseract(
  image: Buffer,
  opts: RunOptions = {}
): Promise<OcrPageResult> {
  const { worker, best } = await createBestWorker();
  try {
    return await runWithCrashGuard("runTesseract", async () => {
    await worker.setParameters({
      tessedit_pageseg_mode: opts.psm ?? PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });

    const words = collectWords((data as { blocks?: unknown }).blocks);
    const lowConfidenceTerms = Array.from(
      new Set(
        words
          .filter(w => w.confidence > 0 && w.confidence < 55)
          .map(w => w.text.trim())
          .filter(t => t.length >= 2 && /[^\d.,:/\\|-]/.test(t))
      )
    ).slice(0, 40);

    return {
      text: data.text ?? "",
      pageConfidence:
        typeof data.confidence === "number" ? clamp01(data.confidence / 100) : 0.5,
      lowConfidenceTerms,
      usedBestModel: best,
    };
    });
  } finally {
    // Best-effort: a crashed worker may already be dead — never let terminate throw.
    try { await worker.terminate(); } catch { /* worker already gone */ }
  }
}
