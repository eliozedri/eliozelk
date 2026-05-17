import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { WorkOrder } from "@/types/workOrder";
import {
  DOC_PRIMARY,
  DOC_SUBHEADER,
  DOC_GOLD,
  DOC_GOLD_BG,
  DOC_GOLD_BORDER,
  DOC_LIGHT,
  DOC_BORDER,
  DOC_GRAY,
  DOC_DARK,
  DOC_LIGHT_TEXT,
} from "@/lib/pdfBrand";

Font.register({
  family: "Heebo",
  fonts: [
    { src: "/fonts/Heebo-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Heebo-Bold.ttf", fontWeight: 700 },
  ],
});

const PRIMARY     = DOC_PRIMARY;
const LIGHT       = DOC_LIGHT;
const BORDER      = DOC_BORDER;
const GRAY        = DOC_GRAY;
const DARK        = DOC_DARK;
const GOLD        = DOC_GOLD;
const GOLD_BG     = DOC_GOLD_BG;
const GOLD_BORDER = DOC_GOLD_BORDER;

const s = StyleSheet.create({
  page: {
    fontFamily: "Heebo",
    fontSize: 9,
    direction: "rtl",
    backgroundColor: "#ffffff",
    paddingBottom: 44,
  },

  /* ── Header band ── */
  headerBand: {
    backgroundColor: PRIMARY,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 28,
  },
  headerTop: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontSize: 15, fontWeight: 700, color: "#ffffff" },
  companyTagline: { fontSize: 7, color: DOC_LIGHT_TEXT, marginTop: 2 },
  companyContact: { fontSize: 7, color: DOC_LIGHT_TEXT, marginTop: 3 },

  docBlock: { alignItems: "flex-start" },
  docTitle: { fontSize: 13, fontWeight: 700, color: "#ffffff" },
  docSubtitle: { fontSize: 8, color: DOC_LIGHT_TEXT, marginTop: 2 },

  /* ── Customer banner ── */
  customerBanner: {
    backgroundColor: DOC_SUBHEADER,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  customerLabel: { fontSize: 7, color: DOC_LIGHT_TEXT },
  customerName: { fontSize: 11, fontWeight: 700, color: "#ffffff" },
  periodLabel: { fontSize: 7, color: DOC_LIGHT_TEXT },
  periodValue: { fontSize: 9, color: "#e0f2fe" },

  body: { paddingHorizontal: 28, paddingTop: 14 },

  /* ── Summary chips ── */
  summaryRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flex: 1,
    backgroundColor: LIGHT,
    border: `1 solid ${BORDER}`,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "flex-end",
  },
  chipGold: {
    flex: 1,
    backgroundColor: GOLD_BG,
    border: `1 solid ${GOLD_BORDER}`,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "flex-end",
  },
  chipLabel: { fontSize: 7, color: GRAY },
  chipValue: { fontSize: 14, fontWeight: 700, color: PRIMARY, marginTop: 2 },
  chipValueGold: { fontSize: 14, fontWeight: 700, color: GOLD, marginTop: 2 },

  /* ── Table ── */
  table: {
    border: `1 solid ${BORDER}`,
    borderRadius: 4,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: PRIMARY,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottom: `1 solid #f0f4ff`,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    flexDirection: "row-reverse",
    borderBottom: `1 solid #f0f4ff`,
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: LIGHT,
  },
  totalsRow: {
    flexDirection: "row-reverse",
    borderTop: `2 solid ${PRIMARY}`,
    paddingVertical: 7,
    paddingHorizontal: 6,
    backgroundColor: "#dbeafe",
  },
  th: { fontSize: 8, fontWeight: 700, color: "#ffffff", textAlign: "right" },
  td: { fontSize: 8, color: DARK, textAlign: "right" },
  tdBold: { fontSize: 8, fontWeight: 700, color: DARK, textAlign: "right" },
  tdGold: { fontSize: 8, fontWeight: 700, color: GOLD, textAlign: "right" },

  colNum:      { width: "5%"  },
  colOrder:    { width: "13%" },
  colJob:      { width: "22%" },
  colLocation: { width: "20%" },
  colDate:     { width: "12%" },
  colSigns:    { width: "8%"  },
  colMisc:     { width: "8%"  },
  colStatus:   { width: "12%" },

  /* ── Grand total box ── */
  grandTotal: {
    backgroundColor: GOLD_BG,
    border: `2 solid ${GOLD_BORDER}`,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  grandTotalLabel: { fontSize: 10, fontWeight: 700, color: "#92400e" },
  grandTotalAmount: { fontSize: 16, fontWeight: 700, color: GOLD },

  /* ── Notes ── */
  notesBox: {
    backgroundColor: "#fefce8",
    border: `1 solid ${GOLD_BORDER}`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 14,
  },
  notesLabel: { fontSize: 8, fontWeight: 700, color: "#92400e", marginBottom: 3 },
  notesText: { fontSize: 8, color: "#78350f" },

  /* ── Per-order manager notes ── */
  managerNotesSection: {
    backgroundColor: "#fefce8",
    border: `1 solid ${GOLD_BORDER}`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 14,
  },
  managerNotesSectionTitle: { fontSize: 8, fontWeight: 700, color: "#92400e", marginBottom: 5, textAlign: "right" },
  managerNotesRow: { flexDirection: "row-reverse", gap: 6, marginBottom: 2 },
  managerNotesNum: { fontSize: 7, fontWeight: 700, color: "#92400e", textAlign: "right", width: "12%" },
  managerNotesText: { fontSize: 7, color: "#78350f", textAlign: "right", flex: 1 },

  /* ── Signature block ── */
  sigSection: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    gap: 20,
    marginTop: 16,
    borderTop: `1 solid ${BORDER}`,
    paddingTop: 12,
  },
  sigBox: { flex: 1 },
  sigLabel: { fontSize: 7, color: GRAY },
  sigLine: { marginTop: 28, borderBottom: `1 dashed #d1d5db`, marginBottom: 4 },

  /* ── Footer ── */
  footer: {
    position: "absolute",
    bottom: 0,
    right: 0,
    left: 0,
    backgroundColor: "#f8fafc",
    borderTop: `1 solid ${BORDER}`,
    paddingVertical: 5,
    paddingHorizontal: 28,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 6, color: "#9ca3af" },
});

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function countSignQty(order: WorkOrder): number {
  return order.signRows.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
}

