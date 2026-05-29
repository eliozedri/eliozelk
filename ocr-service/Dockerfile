# Elkayam OCR sidecar — native Tesseract heb+eng baseline, optional PaddleOCR.
#
# Build (baseline, recommended):
#   docker build -t elkayam-ocr ./ocr-service
# Build with PaddleOCR (heavy, optional):
#   docker build --build-arg INSTALL_PADDLE=true -t elkayam-ocr-paddle ./ocr-service
FROM python:3.12-slim

# System OCR engine + Hebrew/English language data + PDF rasterization (poppler).
# These are exactly the system packages Vercel Functions CANNOT install — which is
# why OCR lives here in a container, not in the Vercel app.
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-heb \
        tesseract-ocr-eng \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt requirements-paddle.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Optional PaddleOCR layer — off by default to keep the image small and fast.
ARG INSTALL_PADDLE=false
ENV PADDLE_ENABLED=${INSTALL_PADDLE}
RUN if [ "$INSTALL_PADDLE" = "true" ]; then \
        pip install --no-cache-dir -r requirements-paddle.txt ; \
    fi

COPY app.py ./

# Cloud Run / most hosts inject $PORT. Default 8080 for local docker run.
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
