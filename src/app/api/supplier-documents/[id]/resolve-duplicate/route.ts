// Resolve a suspected-duplicate financial document with a full audit trail.
// POST /api/supplier-documents/[id]/resolve-duplicate
//   body: { action: "override" | "link_existing" | "reject",
//           reason?: string, linkedDocumentId?: string,
//           matchScore?: number, similarDocumentIds?: string[] }
//
// "override"      → keep as a new document (save anyway). Requires override_duplicate.
// "link_existing" → archive this document and point it at the existing one.
// "reject"        → reject this document.
// Every path writes a document_review_events row recording who/when/why.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAction } from "@/lib/auth/apiAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAction(req, "override_duplicate");
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = getServiceSupabase();
  const { data: profile } = await db.from("profiles").select("name").eq("id", auth.user.id).single();
  const userName = (profile as { name?: string } | null)?.name ?? auth.user.id;

  let body: { action?: string; reason?: string; linkedDocumentId?: string; matchScore?: number; similarDocumentIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { data: existing } = await db.from("supplier_documents").select("id,status").eq("id", id).single();
  if (!existing) return NextResponse.json({ error: "מסמך לא נמצא" }, { status: 404 });

  const now = new Date().toISOString();
  const action = body.action ?? "override";
  let newStatus: string;
  let eventType: string;
  let notes: string;

  if (action === "override") {
    newStatus = "draft_ready";
    eventType = "duplicate_overridden";
    notes = `אושר כמסמך חדש למרות חשד לכפילות. סיבה: ${body.reason ?? "לא צוינה"}.` +
            (body.matchScore != null ? ` רמת התאמה: ${Math.round(body.matchScore * 100)}%.` : "") +
            (body.similarDocumentIds?.length ? ` מסמכים דומים: ${body.similarDocumentIds.join(", ")}.` : "");
    // Mark the recorded duplicate checks as override-approved
    await db.from("document_duplicate_checks").update({
      override_approved: true, resolved_by: userName, resolved_at: now,
    }).eq("document_id", id);
  } else if (action === "link_existing") {
    newStatus = "archived";
    eventType = "duplicate_linked_to_existing";
    notes = `אוחד עם מסמך קיים${body.linkedDocumentId ? ` (${body.linkedDocumentId})` : ""}. סיבה: ${body.reason ?? "כפילות"}.`;
  } else if (action === "reject") {
    newStatus = "rejected";
    eventType = "duplicate_rejected";
    notes = `נדחה כמסמך כפול. סיבה: ${body.reason ?? "כפילות"}.`;
  } else {
    return NextResponse.json({ error: "פעולה לא חוקית" }, { status: 400 });
  }

  const upd: Record<string, unknown> = { status: newStatus, updated_at: now, reviewed_by: userName };
  if (action === "reject" && body.reason) upd.rejection_reason = body.reason;
  const { error: updErr } = await db.from("supplier_documents").update(upd).eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await db.from("document_review_events").insert({
    document_id: id,
    event_type:  eventType,
    notes,
    created_by:  userName,
    created_at:  now,
  });

  return NextResponse.json({ ok: true, status: newStatus });
}
