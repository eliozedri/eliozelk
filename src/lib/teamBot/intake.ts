import "server-only";
import { respond, sendNew, type Ctx } from "./reply";
import { loadSession, saveSession, clearSession } from "./sessions";
import { activeIdSet, getItem, listDepartments, listItems } from "./catalog";
import { createOrderDraft } from "./drafts";
import {
  addedToCart,
  cartScreen,
  cityPrompt,
  customerPrompt,
  departmentsScreen,
  draftConfirmation,
  freetextPrompt,
  inactiveBlocked,
  itemsScreen,
  notesPrompt,
  quantityInvalid,
  quantityPrompt,
} from "./messages";
import { findDepartment, type DepartmentSlug } from "@/lib/catalog/departments";
import type { CartLine, SessionState } from "./types";

const PAGE_SIZE = 8;

// ── Catalog browsing ───────────────────────────────────────────────────────────

export async function openDepartments(ctx: Ctx): Promise<void> {
  const depts = await listDepartments();
  const s = departmentsScreen(depts);
  await respond(ctx, s.text, s.keyboard);
}

export async function openDepartment(ctx: Ctx, slug: string, page: number): Promise<void> {
  const dept = findDepartment(slug);
  if (!dept) return void (await openDepartments(ctx));
  const { items, total, pageSize } = await listItems(slug as DepartmentSlug, page, PAGE_SIZE);
  const s = itemsScreen(dept.label, slug, items, page, total, pageSize);
  await respond(ctx, s.text, s.keyboard);
}

export async function selectItem(ctx: Ctx, itemId: string): Promise<void> {
  const item = await getItem(itemId);
  if (!item) {
    // Item went inactive between listing and tapping.
    await respond(ctx, "⚠️ הפריט אינו זמין יותר. בחר פריט אחר.");
    await openDepartments(ctx);
    return;
  }
  const session = await loadSession(ctx.telegramUserId);
  await saveSession(ctx.telegramUserId, {
    ...session,
    flow: "awaiting_quantity",
    pendingItem: {
      catalog_item_id: item.id,
      name: item.name,
      unit: item.unit_of_measure,
      category: item.category,
      type: item.type,
    },
  });
  await sendNew(ctx, quantityPrompt(item.name, item.unit_of_measure));
}

export async function enterQuantity(ctx: Ctx, text: string): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  const pending = session.pendingItem;
  if (!pending) return void (await openDepartments(ctx));

  const qty = parseQuantity(text);
  if (qty == null) {
    await sendNew(ctx, quantityInvalid());
    return;
  }

  const line: CartLine = {
    catalog_item_id: pending.catalog_item_id,
    name: pending.name,
    unit: pending.unit,
    category: pending.category,
    type: pending.type,
    quantity: qty,
    notes: null,
  };
  const cart = [...session.cart, line];
  await saveSession(ctx.telegramUserId, { ...session, cart, flow: "idle", pendingItem: null });
  const s = addedToCart(pending.name, qty, cart.length);
  await sendNew(ctx, s.text, s.keyboard);
}

// ── Cart ────────────────────────────────────────────────────────────────────────

export async function openCart(ctx: Ctx): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  const s = cartScreen(session.cart);
  await respond(ctx, s.text, s.keyboard);
}

export async function removeCartLine(ctx: Ctx, index: number): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  const cart = session.cart.filter((_, i) => i !== index);
  await saveSession(ctx.telegramUserId, { ...session, cart });
  const s = cartScreen(cart);
  await respond(ctx, s.text, s.keyboard);
}

export async function clearCart(ctx: Ctx): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  await saveSession(ctx.telegramUserId, { ...session, cart: [], flow: "idle" });
  const s = cartScreen([]);
  await respond(ctx, s.text, s.keyboard);
}

// ── Submit flow ───────────────────────────────────────────────────────────────

export async function startSubmit(ctx: Ctx): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  if (session.cart.length === 0) return void (await openCart(ctx));
  await setFlow(ctx, session, "awaiting_customer");
  await respond(ctx, customerPrompt);
}

export async function startFreetext(ctx: Ctx): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  await setFlow(ctx, session, "awaiting_freetext");
  await respond(ctx, freetextPrompt);
}

export async function enterFreetext(ctx: Ctx, text: string): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  await saveSession(ctx.telegramUserId, {
    ...session,
    draft: { ...session.draft, notes: text },
    flow: "awaiting_customer",
  });
  await sendNew(ctx, customerPrompt);
}

export async function enterCustomer(ctx: Ctx, text: string): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  const draft = { ...session.draft, customer: text };
  // Free-text orders (empty cart) skip straight to finalize.
  if (session.cart.length === 0) {
    await saveSession(ctx.telegramUserId, { ...session, draft });
    await finalize(ctx);
    return;
  }
  await saveSession(ctx.telegramUserId, { ...session, draft, flow: "awaiting_city" });
  const s = cityPrompt();
  await sendNew(ctx, s.text, s.keyboard);
}

export async function enterCity(ctx: Ctx, text: string | null): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  await saveSession(ctx.telegramUserId, {
    ...session,
    draft: { ...session.draft, city: text ?? undefined },
    flow: "awaiting_notes",
  });
  const s = notesPrompt();
  await sendNew(ctx, s.text, s.keyboard);
}

export async function enterNotes(ctx: Ctx, text: string | null): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);
  const draft = { ...session.draft };
  if (text) draft.notes = draft.notes ? `${draft.notes}\n${text}` : text;
  await saveSession(ctx.telegramUserId, { ...session, draft });
  await finalize(ctx);
}

async function finalize(ctx: Ctx): Promise<void> {
  const session = await loadSession(ctx.telegramUserId);

  // Re-validate is_active for every cart item at submit time.
  const ids = session.cart.map((l) => l.catalog_item_id);
  if (ids.length > 0) {
    const active = await activeIdSet(ids);
    const inactive = session.cart.filter((l) => !active.has(l.catalog_item_id));
    if (inactive.length > 0) {
      await saveSession(ctx.telegramUserId, { ...session, flow: "idle" });
      const s = inactiveBlocked(inactive.map((l) => l.name));
      await sendNew(ctx, s.text, s.keyboard);
      return;
    }
  }

  const draft = await createOrderDraft({
    telegramUserId: ctx.telegramUserId,
    submittedByName: ctx.user.display_name,
    customer: session.draft?.customer ?? null,
    city: session.draft?.city ?? null,
    notes: session.draft?.notes ?? null,
    cart: session.cart,
  });

  await clearSession(ctx.telegramUserId);
  const s = draftConfirmation(draft.shortRef, session.draft?.customer ?? null, session.cart.length);
  await sendNew(ctx, s.text, s.keyboard);
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function setFlow(ctx: Ctx, session: SessionState, flow: SessionState["flow"]): Promise<void> {
  await saveSession(ctx.telegramUserId, { ...session, flow });
}

function parseQuantity(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  // round to 2 decimals to avoid float noise
  return Math.round(n * 100) / 100;
}
