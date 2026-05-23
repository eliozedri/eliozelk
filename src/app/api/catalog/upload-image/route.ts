/**
 * POST /api/catalog/upload-image
 *   FormData { file: File, productId: string }
 *
 * Uploads a product image to the `catalog-product-images` Supabase Storage
 * bucket (public) and updates `catalog_items.metadata.images` on the row:
 *   - thumb / full / original  → new public URL
 *   - image_status             → "manually_uploaded"
 *   - is_branded               → false
 *   - uploaded_by              → authenticated user id
 *   - uploaded_at              → ISO timestamp
 * Wipes the row's image_match_* keys since manual upload supersedes them.
 *
 * Returns { thumbUrl, fullUrl, originalUrl, storagePath }.
 *
 * DELETE /api/catalog/upload-image
 *   FormData { productId: string }
 *
 * Clears the row's image metadata and resets image_status to
 * "needs_real_product_image". Best-effort removes the stored object.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

const BUCKET = "catalog-product-images";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
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
  if (buckets?.some(b => b.name === BUCKET)) return;
  await db.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: Array.from(ALLOWED_TYPES),
    fileSizeLimit: MAX_FILE_SIZE,
  });
}

function safeExt(filename: string, mime: string): string {
  const m = (filename.match(/\.(jpe?g|png|webp)$/i) ?? [])[1];
  if (m) return m.toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const productId = (formData.get("productId") as string | null)?.trim() ?? "";
  if (!file)       return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  if (!productId)  return NextResponse.json({ error: "Missing productId" }, { status: 400 });

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `סוג קובץ לא נתמך: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `קובץ חורג ממגבלת ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
  }

  const db = getServiceSupabase();

  // Verify product exists (and grab existing metadata)
  const { data: row, error: fetchErr } = await db
    .from("catalog_items")
    .select("id, metadata")
    .eq("id", productId)
    .single();
  if (fetchErr || !row) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  await ensureBucket(db);

  // Path layout: <productId>/<timestamp>.<ext>
  const ext = safeExt(file.name, file.type);
  const ts  = Date.now();
  const storagePath = `${productId}/${ts}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  const { error: upErr } = await db.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: `שמירה נכשלה: ${upErr.message}` }, { status: 500 });
  }

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = pub.publicUrl;

  // Update row metadata. Keep specs, sources, variants, etc.; replace images block.
  const existingMeta = (row.metadata as Record<string, unknown>) ?? {};
  const newMeta: Record<string, unknown> = {
    ...existingMeta,
    images: {
      thumb:        publicUrl,
      full:         publicUrl,
      original:     publicUrl,
      image_status: "manually_uploaded",
      is_branded:   false,
      crop_status:  "pending",
      source_type:  "manual_upload",
      storage_path: storagePath,
      uploaded_by:  userId,
      uploaded_at:  new Date().toISOString(),
    },
    image_match_type: "manually_uploaded",
  };
  // Drop stale automatic-match metadata
  for (const k of [
    "image_enriched_from", "image_enriched_from_website", "image_match_score",
    "image_match_slug", "image_match_pdf_page", "image_match_hint", "image_match_tier",
    "image_match_confidence",
  ]) {
    delete newMeta[k];
  }
  // Manual upload clears the review_state if it was set to image_needs_replacement
  if (existingMeta.review_state === "image_needs_replacement") {
    delete newMeta.review_state;
  }

  const { error: updErr } = await db
    .from("catalog_items")
    .update({ metadata: newMeta, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (updErr) {
    // Roll back the storage upload to keep things consistent
    await db.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: `Update failed: ${updErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok:           true,
    thumbUrl:     publicUrl,
    fullUrl:      publicUrl,
    originalUrl:  publicUrl,
    storagePath,
  });
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const productId = body.productId?.trim() ?? "";
  if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });

  const db = getServiceSupabase();
  const { data: row, error: fetchErr } = await db
    .from("catalog_items")
    .select("metadata")
    .eq("id", productId)
    .single();
  if (fetchErr || !row) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const existingMeta = (row.metadata as Record<string, unknown>) ?? {};
  const existingImages = (existingMeta.images as Record<string, unknown> | undefined) ?? {};
  const oldStoragePath = existingImages.storage_path as string | undefined;

  // Best-effort: remove the stored object only if it lived in our bucket
  if (oldStoragePath) {
    await db.storage.from(BUCKET).remove([oldStoragePath]);
  }

  const newMeta: Record<string, unknown> = {
    ...existingMeta,
    images: {
      thumb:        null,
      full:         null,
      original:     null,
      image_status: "needs_real_product_image",
      is_branded:   false,
      cleared_by:   userId,
      cleared_at:   new Date().toISOString(),
    },
    image_match_type: "needs_real_product_image",
    review_state:     "image_needs_replacement",
  };
  for (const k of [
    "image_enriched_from", "image_enriched_from_website", "image_match_score",
    "image_match_slug", "image_match_pdf_page", "image_match_hint", "image_match_tier",
    "image_match_confidence",
  ]) {
    delete newMeta[k];
  }

  const { error: updErr } = await db
    .from("catalog_items")
    .update({ metadata: newMeta, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (updErr) {
    return NextResponse.json({ error: `Clear failed: ${updErr.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
