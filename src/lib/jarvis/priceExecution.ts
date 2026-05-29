import { DEPARTMENTS, categoryToDepartment, type DepartmentSlug } from "@/lib/catalog/departments";
import { resolveActionType } from "./actionCatalog";

export const CANONICAL_ACTION = "price_update_percentage";

/**
 * Tier-B controlled execution for the ONLY allowlisted action:
 * price_update_request (bulk percentage price update on a department).
 *
 * Hard safety model:
 *   • Allowlist of one action. Unknown actions are rejected.
 *   • Percentage validated to a sane range; 0 / NaN rejected.
 *   • Mutates ONLY catalog_items.default_price (sell price) — never cost_price,
 *     quantities, or any other table/column. This is enforced structurally: the
 *     only mutation primitive is ExecDb.updatePrice(id, price).
 *   • Preview (dry-run) computes affected rows + a rollback snapshot WITHOUT any
 *     mutation. Execution refuses to run without a stored preview AND a second
 *     (execution) approval. Revert writes the snapshot back.
 *
 * The DB surface is injected (ExecDb) so this is fully unit-testable and so the
 * mutation surface is a single, reviewable seam.
 */

export const ALLOWED_ACTIONS = new Set(["price_update_request"]);
export const MIN_PCT = -50;
export const MAX_PCT = 50;
export const PRICE_COLUMN = "default_price" as const;

export interface CatalogRow {
  id: string;
  name: string;
  category: string;
  default_price: number | null;
}

/** The ONLY database operations Tier-B may perform. */
export interface ExecDb {
  selectActiveCatalog(): Promise<{ data: CatalogRow[] | null; error: { message: string } | null }>;
  /** Updates ONLY catalog_items.default_price for one row. */
  updatePrice(id: string, price: number): Promise<{ error: { message: string } | null }>;
}

export interface CommandLike {
  status: string;
  action_type: string;
  target_department: string | null;
  payload_json: Record<string, unknown> | null;
  preview_json?: PreviewResult | null;
  rollback_json?: RollbackSnapshot | null;
}

export interface PreviewItem {
  id: string;
  name: string;
  old_price: number;
  new_price: number;
}
export interface PreviewResult {
  affected_count: number;
  items: PreviewItem[];
  pct: number;
  department: string;
  department_slug: string;
  risk: string;
  price_column: string;
  computed_at: string;
}
export interface RollbackSnapshot {
  price_column: string;
  items: { id: string; old_price: number }[];
  computed_at: string;
}
export interface ExecutionResult {
  updated_count: number;
  failed_count: number;
  updated: { id: string; old_price: number; new_price: number }[];
  failures: { id: string; error: string }[];
  executed_at: string;
}

