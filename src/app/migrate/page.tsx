"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// One-time data migration from localStorage to Supabase — completed.
// All operational data now lives in Supabase. This page is a no-op redirect.
export default function MigratePage() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return null;
}
