/**
 * Operational simulation seeder — 50 diverse Elkayam orders for QA inspection.
 *
 * SAFETY (read before running):
 *  - Writes to the LIVE Supabase. Every row is IRONCLAD-MARKED as test data:
 *      • order_number  = "SIM-0001".."SIM-0050"  (NO next_counter call → real order
 *        numbers are never advanced)
 *      • customer      = "🧪[SIM] …"
 *      • source        = "simulation"
 *      • data.simulation = true, data.simBatch = <timestamp>
 *  - `--cleanup` deletes EXACTLY those rows (work_orders + team_bot_order_drafts +
 *    best-effort related notifications / agent_exceptions / order_activities).
 *  - It does NOT issue invoices, does NOT close the month, does NOT mark anything as
 *    finally billed. The "billing-ready" orders only carry accounting_status so the
 *    monthly-billing-prep view can be inspected.
 *
 * Usage:
 *   npx tsx scripts/simulateOrders.ts --dry-run     # print plan, write nothing
 *   npx tsx scripts/simulateOrders.ts               # seed 50 orders (live)
 *   npx tsx scripts/simulateOrders.ts --cleanup     # remove all SIM-* test data
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const SIM_SOURCE = "simulation";
const SIM_PREFIX = "🧪[SIM] ";
const BATCH = new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const dateAgo = (n: number) => daysAgo(n).slice(0, 10);

type MiscRow = { name: string; quantity: number; unit?: string; unitPrice?: number; notes?: string };
type ServiceRow = { name: string; quantity: number; unitPrice?: number; notes?: string };

interface SimOrder {
  scenario: string;                 // what this case is probing
  customer: string;
  city: string;
  status: string;                   // draft|graphics_pending|production|ready_installation|completed|cancelled
  priority?: string;                // normal|urgent
  orderType?: string;               // field_work|equipment_supply
  customerApproval?: string;        // approved|pending  (pending = returned for clarification)
  accountingStatus?: string;        // pending|ready_for_billing|approved_for_billing
  warehouseRequired?: boolean;
  fabricationRequired?: boolean;
  source?: string;                  // web|manual|simulation (overridden to simulation marker anyway)
  billedAmount?: number | null;
  requiredDate?: string | null;
  misc?: MiscRow[];
  services?: ServiceRow[];
  notes?: string;
  attachments?: { name: string; url?: string }[];
  intakeDraft?: boolean;            // route through team_bot_order_drafts instead of work_orders
  intakeChannel?: string;           // external_web_form|telegram_orders_bot|jarvis|whatsapp
}

// ── 50 diverse, realistic Elkayam scenarios ─────────────────────────────────────
const ORDERS: SimOrder[] = [
  // — clean operational variety —
  { scenario: "road marking — parking lot", customer: "עיריית ראשון לציון", city: "ראשון לציון", status: "completed", accountingStatus: "approved_for_billing", billedAmount: 8400, misc: [{ name: "סימון חניות", quantity: 120, unit: "מ\"ר", unitPrice: 45 }], services: [{ name: "עבודת צביעה", quantity: 2, unitPrice: 1200 }] },
  { scenario: "temporary traffic arrangement", customer: "נתיבי ישראל", city: "מודיעין", status: "completed", accountingStatus: "ready_for_billing", billedAmount: 15600, warehouseRequired: true, misc: [{ name: "קונוסים", quantity: 80, unit: "יח'", unitPrice: 35 }, { name: "שלט הסדר תנועה", quantity: 12, unit: "יח'", unitPrice: 220 }] },
  { scenario: "sign production (fabrication)", customer: "מועצה אזורית גזר", city: "כרמי יוסף", status: "production", fabricationRequired: true, misc: [{ name: "תמרור אזהרה 145", quantity: 6, unit: "יח'", unitPrice: 180 }] },
  { scenario: "safety barriers supply", customer: "אלקטרה בנייה", city: "תל אביב", status: "ready_installation", warehouseRequired: true, orderType: "equipment_supply", misc: [{ name: "מעקה בטיחות", quantity: 40, unit: "מטר", unitPrice: 95 }] },
  { scenario: "cones + sleeves + posts mixed", customer: "דניה סיבוס", city: "חיפה", status: "completed", accountingStatus: "ready_for_billing", billedAmount: 5200, misc: [{ name: "קונוס 75 ס\"מ", quantity: 50, unit: "יח'", unitPrice: 28 }, { name: "שרוול מחזיר אור", quantity: 50, unit: "יח'", unitPrice: 12 }, { name: "עמוד תמרור", quantity: 10, unit: "יח'", unitPrice: 140 }] },
  { scenario: "labor + materials job", customer: "שיכון ובינוי", city: "באר שבע", status: "completed", accountingStatus: "approved_for_billing", billedAmount: 22300, misc: [{ name: "צבע תרמופלסטי לבן", quantity: 200, unit: "ק\"ג", unitPrice: 18 }], services: [{ name: "ימי עבודת צוות (3 עובדים)", quantity: 4, unitPrice: 3600 }] },

  // — urgent / priority —
  { scenario: "urgent night-work marking", customer: "כביש חוצה ישראל", city: "עמק חפר", status: "ready_installation", priority: "urgent", requiredDate: dateAgo(-2), services: [{ name: "עבודת לילה", quantity: 1, unitPrice: 4800 }] },
  { scenario: "urgent overdue required_date", customer: "עיריית נתניה", city: "נתניה", status: "graphics_pending", priority: "urgent", requiredDate: dateAgo(5), misc: [{ name: "סימון מעבר חצייה", quantity: 8, unit: "יח'", unitPrice: 320 }] },

  // — drafts (resume testing) —
  { scenario: "draft saved, to be resumed", customer: "פרטי — משה לוי", city: "רחובות", status: "draft", misc: [{ name: "סימון חץ כיוון", quantity: 4, unit: "יח'", unitPrice: 90 }], notes: "ממתין להשלמת פרטים מהלקוח" },
  { scenario: "aged draft (forgotten)", customer: "קבלן עצמאי — דוד כהן", city: "אשדוד", status: "draft", misc: [{ name: "צביעת אבני שפה", quantity: 60, unit: "מטר", unitPrice: 22 }] },
  { scenario: "draft with attachment", customer: "מליבו בניה", city: "פתח תקווה", status: "draft", attachments: [{ name: "תוכנית_חניון.pdf" }], misc: [{ name: "סימון חניות נכים", quantity: 6, unit: "יח'", unitPrice: 260 }] },

  // — approval / clarification —
  { scenario: "returned for clarification (approval pending)", customer: "מועצה מקומית פרדס חנה", city: "פרדס חנה", status: "graphics_pending", customerApproval: "pending", notes: "הוחזר לבירור — חסר אישור תקציבי" },
  { scenario: "approved then completed (after clarification)", customer: "מועצה מקומית פרדס חנה", city: "פרדס חנה", status: "completed", accountingStatus: "ready_for_billing", billedAmount: 3100, customerApproval: "approved", misc: [{ name: "תמרור עצור", quantity: 3, unit: "יח'", unitPrice: 175 }] },

  // — same customer, multiple monthly orders (billing grouping) —
  { scenario: "repeat customer #1 (same month)", customer: "עיריית הרצליה", city: "הרצליה", status: "completed", accountingStatus: "ready_for_billing", billedAmount: 4200, misc: [{ name: "סימון אורכי", quantity: 300, unit: "מטר", unitPrice: 14 }] },
  { scenario: "repeat customer #2 (same month)", customer: "עיריית הרצליה", city: "הרצליה", status: "completed", accountingStatus: "ready_for_billing", billedAmount: 6900, misc: [{ name: "סימון רוחבי", quantity: 18, unit: "יח'", unitPrice: 380 }] },
  { scenario: "repeat customer #3 (incomplete, should NOT bill)", customer: "עיריית הרצליה", city: "הרצליה", status: "production", misc: [{ name: "צביעת מעברי חצייה", quantity: 5, unit: "יח'", unitPrice: 300 }] },

  // — equipment / fleet related —
  { scenario: "equipment supply (no install)", customer: "חברת החשמל", city: "חדרה", status: "completed", accountingStatus: "pending", orderType: "equipment_supply", misc: [{ name: "תמרורים זמניים — ערכה", quantity: 1, unit: "ערכה", unitPrice: 2400 }] },

  // ── ADVERSARIAL / failure-hunting ──
  { scenario: "MISSING customer name", customer: "", city: "כפר סבא", status: "draft", misc: [{ name: "סימון", quantity: 10, unit: "מטר", unitPrice: 14 }] },
  { scenario: "MISSING city/location", customer: "לקוח ללא מיקום", city: "", status: "graphics_pending", misc: [{ name: "תמרור", quantity: 2, unit: "יח'", unitPrice: 180 }] },
  { scenario: "MISSING quantities", customer: "בדיקת כמות חסרה", city: "לוד", status: "draft", misc: [{ name: "פריט ללא כמות", quantity: 0, unit: "יח'", unitPrice: 100 }] },
  { scenario: "MISSING price", customer: "בדיקת מחיר חסר", city: "רמלה", status: "completed", accountingStatus: "ready_for_billing", billedAmount: null, misc: [{ name: "פריט ללא מחיר", quantity: 5, unit: "יח'" }] },
  { scenario: "ZERO billed completed (should flag)", customer: "סכום אפס", city: "יבנה", status: "completed", accountingStatus: "ready_for_billing", billedAmount: 0, misc: [{ name: "עבודה", quantity: 1, unitPrice: 0 }] },
  { scenario: "NEGATIVE quantity (invalid)", customer: "כמות שלילית", city: "חולון", status: "draft", misc: [{ name: "פריט שלילי", quantity: -5, unit: "יח'", unitPrice: 50 }] },
  { scenario: "HUGE quantity", customer: "כמות חריגה", city: "אילת", status: "graphics_pending", misc: [{ name: "קונוסים", quantity: 999999, unit: "יח'", unitPrice: 28 }] },
  { scenario: "VERY long customer name", customer: "עיריית ".concat("מגדל העמק והסביבה — אגף תשתיות תחבורה ובטיחות בדרכים מחלקת סימון וצביעה ".repeat(2)), city: "מגדל העמק", status: "draft", misc: [{ name: "סימון", quantity: 1, unitPrice: 1 }] },
  { scenario: "Hebrew+English mixed + special chars", customer: "ACME Roads בע\"מ <b>test</b> & co. 100%", city: "Tel-Aviv / ת\"א", status: "graphics_pending", misc: [{ name: "Sign #12 / תמרור «מיוחד»", quantity: 3, unit: "pcs", unitPrice: 199.99 }] },
  { scenario: "discount + custom price", customer: "לקוח עם הנחה", city: "כפר יונה", status: "completed", accountingStatus: "ready_for_billing", billedAmount: 3600, misc: [{ name: "סימון (מחיר מיוחד)", quantity: 100, unit: "מטר", unitPrice: 40, notes: "הנחה 10% — מחיר מיוחד" }] },
  { scenario: "duplicate-looking #1", customer: "בדיקת כפילות בע\"מ", city: "גבעתיים", status: "graphics_pending", misc: [{ name: "תמרור 301", quantity: 4, unit: "יח'", unitPrice: 180 }] },
  { scenario: "duplicate-looking #2 (same data)", customer: "בדיקת כפילות בע\"מ", city: "גבעתיים", status: "graphics_pending", misc: [{ name: "תמרור 301", quantity: 4, unit: "יח'", unitPrice: 180 }] },
  { scenario: "attachment with unusual filename", customer: "קובץ מוזר", city: "אור יהודה", status: "draft", attachments: [{ name: "‏‏סריקה  2026—@#$%^&() קובץ עם רווחים ארוך מאוד.PDF" }], misc: [{ name: "סימון", quantity: 2, unitPrice: 50 }] },
  { scenario: "completed but accounting pending (not ready)", customer: "טרם מאומת לחיוב", city: "קריית גת", status: "completed", accountingStatus: "pending", misc: [{ name: "צביעה", quantity: 30, unit: "מטר", unitPrice: 16 }] },
  { scenario: "cancelled order (should not bill)", customer: "הזמנה מבוטלת", city: "נהריה", status: "cancelled", misc: [{ name: "סימון", quantity: 10, unitPrice: 14 }] },

  // ── intake-queue orders (bot/external/jarvis — pending_review drafts) ──
  { scenario: "external web-form intake", customer: "ועד בית רחוב הזית 5", city: "כרמיאל", status: "intake", intakeDraft: true, intakeChannel: "external_web_form", misc: [{ name: "סימון חניות פרטי", quantity: 8, unit: "יח'", unitPrice: 45 }] },
  { scenario: "telegram bot intake", customer: "מנהל עבודה — אתר חיפה", city: "חיפה", status: "intake", intakeDraft: true, intakeChannel: "telegram_orders_bot", misc: [{ name: "קונוסים דחוף", quantity: 30, unit: "יח'", unitPrice: 28 }] },
  { scenario: "JARVIS manager intake", customer: "הזמנה דרך JARVIS", city: "מודיעין", status: "intake", intakeDraft: true, intakeChannel: "jarvis", misc: [{ name: "תמרור + עמוד", quantity: 5, unit: "יח'", unitPrice: 320 }] },
  { scenario: "whatsapp intake (incomplete)", customer: "", city: "", status: "intake", intakeDraft: true, intakeChannel: "whatsapp", notes: "הודעת וואטסאפ — חסרים פרטים" },
];

// Fill to 50 with realistic monthly-billing variety (repeat customers, completed, ready).
const FILLER_CUSTOMERS = [
  ["עיריית כפר סבא", "כפר סבא"], ["מועצה אזורית מטה יהודה", "בית שמש"], ["א. דורי בנייה", "תל אביב"],
  [" קרסו נדל\"ן", "ראש העין"], ["עיריית רעננה", "רעננה"], ["נתיבי איילון", "תל אביב"],
  ["מי אביבים", "תל אביב"], ["עיריית בת ים", "בת ים"], ["משרד התחבורה", "ירושלים"],
  ["עיריית אשקלון", "אשקלון"], ["חברת מוריה", "ירושלים"], ["עיריית קריית אונו", "קריית אונו"],
];
let n = ORDERS.length;
let fi = 0;
while (n < 50) {
  const [cust, city] = FILLER_CUSTOMERS[fi % FILLER_CUSTOMERS.length];
  const ready = fi % 2 === 0;
  ORDERS.push({
    scenario: `monthly-billing filler #${fi + 1}`,
    customer: cust, city,
    status: "completed",
    accountingStatus: ready ? "ready_for_billing" : "approved_for_billing",
    billedAmount: 1500 + ((fi * 1373) % 9000),
    misc: [{ name: ["סימון אורכי", "תמרורים", "צביעת אבני שפה", "מעברי חצייה"][fi % 4], quantity: 20 + (fi * 7) % 200, unit: "מטר", unitPrice: 12 + (fi % 5) * 6 }],
  });
  n++; fi++;
}

function buildData(o: SimOrder) {
  return {
    simulation: true,
    simBatch: BATCH,
    simScenario: o.scenario,
    signRows: [], signsRows: [], accessoryRows: [],
    miscRows: o.misc ?? [],
    serviceRows: o.services ?? [],
    attachments: o.attachments ?? [],
    notes: o.notes ?? "",
    generalNotes: o.notes ?? null,
    fabricationDetails: null,
  };
}

async function seed() {
  const workOrders: Record<string, unknown>[] = [];
  const drafts: Record<string, unknown>[] = [];
  let seq = 0;
  for (const o of ORDERS) {
    seq++;
    const num = `SIM-${String(seq).padStart(4, "0")}`;
    if (o.intakeDraft) {
      drafts.push({
        id: crypto.randomUUID(),
        submitted_by_name: SIM_PREFIX + (o.customer || "ללא שם"),
        source: o.intakeChannel ?? "external_web_form",
        intake_channel: o.intakeChannel ?? "external_web_form",
        status: "pending_review",
        customer: o.customer ? SIM_PREFIX + o.customer : SIM_PREFIX + "(ללא לקוח)",
        city: o.city,
        notes: `[${SIM_SOURCE}] ${o.scenario}${o.notes ? " — " + o.notes : ""}`,
        cart: (o.misc ?? []).map(m => ({ name: m.name, quantity: m.quantity, unit: m.unit ?? null, notes: m.notes ?? null })),
        external_ref: `${SIM_SOURCE}:${num}`,
        created_at: daysAgo(seq % 5),
      });
      continue;
    }
    workOrders.push({
      id: crypto.randomUUID(),
      order_number: num,
      status: o.status,
      priority: o.priority ?? "normal",
      customer: SIM_PREFIX + o.customer,
      city: o.city,
      order_date: dateAgo(seq % 28),
      data: buildData(o),
      order_type: o.orderType ?? "field_work",
      customer_approval_status: o.customerApproval ?? "approved",
      accounting_status: o.accountingStatus ?? "pending",
      warehouse_required: o.warehouseRequired ?? false,
      fabrication_required: o.fabricationRequired ?? false,
      billed_amount: o.billedAmount === undefined ? null : o.billedAmount,
      required_date: o.requiredDate ?? null,
      source: SIM_SOURCE,
      source_ref: o.scenario.slice(0, 80),
      created_at: daysAgo((seq % 28) + 1),
      updated_at: daysAgo(seq % 14),
      billing_ready_at: o.accountingStatus === "ready_for_billing" || o.accountingStatus === "approved_for_billing" ? daysAgo(seq % 7) : null,
      billing_approved_at: o.accountingStatus === "approved_for_billing" ? daysAgo(seq % 5) : null,
    });
  }

  console.log(`Seeding ${workOrders.length} work_orders + ${drafts.length} intake drafts (batch ${BATCH})`);
  for (let i = 0; i < workOrders.length; i += 25) {
    const { error } = await db.from("work_orders").insert(workOrders.slice(i, i + 25));
    if (error) { console.error("work_orders insert error:", error.message); process.exit(1); }
  }
  if (drafts.length) {
    const { error } = await db.from("team_bot_order_drafts").insert(drafts);
    if (error) console.error("drafts insert error (non-fatal):", error.message);
  }
  await summary();
}

async function cleanup() {
  console.log("Cleaning up SIM-* simulation data…");
  const { data: wo } = await db.from("work_orders").select("id").eq("source", SIM_SOURCE);
  const ids = (wo ?? []).map(r => r.id as string);
  if (ids.length) {
    await db.from("order_activities").delete().in("order_id", ids).then(() => {}, () => {});
    await db.from("work_orders").delete().eq("source", SIM_SOURCE);
  }
  await db.from("team_bot_order_drafts").delete().like("external_ref", `${SIM_SOURCE}:%`);
  console.log(`Removed ${ids.length} work_orders + intake drafts. (Inspect notifications/agent_exceptions manually if needed.)`);
}

async function summary() {
  const { data } = await db.from("work_orders").select("customer,status,accounting_status,billed_amount").eq("source", SIM_SOURCE);
  const rows = data ?? [];
  const byStatus: Record<string, number> = {};
  let billingReady = 0, missingBilled = 0;
  for (const r of rows) {
    byStatus[r.status as string] = (byStatus[r.status as string] ?? 0) + 1;
    if (r.status === "completed" && (r.accounting_status === "ready_for_billing" || r.accounting_status === "approved_for_billing")) billingReady++;
    if (r.status === "completed" && (r.billed_amount == null || Number(r.billed_amount) === 0)) missingBilled++;
  }
  console.log("\n── SIMULATION SUMMARY ──");
  console.log("by status:", byStatus);
  console.log("completed & billing-ready:", billingReady);
  console.log("completed but missing/zero billed amount (flag):", missingBilled);
  console.log("\nInspect: Orders page, Accounting (הנהלת כספים) billing-prep, bot-orders queue, AgentCommandCenter.");
  console.log("Cleanup when done:  npx tsx scripts/simulateOrders.ts --cleanup");
}

const mode = process.argv.includes("--cleanup") ? "cleanup" : process.argv.includes("--dry-run") ? "dry" : "seed";
if (mode === "dry") {
  console.log(`DRY RUN — would create ${ORDERS.filter(o => !o.intakeDraft).length} work_orders + ${ORDERS.filter(o => o.intakeDraft).length} intake drafts.`);
  console.log("Scenarios:"); ORDERS.forEach((o, i) => console.log(`  ${i + 1}. [${o.status}] ${o.scenario} — ${o.customer || "(no customer)"}`));
  process.exit(0);
}
(mode === "cleanup" ? cleanup() : seed()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
