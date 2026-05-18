import { NextResponse } from "next/server";
import { getSapEnvStatus, loadSapConfig, SapAuthError } from "@/lib/sap/config";
import { login, logout, safeGet } from "@/lib/sap/client";
import type { SapODataResponse, SapBusinessPartner } from "@/lib/sap/types";

export async function GET(): Promise<NextResponse> {
  const env = getSapEnvStatus();
  const now = new Date().toISOString();

  const base = {
    mode: env.mode,
    env_vars_present: env.allPresent,
    url_reachable: null as boolean | null,
    login_success: null as boolean | null,
    sample_read_success: null as boolean | null,
    sample_entity: null as string | null,
    sample_count: null as number | null,
    checked_at: now,
    error: null as string | null,
  };

  if (env.mode === "disabled") return NextResponse.json(base);

  if (!env.allPresent) {
    return NextResponse.json({
      ...base,
      error: `Missing env vars: ${env.missing.join(", ")}`,
    });
  }

  if (env.mode === "write_test" || env.mode === "write_prod") {
    return NextResponse.json({
      ...base,
      error: `SAP mode '${env.mode}' is reserved and not yet enabled`,
    });
  }

  const config = loadSapConfig();

  let session;
  try {
    session = await login(config);
    base.url_reachable = true;
    base.login_success = true;
  } catch (err) {
    base.url_reachable = err instanceof SapAuthError && err.isNetworkError ? false : true;
    base.login_success = false;
    base.error = err instanceof Error ? err.message : String(err);
    return NextResponse.json(base);
  }

  try {
    const res = await safeGet<SapODataResponse<SapBusinessPartner>>(
      "/BusinessPartners?$top=1",
      session,
    );
    base.sample_read_success = true;
    base.sample_entity = "BusinessPartners";
    base.sample_count = res.value.length;
  } catch (err) {
    base.sample_read_success = false;
    base.error = err instanceof Error ? err.message : String(err);
  } finally {
    await logout(session);
  }

  return NextResponse.json(base);
}
