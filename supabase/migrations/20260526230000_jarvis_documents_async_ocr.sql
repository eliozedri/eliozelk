-- Async OCR worker support for jarvis_documents (additive).
-- status flow: received → queued → processed | failed | needs_media.
-- media_storage_path = path in the private 'jarvis-docs' Storage bucket (persisted at
-- receipt because Meta media URLs expire ~5 min and a cron worker can't re-download).
alter table public.jarvis_documents
  add column if not exists media_storage_path text,
  add column if not exists processed_at        timestamptz,
  add column if not exists ocr_engine          text;
