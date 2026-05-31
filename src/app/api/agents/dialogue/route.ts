// Inter-agent LLM dialogue — master-gated, RECOMMENDATION-ONLY.
//
// Flow: an open issue (agent_exception) or free text →
//   1) CEO agent reasons (LLM, via reasonAsAgent) → triage + route to a department role
//   2) the routed department agent reasons (LLM, grounded in its read-only context)
//      → recommendation / needs_info / approval_request
//   3) both turns are persisted as a visible source→target thread (agent_activity_feed
//      with related_agent_id) — shown in the Command Center "תקשורת בין סוכנים" view
//   4) if the department flags approval/needs_info/high-risk (or the LLM is
//      unavailable), an assigned human-review task is created.
//
// SAFETY: reasonAsAgent NEVER executes/writes/SQL — analysis/route/propose only.
// This route writes ONLY agent metadata (activity feed + a review task). No business
// mutation, no auto-linking, no billing/approval state change. Null-safe: if no LLM
// provider is configured it falls back to a deterministic handoff (honest), never a
// fake answer.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { verifyMasterAuth, writeAgentActivity } from "@/lib/agents/scan-utils";
import { reasonAsAgent, type AgentReasoningResult } from "@/lib/jarvis/agentReasoning";
import { INTERNAL_AGENT_IDS, scannerAgentForRole, getAgentRole } from "@/lib/jarvis/agentRoles";

export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string | undefined {
  const t = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return t.length > 0 ? t : undefined;
}

// Deterministic category → department role fallback (used when the CEO LLM doesn't
// return a routable role, so routing still happens honestly without the LLM).
function inferRole(category: string | null, agentId: string | null): string | null {
  const c = (category ?? "").toLowerCase();
  const a = (agentId ?? "").toLowerCase();
  if (a.includes("cfo") || a.includes("billing") || c.includes("billing") || c.includes("invoice") || c.includes("finance")) return "finance_manager";
  if (a.includes("equipment") || a.includes("fleet") || c.includes("license") || c.includes("insurance") || c.includes("inspection") || c.includes("document")) return "fleet_manager";
  if (a.includes("inventory") || c.includes("stock") || c.includes("inventory")) return "warehouse_manager";
  if (a.includes("graphics") || c.includes("design") || c.includes("graphics") || c.includes("spec")) return "graphics_manager";
  if (a.includes("fabrication") || c.includes("fabrication")) return "fabrication_manager";
  if (a.includes("coordination") || c.includes("schedul") || c.includes("dispatch") || c.includes("gate")) return "coordination_qa_manager";
  if (a.includes("orders") || c.includes("order") || c.includes("draft") || c.includes("intake")) return "orders_manager";
  if (a.includes("catalog") || c.includes("price") || c.includes("catalog")) return "catalog_manager";
  return "operations_manager";
}

interface DialogueBody { exceptionId?: string; text?: string }