type Fail = { ok: false; error: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveDepartmentSlug(label: string | null): DepartmentSlug | null {
  if (!label) return null;
  const norm = (s: string) => s.replace(/[ה"'\-\s]/g, "");
  const n = norm(label);
  const byLabel = DEPARTMENTS.find((d) => norm(d.label) === n || norm(d.slug) === n);
  if (byLabel) return byLabel.slug;
  const fuzzy = DEPARTMENTS.find((d) => norm(d.label).includes(n) || n.includes(norm(d.label)));
  return fuzzy ? fuzzy.slug : null;
}

interface ValidParams {
  actionType: string;
  pct: number;
  departmentLabel: string;
  slug: DepartmentSlug;
}

/** Strictly validate the command into executable params, or a typed failure. */
export function validateCommand(command: CommandLike): { ok: true; params: ValidParams } | Fail {
  const actionType = String(command.action_type ?? "");
  if (resolveActionType(actionType) !== CANONICAL_ACTION) return { ok: false, error: "unsupported_action" };

  // Read params from the generic `params` bag, falling back to the legacy
  // proposed_execution_plan.params shape for back-compat.
  const payload = (command.payload_json ?? {}) as { params?: { pct?: unknown }; proposed_execution_plan?: { params?: { pct?: unknown } } };
  const pct = Number(payload.params?.pct ?? payload.proposed_execution_plan?.params?.pct);
  if (!Number.isFinite(pct) || pct === 0 || pct < MIN_PCT || pct > MAX_PCT) {
    return { ok: false, error: "invalid_percentage" };
  }

  const departmentLabel = String(command.target_department ?? "");
  const slug = resolveDepartmentSlug(departmentLabel);
  if (!slug) return { ok: false, error: "unknown_department" };

  return { ok: true, params: { actionType, pct, departmentLabel, slug } };
}

/** Dry-run: compute affected rows + rollback snapshot. NO mutation. */
export async function buildPreview(
  db: ExecDb,
  command: CommandLike,
): Promise<{ ok: true; preview: PreviewResult; rollback: RollbackSnapshot } | Fail> {
  const v = validateCommand(command);
  if (!v.ok) return v;

  const { data, error } = await db.selectActiveCatalog();
  if (error) return { ok: false, error: `db_read_failed:${error.message.slice(0, 80)}` };

  const affected = (data ?? []).filter(
    (r) => typeof r.default_price === "number" && categoryToDepartment(String(r.category ?? "")) === v.params.slug,
  );
  const now = new Date().toISOString();
  const items: PreviewItem[] = affected.map((r) => ({
    id: r.id,
    name: r.name,
    old_price: r.default_price as number,
    new_price: round2((r.default_price as number) * (1 + v.params.pct / 100)),
  }));
  return {
    ok: true,
    preview: {
      affected_count: items.length,
      items,
      pct: v.params.pct,
      department: v.params.departmentLabel,
      department_slug: v.params.slug,
      risk: "high",
      price_column: PRICE_COLUMN,
      computed_at: now,
    },
    rollback: {
      price_column: PRICE_COLUMN,
      items: affected.map((r) => ({ id: r.id, old_price: r.default_price as number })),
      computed_at: now,
    },
  };
}

/**
 * Execute the approved price update. Refuses unless status==='execution_approved'
 * (the second approval) AND a stored preview exists. Mutates only default_price,
 * exactly the previewed rows.
 */
export async function executeApproved(
  db: ExecDb,
  command: CommandLike,
): Promise<{ ok: true; result: ExecutionResult } | Fail> {
  if (command.status !== "execution_approved") return { ok: false, error: "not_execution_approved" };
  const preview = command.preview_json;
  if (!preview || !Array.isArray(preview.items) || preview.items.length === 0) {
    return { ok: false, error: "no_preview" };
  }
  const v = validateCommand(command); // re-validate at execution time
  if (!v.ok) return v;

  const updated: ExecutionResult["updated"] = [];
  const failures: ExecutionResult["failures"] = [];
  for (const it of preview.items) {
    const { error } = await db.updatePrice(it.id, it.new_price);
    if (error) failures.push({ id: it.id, error: error.message.slice(0, 120) });
    else updated.push({ id: it.id, old_price: it.old_price, new_price: it.new_price });
  }
  return {
    ok: true,
    result: { updated_count: updated.length, failed_count: failures.length, updated, failures, executed_at: new Date().toISOString() },
  };
}

/** Revert an executed change using the stored rollback snapshot. */
export async function revertExecution(
  db: ExecDb,
  command: CommandLike,
): Promise<{ ok: true; reverted_count: number } | Fail> {
  if (command.status !== "executed") return { ok: false, error: "not_executed" };
  const rb = command.rollback_json;
  if (!rb || !Array.isArray(rb.items) || rb.items.length === 0) return { ok: false, error: "no_rollback" };
  let reverted = 0;
  for (const it of rb.items) {
    const { error } = await db.updatePrice(it.id, it.old_price);
    if (!error) reverted += 1;
  }
  return { ok: true, reverted_count: reverted };
}
