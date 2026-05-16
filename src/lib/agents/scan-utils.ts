// Shared scan utilities for all agent scan routes.
// All writes go through these functions to ensure consistent deduplication,
// audit logging, and activity feed entries.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DedupeMap, DetectedIssue, DetectedTask, ScanResult } from "./types";

// ── Deduplication key ─────────────────────────────────────────────────────────

export function dedupeKey(category: string, entityType: string, entityId: string): string {
  return `${category}:${entityType}:${entityId}`;
}

// ── Load all open exceptions for an agent into a dedupe map ──────────────────

export async function loadAgentExceptionDedupeMap(
  db: SupabaseClient,
  agentId: string
): Promise<DedupeMap> {
  const { data, error } = await db
    .from("agent_exceptions")
    .select("id, category, related_entity_type, related_entity_id, status")
    .eq("agent_id", agentId)
    .in("status", ["open", "acknowledged"]);

  if (error) throw new Error(`loadDedupeMap: ${error.message}`);

  const map: DedupeMap = new Map();
  for (const row of data ?? []) {
    const k = dedupeKey(
      row.category as string,
      (row.related_entity_type as string) ?? "",
      (row.related_entity_id as string) ?? ""
    );
    map.set(k, { id: row.id as string, status: row.status as string });
  }
  return map;
}

// ── Create or update a single exception ──────────────────────────────────────

