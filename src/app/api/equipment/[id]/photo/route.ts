// Equipment photo route — upload/replace + delete.
// POST   /api/equipment/[id]/photo   FormData { file }   → public URL, set as primary
// DELETE /api/equipment/[id]/photo   JSON { url }         → remove a photo
//
// Uses the public `equipment-photos` bucket (pattern mirrors catalog/upload-image).
// Primary photo is photos[0].

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";

const BUCKET = "equipment-photos";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

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

function storagePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
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
  if (!file) return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: `סוג קובץ לא נתמך: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `קובץ חורג ממגבלת ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
  }

  const db = getServiceSupabase();
  const { data: row, error: fetchErr } = await db.from("equipment").select("id, photos").eq("id", id).single();
  if (fetchErr || !row) return NextResponse.json({ error: "לא נמצא כלי" }, { status: 404 });

  await ensureBucket(db);

  const ext = safeExt(file.name, file.type);
  const storagePath = `${id}/${Date.now()}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await db.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `שמירה נכשלה: ${upErr.message}` }, { status: 500 });

  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = pub.publicUrl;

  const prev = Array.isArray(row.photos) ? (row.photos as string[]) : [];
  const newPhotos = [publicUrl, ...prev.filter(u => u !== publicUrl)];

  const { error: updErr } = await db
    .from("equipment")
    .update({ photos: newPhotos, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) {
    await db.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: `עדכון נכשל: ${updErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: publicUrl, photos: newPhotos });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "manage_equipment");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const db = getServiceSupabase();
  const { data: row, error: fetchErr } = await db.from("equipment").select("photos").eq("id", id).single();
  if (fetchErr || !row) return NextResponse.json({ error: "לא נמצא כלי" }, { status: 404 });

  const prev = Array.isArray(row.photos) ? (row.photos as string[]) : [];
  const newPhotos = prev.filter(u => u !== url);

  const path = storagePathFromUrl(url);
  if (path) await db.storage.from(BUCKET).remove([path]);

  const { error: updErr } = await db
    .from("equipment")
    .update({ photos: newPhotos, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: `עדכון נכשל: ${updErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, photos: newPhotos });
}
