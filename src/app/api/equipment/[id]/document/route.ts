// Equipment operational-document route (Phase 1 — NON-FINANCIAL only).
// POST   /api/equipment/[id]/document  FormData { file, type, label?, expiry_date? }
// DELETE /api/equipment/[id]/document  JSON { storage_path }
//
// Stores files in the PRIVATE `equipment-documents` bucket (signed URLs) and
// appends an entry to equipment.documents JSONB. No expense/invoice side effects.
// Financial documents are Phase 2.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";
import { validateUploadSignature } from "@/lib/upload/fileValidation";

const BUCKET = "equipment-documents";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
]);
const SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

interface DocEntry {
  type: string;
  label: string;
  url: string;
  storage_path: string;
  expiry_date?: string;
  uploaded_at: string;
}

async function ensureBucket(db: ReturnType<typeof getServiceSupabase>): Promise<void> {
  const { data: buckets } = await db.storage.listBuckets();
  if (buckets?.some(b => b.name === BUCKET)) return;
  await db.storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: Array.from(ALLOWED_TYPES),
    fileSizeLimit: MAX_FILE_SIZE,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const docType = String(formData.get("type") ?? "other").trim() || "other";
  const label = String(formData.get("label") ?? "").trim();
  const expiryDate = String(formData.get("expiry_date") ?? "").trim();

  if (!file) return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `סוג קובץ לא נתמך: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `קובץ גדול מדי. מקסימום ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { data: row, error: fetchErr } = await db.from("equipment").select("id, documents").eq("id", id).single();
  if (fetchErr || !row) return NextResponse.json({ error: "לא נמצא כלי" }, { status: 404 });

  await ensureBucket(db);

  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${id}/${Date.now()}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());
  const sig = validateUploadSignature(Buffer.from(buffer));
  if (!sig.ok) return NextResponse.json({ error: sig.reason }, { status: 400 });
  const { error: upErr } = await db.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `שמירה נכשלה: ${upErr.message}` }, { status: 500 });

  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL);

  const entry: DocEntry = {
    type: docType,
    label: label || file.name,
    url: signed?.signedUrl ?? "",
    storage_path: storagePath,
    uploaded_at: new Date().toISOString(),
    ...(expiryDate ? { expiry_date: expiryDate } : {}),
  };

  const prev = Array.isArray(row.documents) ? (row.documents as DocEntry[]) : [];
  const newDocs = [entry, ...prev];

  const { error: updErr } = await db
    .from("equipment")
    .update({ documents: newDocs, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) {
    await db.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: `עדכון נכשל: ${updErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: entry, documents: newDocs }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: { storage_path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const path = body.storage_path?.trim();
  if (!path) return NextResponse.json({ error: "Missing storage_path" }, { status: 400 });

  const db = getServiceSupabase();
  const { data: row, error: fetchErr } = await db.from("equipment").select("documents").eq("id", id).single();
  if (fetchErr || !row) return NextResponse.json({ error: "לא נמצא כלי" }, { status: 404 });

  await db.storage.from(BUCKET).remove([path]);

  const prev = Array.isArray(row.documents) ? (row.documents as DocEntry[]) : [];
  const newDocs = prev.filter(d => d.storage_path !== path);

  const { error: updErr } = await db
    .from("equipment")
    .update({ documents: newDocs, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: `עדכון נכשל: ${updErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, documents: newDocs });
}
