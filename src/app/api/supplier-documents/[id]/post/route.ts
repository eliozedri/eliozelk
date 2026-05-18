import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { postSupplierDocument } from "@/lib/supplierDocuments/posting";

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = getServiceSupabase();
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// POST /api/supplier-documents/[id]/post — approve and post document
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getServiceSupabase();

  const { data: profile } = await db
    .from("profiles")
    .select("name,role")
    .eq("id", userId)
    .single();
  const p = profile as { name?: string; role?: string } | null;
  const userName = p?.name ?? userId;

  // Permission: finance_manager, procurement_manager, or master can post
  if (!["master", "finance_manager", "procurement_manager"].includes(p?.role ?? "")) {
    return NextResponse.json(
      { error: "אין הרשאה לרשום מסמכים — נדרש: כספים / רכש / מנהל ראשי" },
      { status: 403 }
    );
  }

  const result = await postSupplierDocument(db, id, userName);

  if (!result.success) {
    return NextResponse.json({ error: result.errors.join("; "), result }, { status: 422 });
  }

  return NextResponse.json(result);
}