export async function upsertException(
  db: SupabaseClient,
  agentId: string,
  issue: DetectedIssue,
  dedupeMap: DedupeMap,
  result: ScanResult
): Promise<string | null> {
  const k = dedupeKey(issue.category, issue.entityType, issue.entityId);
  const existing = dedupeMap.get(k);

  if (existing) {
    // Update source data and bump updated_at — do NOT duplicate
    await db
      .from("agent_exceptions")
      .update({
        title: issue.title,
        description: issue.description,
        severity: issue.severity,
        detected_from_data: issue.detectedFromData ?? null,
        recommended_resolution: issue.recommendedResolution ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    result.exceptionsUpdated++;
    dedupeMap.set(k, { ...existing }); // keep in map as still-active
    return existing.id;
  }

  // Insert new
  const { data: inserted, error } = await db
    .from("agent_exceptions")
    .insert({
      agent_id: agentId,
      severity: issue.severity,
      category: issue.category,
      related_entity_type: issue.entityType,
      related_entity_id: issue.entityId,
      title: issue.title,
      description: issue.description,
      detected_from_data: issue.detectedFromData ?? null,
      recommended_resolution: issue.recommendedResolution ?? null,
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    result.errors.push(`upsertException(${issue.category}/${issue.entityId}): ${error.message}`);
    return null;
  }

  result.exceptionsCreated++;
  dedupeMap.set(k, { id: inserted.id as string, status: "open" });
  return inserted.id as string;
}

// ── Auto-resolve exceptions whose source issues no longer exist ───────────────

export async function autoResolveStaleExceptions(
  db: SupabaseClient,
  agentId: string,
  stillActiveKeys: Set<string>,
  dedupeMap: DedupeMap,
  result: ScanResult
): Promise<void> {
  const toResolve: string[] = [];

  for (const [k, exc] of dedupeMap) {
    if (!stillActiveKeys.has(k) && exc.status === "open") {
      toResolve.push(exc.id);
    }
  }

  if (toResolve.length === 0) return;

  const { error } = await db
    .from("agent_exceptions")
    .update({ status: "resolved", updated_at: new Date().toISOString() })
    .in("id", toResolve);

  if (error) {
    result.errors.push(`autoResolve: ${error.message}`);
    return;
  }

  result.exceptionsResolved += toResolve.length;
}

// ── Task deduplication (open tasks) ──────────────────────────────────────────

export type TaskDedupeMap = Map<string, { id: string; status: string }>;

export async function loadAgentTaskDedupeMap(
  db: SupabaseClient,
  agentId: string
): Promise<TaskDedupeMap> {
  const { data, error } = await db
    .from("agent_tasks")
    .select("id, title, related_entity_type, related_entity_id, status")
    .eq("agent_id", agentId)
    .in("status", ["open", "in_progress"]);

  if (error) throw new Error(`loadTaskDedupeMap: ${error.message}`);

  const map: TaskDedupeMap = new Map();
  for (const row of data ?? []) {
    // Key: category implied by title + entityType + entityId
    const k = `${row.related_entity_type}:${row.related_entity_id}:${row.title}`;
    map.set(k, { id: row.id as string, status: row.status as string });
  }
  return map;
}

export async function upsertTask(
  db: SupabaseClient,
  agentId: string,
  task: DetectedTask,
  taskDedupeMap: TaskDedupeMap,
  result: ScanResult
): Promise<string | null> {
  const k = `${task.entityType}:${task.entityId}:${task.title}`;
  const existing = taskDedupeMap.get(k);

  if (existing) {
    await db
      .from("agent_tasks")
      .update({
        description: task.description,
        priority: task.priority,
        recommended_action: task.recommendedAction ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    result.tasksUpdated++;
    return existing.id;
  }

  const { data: inserted, error } = await db
    .from("agent_tasks")
    .insert({
      agent_id: agentId,
      related_entity_type: task.entityType,
      related_entity_id: task.entityId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: "open",
      recommended_action: task.recommendedAction ?? null,
      requires_approval: task.requiresApproval ?? false,
      assigned_to: task.assignedTo ?? null,
    })
    .select("id")
    .single();

  if (error) {
    result.errors.push(`upsertTask(${task.title}/${task.entityId}): ${error.message}`);
    return null;
  }

  result.tasksCreated++;
  taskDedupeMap.set(k, { id: inserted.id as string, status: "open" });
  return inserted.id as string;
}

// ── Write agent activity ──────────────────────────────────────────────────────

export async function writeAgentActivity(
  db: SupabaseClient,
  agentId: string,
  messageType: string,
  content: string,
  payload?: Record<string, unknown>
): Promise<void> {
  await db.from("agent_activity_feed").insert({
    agent_id: agentId,
    message_type: messageType,
    content,
    structured_payload: payload ?? null,
  });
}

// ── Update agent run status ───────────────────────────────────────────────────

export async function updateAgentRunStatus(
  db: SupabaseClient,
  agentId: string,
  status: "active" | "idle" | "error"
): Promise<void> {
  await db
    .from("agents")
    .update({ status, last_run_at: new Date().toISOString() })
    .eq("id", agentId);
}

// ── Log agent action ──────────────────────────────────────────────────────────

export async function logAgentAction(
  db: SupabaseClient,
  agentId: string,
  actionType: string,
  payload: Record<string, unknown>,
  result: "success" | "error",
  errorMessage?: string
): Promise<void> {
  await db.from("agent_action_logs").insert({
    agent_id: agentId,
    action_type: actionType,
    action_payload: payload,
    result,
    error_message: errorMessage ?? null,
  });
}

// ── Hours since timestamp ─────────────────────────────────────────────────────

export function hoursSince(ts: string | null | undefined, nowMs = Date.now()): number {
  if (!ts) return 0;
  return (nowMs - new Date(ts).getTime()) / 3_600_000;
}

// ── Verify auth and role ──────────────────────────────────────────────────────
// Returns user.id if authenticated and has an allowed role, null otherwise.

export async function verifyMasterAuth(
  serviceDb: SupabaseClient,
  accessToken: string | undefined
): Promise<string | null> {
  if (!accessToken) return null;

  const { data: { user }, error } = await serviceDb.auth.getUser(accessToken);
  if (error || !user) return null;

  const { data: profile } = await serviceDb
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  if (!["master", "office_manager", "finance_manager"].includes(profile.role as string)) return null;

  return user.id;
}
