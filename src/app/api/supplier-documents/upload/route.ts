// File upload route for supplier documents.
// Accepts multipart/form-data, stores file in Supabase Storage,
// creates a supplier_document record, and returns the document ID.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { classifyDocumentType } from "@/lib/supplierDocuments/classification";

const BUCKET = "supplier-documents";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
]);

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = getServiceSupabase();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

async function ensureBucket(db: ReturnType<typeof getServiceSupabase>): Promise<void> {
  const { data: buckets } = await db.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET);
  if (!exists) {
    await db.storage.createBucket(BUCKET, {
      public: false,
      allowedMimeTypes: Array.from(ALLOWED_TYPES),
      fileSizeLimit: MAX_FILE_SIZE,
    });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getServiceSupabase();
  const { data: profile } = await db
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .single();
  const createdBy = (profile as { name?: string } | null)?.name ?? userId;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "לא ניתן לקרוא את הקובץ" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `סוג קובץ לא נתמך: ${file.type}. נתמך: PDF, JPEG, PNG, WEBP, TIFF` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `קובץ גדול מדי (${Math.round(file.size / 1024 / 1024)}MB). מקסימום: 20MB` },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Compute SHA-256 for duplicate detection
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  // Check for exact duplicate by hash before storing
  const { data: existing } = await db
    .from("supplier_documents")
    .select("id,status,document_number,supplier_name_raw")
    .eq("file_hash", fileHash)
    .not("status", "in", '("rejected","archived")')
    .limit(1)
    .single();

  if (existing) {
    const ex = existing as { id: string; status: string; document_number: string; supplier_name_raw: string };
    return NextResponse.json(
      {
        error: "קובץ זהה כבר קיים במערכת",
        existingDocumentId: ex.id,
        existingStatus: ex.status,
        existingDocNumber: ex.document_number,
      },
      { status: 409 }
    );
  }

  // Ensure bucket exists
  await ensureBucket(db);

  const docId = nanoid();
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${new Date().getFullYear()}/${docId}.${ext}`;

  // Upload to Supabase Storage
  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `שגיאה בהעלאת קובץ: ${uploadErr.message}` },
      { status: 500 }
    );
  }

  // Get public/signed URL
  const { data: urlData } = await db.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365); // 1 year

  const fileUrl = urlData?.signedUrl ?? null;

  // Try basic text classification from filename
  const filenameText = file.name.toLowerCase();
  const classification = classifyDocumentType(filenameText);

  const now = new Date().toISOString();

  // Create document record
  const { error: insertErr } = await db.from("supplier_documents").insert({
    id:            docId,
    status:        "draft_ready",
    document_type: classification.type,
    supplier_name_raw: "",
    supplier_vat_raw:  "",
    document_number:   "",
    currency:      "ILS",
    payment_status: "unpaid",
    linked_order_ref: "",
    notes:         "",
    file_url:      fileUrl,
    file_name:     file.name,
    file_type:     file.type,
    file_hash:     fileHash,
    extraction_confidence: classification.confidence,
    extraction_notes: "הועלה — ממתין להזנה ידנית",
    created_by:    createdBy,
    created_at:    now,
    updated_at:    now,
  });

  if (insertErr) {
    // Best-effort cleanup of uploaded file
    await db.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: docId, fileUrl }, { status: 201 });
}
