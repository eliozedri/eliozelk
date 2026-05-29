import { describe, it, expect } from "vitest";
import {
  buildPreview,
  executeApproved,
  revertExecution,
  validateCommand,
  type CatalogRow,
  type CommandLike,
  type ExecDb,
  type PreviewResult,
  type RollbackSnapshot,
} from "./priceExecution";

/**
 * Tier-B price execution safety proofs. No DB — ExecDb is a fake recording every
 * mutation. Proves: validation (allowlist + pct range + department), dry-run
 * does NOT mutate, execution requires preview + second approval, mutation hits
 * only the previewed rows via updatePrice (default_price only), and revert.
 */

// safety dept categories (per src/lib/catalog/departments): "אביזרי חנייה", "אביזרי כבישים".
const CATALOG: CatalogRow[] = [
  { id: "a", name: "קסדה", category: "אביזרי חנייה", default_price: 100 },
  { id: "b", name: "אפוד", category: "אביזרי כבישים", default_price: 50 },
  { id: "c", name: "שלט", category: "שלטים ושילוט", default_price: 200 }, // signage — must NOT be affected
  { id: "d", name: "ללא מחיר", category: "אביזרי חנייה", default_price: null }, // no price — skipped
];

function makeDb(catalog: CatalogRow[] = CATALOG) {
  const updates: { id: string; price: number }[] = [];
  const db: ExecDb = {
    async selectActiveCatalog() {
      return { data: catalog, error: null };
    },
    async updatePrice(id, price) {
      updates.push({ id, price });
      return { error: null };
    },
  };
  return { db, updates };
}

function cmd(over: Partial<CommandLike> = {}): CommandLike {
  return {
    status: "approved",
    action_type: "price_update_request",
    target_department: "אביזרי בטיחות",
    payload_json: { proposed_execution_plan: { params: { pct: 5 } } },
    preview_json: null,
    rollback_json: null,
    ...over,
  };
}

describe("Tier-B price execution", () => {
  it("validates allowlist, percentage range, and department", () => {
    expect(validateCommand(cmd()).ok).toBe(true);
    expect((validateCommand(cmd({ action_type: "delete_all_customers" })) as { error: string }).error).toBe("unsupported_action");
    expect((validateCommand(cmd({ payload_json: { proposed_execution_plan: { params: { pct: 0 } } } })) as { error: string }).error).toBe("invalid_percentage");
    expect((validateCommand(cmd({ payload_json: { proposed_execution_plan: { params: { pct: 60 } } } })) as { error: string }).error).toBe("invalid_percentage");
    expect((validateCommand(cmd({ payload_json: { proposed_execution_plan: { params: {} } } })) as { error: string }).error).toBe("invalid_percentage");
    expect((validateCommand(cmd({ target_department: "מחלקה לא קיימת" })) as { error: string }).error).toBe("unknown_department");
  });

  it("preview computes affected rows + rollback snapshot WITHOUT mutating", async () => {
    const { db, updates } = makeDb();
    const r = await buildPreview(db, cmd());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.affected_count).toBe(2); // a + b only (c=signage, d=no price)
    expect(r.preview.items.find((i) => i.id === "a")!.new_price).toBe(105);
    expect(r.preview.items.find((i) => i.id === "b")!.new_price).toBe(52.5);
    expect(r.preview.items.some((i) => i.id === "c")).toBe(false); // signage untouched
    expect(r.rollback.items).toEqual([{ id: "a", old_price: 100 }, { id: "b", old_price: 50 }]);
    expect(updates.length).toBe(0); // DRY-RUN: zero mutations
  });

  it("rejects execution without a preview", async () => {
    const { db, updates } = makeDb();
    const r = await executeApproved(db, cmd({ status: "execution_approved", preview_json: null }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("no_preview");
    expect(updates.length).toBe(0);
  });

  it("rejects execution without the second (execution) approval", async () => {
    const { db, updates } = makeDb();
    const preview: PreviewResult = {
      affected_count: 1, items: [{ id: "a", name: "קסדה", old_price: 100, new_price: 105 }],
      pct: 5, department: "אביזרי בטיחות", department_slug: "safety", risk: "high", price_column: "default_price", computed_at: "now",
    };
    const r = await executeApproved(db, cmd({ status: "preview_ready", preview_json: preview }));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toBe("not_execution_approved");
    expect(updates.length).toBe(0);
  });

  it("executes only the previewed rows, mutating only default_price", async () => {
    const { db, updates } = makeDb();
    const built = await buildPreview(db, cmd());
    if (!built.ok) throw new Error("preview failed");
    const r = await executeApproved(db, cmd({ status: "execution_approved", preview_json: built.preview }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.updated_count).toBe(2);
    expect(r.result.failed_count).toBe(0);
    // Exactly the two previewed rows, with their new prices — nothing else.
    expect(updates).toEqual([{ id: "a", price: 105 }, { id: "b", price: 52.5 }]);
    expect(updates.some((u) => u.id === "c")).toBe(false);
  });

  it("rejects unsupported action at execution time too", async () => {
    const { db } = makeDb();
    const preview: PreviewResult = {
      affected_count: 1, items: [{ id: "a", name: "x", old_price: 100, new_price: 105 }],
      pct: 5, department: "אביזרי בטיחות", department_slug: "safety", risk: "high", price_column: "default_price", computed_at: "now",
    };
    const r = await executeApproved(db, cmd({ status: "execution_approved", action_type: "drop_table", preview_json: preview }));
    expect((r as { error: string }).error).toBe("unsupported_action");
  });

  it("reverts using the stored rollback snapshot", async () => {
    const { db, updates } = makeDb();
    const rollback: RollbackSnapshot = {
      price_column: "default_price",
      items: [{ id: "a", old_price: 100 }, { id: "b", old_price: 50 }],
      computed_at: "now",
    };
    const r = await revertExecution(db, cmd({ status: "executed", rollback_json: rollback }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reverted_count).toBe(2);
    expect(updates).toEqual([{ id: "a", price: 100 }, { id: "b", price: 50 }]);
  });
});
