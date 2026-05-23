import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/apiAuth";
import { buildPostingPreview } from "@/lib/supplierDocuments/posting";

// GET /api/supplier-documents/[id]/preview — posting preview (read-only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getServiceSupabase();

  const preview = await buildPostingPreview(db, id);
  return NextResponse.json(preview);
}
