import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only business context providers. Before an agent reasons, it gets a
 * compact, summarized snapshot of the REAL system state for its domain — so it
 * manages, not just talks. STRICTLY read-only: no mutation, no secrets, no
 * service-role keys, no raw sensitive logs. If a source/table is missing, it
 * returns "context unavailable" honestly (never fabricated).
 */

export interface AgentContext {
  agent_id: string;
  available: boolean;
  /** One-line Hebrew summary fed into the reasoning prompt. */
  summary: string;
  /** Structured snapshot for the dashboard. */
  details: Record<string, unknown>;
}

async function count(
  supabase: SupabaseClient,
  table: string,
  build: (q: ReturnType<SupabaseClient["from"]> extends infer T ? any : never) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number | null> {
  try {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    q = build(q);
    const { count: c, error } = await q;
    return error ? null : (c ?? 0);
  } catch {
    return null;
  }
}

const CMD = "jarvis_ceo_agent_commands";

export async function getAgentContext(supabase: SupabaseClient, agentId: string): Promise<AgentContext> {
  try {
    if (agentId === "ceo") {
      const [open, needsInfo, pendingApproval, highRisk, gaps] = await Promise.all([
        count(supabase, CMD, (q) => q.in("status", ["pending_review", "needs_info", "preview_ready", "execution_approved"])),
        count(supabase, CMD, (q) => q.eq("status", "needs_info")),
        count(supabase, CMD, (q) => q.in("status", ["preview_ready", "execution_approved"])),
        count(supabase, CMD, (q) => q.eq("risk_level", "high")),
        count(supabase, CMD, (q) => q.eq("status", "capability_gap")),
      ]);
      return {
        agent_id: agentId,
        available: open !== null,
        summary: `בקשות פתוחות: ${open ?? "—"} · ממתינות למידע: ${needsInfo ?? "—"} · ממתינות לאישור: ${pendingApproval ?? "—"} · סיכון גבוה: ${highRisk ?? "—"} · פערי יכולת: ${gaps ?? "—"}.`,
        details: { open_requests: open, needs_info: needsInfo, pending_approval: pendingApproval, high_risk: highRisk, capability_gaps: gaps, internal_agents: ["operations_manager", "catalog_manager", "system_admin"] },
      };
    }

    if (agentId === "operations_manager") {
      const [routed, open] = await Promise.all([
        count(supabase, CMD, (q) => q.eq("routed_to_agent", "operations_manager")),
        count(supabase, CMD, (q) => q.eq("routed_to_agent", "operations_manager").in("status", ["pending_review", "needs_info"])),
      ]);
      return {
        agent_id: agentId, available: routed !== null,
        summary: `בקשות תפעול שנותבו אליי: ${routed ?? "—"} (פתוחות: ${open ?? "—"}).`,
        details: { routed_to_me: routed, open: open },
      };
    }

    if (agentId === "catalog_manager") {
      const [activeTotal, inactive, withPrice, routed] = await Promise.all([
        count(supabase, "catalog_items", (q) => q.eq("is_active", true)),
        count(supabase, "catalog_items", (q) => q.eq("is_active", false)),
        count(supabase, "catalog_items", (q) => q.eq("is_active", true).not("default_price", "is", null)),
        count(supabase, CMD, (q) => q.eq("routed_to_agent", "catalog_manager")),
      ]);
      const withoutPrice = activeTotal !== null && withPrice !== null ? activeTotal - withPrice : null;
      return {
        agent_id: agentId, available: activeTotal !== null,
        summary: `מוצרים פעילים: ${activeTotal ?? "—"} · לא פעילים: ${inactive ?? "—"} · עם מחיר: ${withPrice ?? "—"} · ללא מחיר: ${withoutPrice ?? "—"} · בקשות קטלוג שנותבו אליי: ${routed ?? "—"}.`,
        details: { active_items: activeTotal, inactive_items: inactive, with_price: withPrice, without_price: withoutPrice, routed_to_me: routed, executable_tools: ["price_update_percentage"] },
      };
    }

    if (agentId === "system_admin") {
      // Feature-flag NAMES only — never values/secrets.
      const flagNames = Object.keys(process.env)
        .filter((k) => /^(JARVIS_|ELKAYAM_)/.test(k) && /(ENABLED|FLAG|LIVE|DRY_RUN|PRIORITY)/.test(k))
        .sort();
      const recent = await count(supabase, CMD, (q) => q.gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString()));
      return {
        agent_id: agentId, available: true,
        summary: `דגלי תצורה (שמות בלבד): ${flagNames.length} · בקשות ב-24ש': ${recent ?? "—"}. (ללא חשיפת ערכים/secrets)`,
        details: { feature_flag_names: flagNames, requests_last_24h: recent },
      };
    }

    return { agent_id: agentId, available: false, summary: "context unavailable (סוכן לא מוכר).", details: {} };
  } catch {
    return { agent_id: agentId, available: false, summary: "context unavailable.", details: {} };
  }
}
