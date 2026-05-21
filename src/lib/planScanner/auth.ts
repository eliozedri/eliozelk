import { NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { canAccessTab } from "@/types/auth";
import type { UserProfile } from "@/types/auth";

export async function getPlanScannerUser(req: NextRequest): Promise<UserProfile | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const db = getServiceSupabase();
  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return null;

  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile) return null;

  const typedProfile = profile as UserProfile;
  if (!canAccessTab(typedProfile, "plan-scanner")) return null;

  return typedProfile;
}
