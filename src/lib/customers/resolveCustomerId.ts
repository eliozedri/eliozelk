// Safe, deterministic customer-name → customer_id resolution.
//
// SAFETY: only resolves an id when EXACTLY ONE customer matches the normalized
// name. Zero matches or ambiguous (>1) → null. Never fuzzy/partial matches, so
// an order is never auto-linked to the wrong customer. Used by the order form,
// order creation, and the team-bot promote path; the orders-agent scan uses
// `customerMatchStatus` to raise a human-review task for unlinked-but-matchable
// (or ambiguous) orders instead of forcing a link.

export interface CustomerLite {
  id: string;
  name: string;
}

export function normalizeCustomerName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Returns the customer id ONLY on an exact, unambiguous normalized-name match.
 * Ambiguous (>1) or no match → null (caller keeps the free-text name fallback).
 */
export function resolveExactCustomerId(
  name: string | null | undefined,
  customers: CustomerLite[],
): string | null {
  const n = normalizeCustomerName(name);
  if (!n) return null;
  const matches = customers.filter((c) => normalizeCustomerName(c.name) === n);
  return matches.length === 1 ? matches[0].id : null;
}

export type CustomerMatch =
  | { status: "linked-one"; id: string }
  | { status: "ambiguous"; ids: string[] }
  | { status: "none" };

/**
 * Classifies how a free-text customer name maps onto the customers table —
 * for review-task logic (suggest a link / flag ambiguity), never to auto-link.
 */
export function customerMatchStatus(
  name: string | null | undefined,
  customers: CustomerLite[],
): CustomerMatch {
  const n = normalizeCustomerName(name);
  if (!n) return { status: "none" };
  const matches = customers.filter((c) => normalizeCustomerName(c.name) === n);
  if (matches.length === 1) return { status: "linked-one", id: matches[0].id };
  if (matches.length > 1) return { status: "ambiguous", ids: matches.map((c) => c.id) };
  return { status: "none" };
}