function countMiscQty(order: WorkOrder): number {
  return order.miscRows.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
}

const STATUS_LABELS: Record<string, string> = {
  graphics_pending:   "ממתין לגרפיקה",
  graphics_active:    "גרפיקה",
  graphics_done:      "גרפיקה הושלמה",
  production:         "בייצור",
  ready_installation: "מוכן לביצוע",
  completed:          "הושלם",
  cancelled:          "בוטל",
};

export interface CustomerBillingData {
  customerName: string;
  orders: WorkOrder[];
  dateFrom?: string;
  dateTo?: string;
  generatedAt: string;
  notes?: string;
}

export function CustomerBillingDocument({ data }: { data: CustomerBillingData }) {
  const { customerName, orders, dateFrom, dateTo, generatedAt, notes } = data;

  const totalSigns = orders.reduce((s, o) => s + countSignQty(o), 0);
  const totalMisc  = orders.reduce((s, o) => s + countMiscQty(o), 0);
  const grandTotal = orders.reduce((s, o) => s + (o.billedAmount ?? 0), 0);

  const periodLabel =
    dateFrom && dateTo
      ? `${formatDate(dateFrom)} — ${formatDate(dateTo)}`
      : dateFrom
      ? `מ-${formatDate(dateFrom)}`
      : dateTo
      ? `עד ${formatDate(dateTo)}`
      : "כל התקופה";

  const generatedDate = formatDate(generatedAt.split("T")[0]);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header band */}
        <View style={s.headerBand}>
          <View style={s.headerTop}>
            <View style={s.companyBlock}>
              <Text style={s.companyName}>אלקיים סימון כבישים בע״מ</Text>
              <Text style={s.companyTagline}>Road Marking & Signage Solutions</Text>
              <Text style={s.companyContact}>טל׳: 04-XXXXXXX · elkayam.co.il</Text>
            </View>
            <View style={s.docBlock}>
              <Text style={s.docTitle}>דוח חיוב לקוח</Text>
              <Text style={s.docSubtitle}>Customer Billing Report</Text>
            </View>
          </View>

          <View style={s.customerBanner}>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.customerLabel}>לקוח</Text>
              <Text style={s.customerName}>{customerName}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.periodLabel}>תקופה</Text>
              <Text style={s.periodValue}>{periodLabel}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.periodLabel}>תאריך הפקה</Text>
              <Text style={s.periodValue}>{generatedDate}</Text>
            </View>
          </View>
        </View>

        <View style={s.body}>

          {/* Summary chips */}
          <View style={s.summaryRow}>
            <View style={s.chip}>
              <Text style={s.chipLabel}>הזמנות</Text>
              <Text style={s.chipValue}>{orders.length}</Text>
            </View>
            <View style={s.chip}>
              <Text style={s.chipLabel}>שלטים (סה״כ)</Text>
              <Text style={s.chipValue}>{totalSigns}</Text>
            </View>
            <View style={s.chip}>
              <Text style={s.chipLabel}>פריטי שונות</Text>
              <Text style={s.chipValue}>{totalMisc}</Text>
            </View>
            <View style={s.chipGold}>
              <Text style={s.chipLabel}>סה״כ לחיוב</Text>
              <Text style={s.chipValueGold}>
                {grandTotal > 0 ? `₪${grandTotal.toLocaleString()}` : "—"}
              </Text>
            </View>
          </View>

          {/* Table */}
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.th, s.colNum]}>#</Text>
              <Text style={[s.th, s.colOrder]}>מס׳ הזמנה</Text>
              <Text style={[s.th, s.colJob]}>שם עבודה</Text>
              <Text style={[s.th, s.colLocation]}>מיקום</Text>
              <Text style={[s.th, s.colDate]}>תאריך</Text>
              <Text style={[s.th, s.colSigns]}>שלטים</Text>
              <Text style={[s.th, s.colMisc]}>שונות</Text>
              <Text style={[s.th, s.colStatus]}>לחיוב ₪</Text>
            </View>

            {orders.map((order, idx) => (
              <View key={order.id} style={idx % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                <Text style={[s.td, s.colNum]}>{idx + 1}</Text>
                <Text style={[s.td, s.colOrder]}>{order.orderNumber}</Text>
                <Text style={[s.td, s.colJob]}>{order.jobName || "—"}</Text>
                <Text style={[s.td, s.colLocation]}>{order.location || "—"}</Text>
                <Text style={[s.td, s.colDate]}>{formatDate(order.date)}</Text>
                <Text style={[s.td, s.colSigns]}>{countSignQty(order) || "—"}</Text>
                <Text style={[s.td, s.colMisc]}>{countMiscQty(order) || "—"}</Text>
                <Text style={[s.td, s.colStatus]}>
                  {order.billedAmount != null ? `₪${order.billedAmount.toLocaleString()}` : "—"}
                </Text>
              </View>
            ))}

            {orders.length > 0 && (
              <View style={s.totalsRow}>
                <Text style={[s.tdBold, s.colNum]}></Text>
                <Text style={[s.tdBold, s.colOrder]}>סה״כ</Text>
                <Text style={[s.tdBold, s.colJob]}></Text>
                <Text style={[s.tdBold, s.colLocation]}></Text>
                <Text style={[s.tdBold, s.colDate]}>{orders.length} הזמנות</Text>
                <Text style={[s.tdBold, s.colSigns]}>{totalSigns}</Text>
                <Text style={[s.tdBold, s.colMisc]}>{totalMisc}</Text>
                <Text style={[s.tdGold, s.colStatus]}>
                  {grandTotal > 0 ? `₪${grandTotal.toLocaleString()}` : "—"}
                </Text>
              </View>
            )}
          </View>

          {/* Grand total highlight */}
          {grandTotal > 0 && (
            <View style={s.grandTotal}>
              <Text style={s.grandTotalLabel}>סכום כולל לחיוב</Text>
              <Text style={s.grandTotalAmount}>₪{grandTotal.toLocaleString()}</Text>
            </View>
          )}

          {/* Per-order manager notes */}
          {orders.some(o => (o as { generalNotes?: string }).generalNotes) && (
            <View style={s.managerNotesSection}>
              <Text style={s.managerNotesSectionTitle}>הערות מנהל לפי הזמנה</Text>
              {orders
                .filter(o => (o as { generalNotes?: string }).generalNotes)
                .map(o => (
                  <View key={o.id} style={s.managerNotesRow}>
                    <Text style={s.managerNotesNum}>{o.orderNumber}</Text>
                    <Text style={s.managerNotesText}>{(o as { generalNotes?: string }).generalNotes}</Text>
                  </View>
                ))}
            </View>
          )}

          {/* Billing notes */}
          {notes && (
            <View style={s.notesBox}>
              <Text style={s.notesLabel}>הערות חיוב</Text>
              <Text style={s.notesText}>{notes}</Text>
            </View>
          )}

          {/* Signature area */}
          <View style={s.sigSection}>
            <View style={s.sigBox}>
              <Text style={s.sigLabel}>אישור לקוח</Text>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>חתימה ותאריך</Text>
            </View>
            <View style={s.sigBox}>
              <Text style={s.sigLabel}>אישור מנהל חשבונות</Text>
              <View style={s.sigLine} />
              <Text style={s.sigLabel}>חתימה ותאריך</Text>
            </View>
          </View>

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>אלקיים סימון כבישים בע״מ · דוח חיוב עבור: {customerName} · {periodLabel}</Text>
          <Text style={s.footerText}>הופק: {generatedDate} · Road Marking &amp; Signage Solutions</Text>
        </View>

      </Page>
    </Document>
  );
}