export async function POST(req: NextRequest) {
  const db = getServiceSupabase();
  const userId = await verifyMasterAuth(db, bearer(req));
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: DialogueBody = {};
  try { body = (await req.json()) as DialogueBody; } catch { /* allow empty */ }

  // ── Resolve the issue context (read-only) ──
  let issueText = (body.text ?? "").trim();
  let relatedType: string | null = null;
  let relatedId: string | null = null;
  let category: string | null = null;
  let sourceAgentId: string | null = null;

  if (body.exceptionId) {
    const { data: exc } = await db
      .from("agent_exceptions")
      .select("id, agent_id, severity, category, title, description, related_entity_type, related_entity_id, recommended_resolution")
      .eq("id", body.exceptionId)
      .maybeSingle();
    if (!exc) return NextResponse.json({ error: "exception_not_found" }, { status: 404 });
    category = (exc.category as string) ?? null;
    sourceAgentId = (exc.agent_id as string) ?? null;
    relatedType = (exc.related_entity_type as string) ?? "agent_exception";
    relatedId = (exc.related_entity_id as string) ?? (exc.id as string);
    issueText = `${exc.title ?? "חריגה"}: ${exc.description ?? ""} (חומרה: ${exc.severity ?? "?"}, מקור: ${exc.agent_id ?? "?"})`;
  }
  if (!issueText) return NextResponse.json({ error: "no_issue (provide exceptionId or text)" }, { status: 400 });

  const businessContext = `סוגיה לבדיקה: ${issueText}` + (relatedId ? ` | רשומה קשורה: ${relatedType}:${relatedId}` : "");

  // ── 1) CEO triage (LLM; null-safe) ──
  let ceo: AgentReasoningResult | null = null;
  try {
    ceo = await reasonAsAgent({
      agentId: "ceo",
      userRequest: `נותחה סוגיה תפעולית. החלט לאיזה סוכן מחלקה לנתב ומדוע, וזהה סיכון/מידע חסר.\n${issueText}`,
      businessContext,
      sourceAgent: "system",
      canRouteInternally: true,
    });
  } catch { ceo = null; }

  const routedRole =
    (ceo?.routed_to_agent && INTERNAL_AGENT_IDS.includes(ceo.routed_to_agent)) ? ceo.routed_to_agent : inferRole(category, sourceAgentId);
  const targetScanner = scannerAgentForRole(routedRole);
  const ceoText = ceo?.message_text?.trim() || `נדרשת בדיקת מחלקה: ${issueText}`;
  const llmUsed = Boolean(ceo?.llm_used);

  // Persist CEO → department handoff (visible source→target).
  await writeAgentActivity(
    db, "ceo", "directive",
    `CEO → ${getAgentRole(routedRole ?? "")?.name ?? targetScanner}: ${ceoText}`,
    { issue: issueText, routedRole, llmUsed, provider: ceo?.provider ?? null, risk: ceo?.risk_level ?? null },
    { relatedAgentId: targetScanner, relatedEntityType: relatedType ?? "agent_exception", relatedEntityId: relatedId ?? undefined },
  );

  // ── 2) Department agent reasons (LLM; null-safe) ──
  let dept: AgentReasoningResult | null = null;
  if (routedRole) {
    try {
      dept = await reasonAsAgent({
        agentId: routedRole,
        userRequest: `הנחיית ה-CEO: ${ceoText}\nהסוגיה: ${issueText}\nנתח והחזר המלצה / מידע חסר / בקשת אישור. אל תבצע פעולה.`,
        businessContext,
        sourceAgent: "ceo",
      });
    } catch { dept = null; }
  }
  const deptText = dept?.message_text?.trim() || "התקבלה ההנחיה — נדרשת בדיקה אנושית של הסוגיה (אין כרגע ניתוח אוטומטי זמין).";

  // Persist department → CEO response (visible source→target).
  await writeAgentActivity(
    db, targetScanner, dept?.message_type === "approval_request" ? "approval_request" : "recommendation",
    `${getAgentRole(routedRole ?? "")?.name ?? targetScanner} → CEO: ${deptText}`,
    { reasoning: dept?.reasoning_summary ?? null, llmUsed: Boolean(dept?.llm_used), provider: dept?.provider ?? null, risk: dept?.risk_level ?? null },
    { relatedAgentId: "ceo", relatedEntityType: relatedType ?? "agent_exception", relatedEntityId: relatedId ?? undefined },
  );

  // ── 3) Create a human-review task when action/approval/info is needed (or LLM down) ──
  const needsTask = !dept || dept.needs_info || dept.approval_required || dept.risk_level === "high";
  let taskCreated = false;
  if (needsTask) {
    const title = `סוגיה בטיפול ${getAgentRole(routedRole ?? "")?.name ?? targetScanner} — בדיקה אנושית`;
    try {
      const { data: existing } = await db
        .from("agent_tasks")
        .select("id")
        .eq("agent_id", targetScanner)
        .eq("related_entity_id", relatedId ?? issueText.slice(0, 80))
        .eq("title", title)
        .in("status", ["open", "in_progress"])
        .limit(1)
        .maybeSingle();
    const payload = {
        agent_id: targetScanner,
        related_entity_type: relatedType ?? "agent_exception",
        related_entity_id: relatedId ?? issueText.slice(0, 80),
        title,
        description: `${deptText} | הנחיית CEO: ${ceoText}`.slice(0, 1000),
        priority: dept?.risk_level === "high" ? "critical" : "high",
        status: "open",
        recommended_action: dept?.approval_required ? "דרוש אישור בעלים לפני ביצוע" : "בצע בדיקה אנושית והשלם/אשר",
        requires_approval: Boolean(dept?.approval_required),
        assigned_to: targetScanner,
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) await db.from("agent_tasks").update(payload).eq("id", existing.id);
      else await db.from("agent_tasks").insert(payload);
      taskCreated = true;
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    issue: issueText,
    llmUsed,
    provider: ceo?.provider ?? dept?.provider ?? null,
    ceo: { messageText: ceoText, routedRole, risk: ceo?.risk_level ?? null },
    department: routedRole
      ? { role: routedRole, agent: targetScanner, messageText: deptText, messageType: dept?.message_type ?? "needs_review",
          needsInfo: Boolean(dept?.needs_info), approvalRequired: Boolean(dept?.approval_required), risk: dept?.risk_level ?? null }
      : null,
    reviewTaskCreated: taskCreated,
    note: llmUsed ? undefined : "מנוע ה-LLM לא היה זמין — בוצעה מסירה דטרמיניסטית + משימת בדיקה אנושית (ללא תשובה מומצאת).",
  }, { headers: { "Cache-Control": "no-store" } });
}
