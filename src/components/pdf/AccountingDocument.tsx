import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { WorkOrder } from "@/types/workOrder";

Font.register({
  family: "Heebo",
  fonts: [
    { src: "/fonts/Heebo-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Heebo-Bold.ttf", fontWeight: 700 },
  ],
});

const PRIMARY = "#1e3a8a";
const LIGHT   = "#eff6ff";
const BORDER  = "#bfdbfe";
const GRAY    = "#6b7280";
const DARK    = "#111827";

const s = StyleSheet.create({
  page: {
    fontFamily: "Heebo",
    fontSize: 9,
    direction: "rtl",
    backgroundColor: "#ffffff",
    paddingBottom: 40,
  },

  /* ── Header band ── */
  headerBand: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    paddingHorizontal: 28,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontSize: 14, fontWeight: 700, color: "#ffffff" },
  companyTagline: { fontSize: 7, color: "#93c5fd", marginTop: 2 },
  docBlock: { alignItems: "flex-start" },
  docTitle: { fontSize: 13, fontWeight: 700, color: "#ffffff" },
  docSub: { fontSize: 7, color: "#93c5fd", marginTop: 2 },

  /* ── Filter strip ── */
  filterStrip: {
    backgroundColor: "#1e40af",
    paddingVertical: 5,
    paddingHorizontal: 28,
    flexDirection: "row-reverse",
    gap: 12,
    alignItems: "center",
  },
  filterChip: { flexDirection: "row-reverse", gap: 4, alignItems: "center" },
  filterLabel: { fontSize: 7, color: "#93c5fd" },
  filterValue: { fontSize: 7, fontWeight: 700, color: "#e0f2fe" },

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
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: "flex-end",
  },
  chipLabel: { fontSize: 7, color: GRAY },
  chipValue: { fontSize: 13, fontWeight: 700, color: PRIMARY, marginTop: 2 },

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

  colNum:      { width: "5%"  },
  colOrder:    { width: "12%" },
  colCustomer: { width: "20%" },
  colJob:      { width: "18%" },
  colLocation: { width: "18%" },
  colDate:     { width: "11%" },
  colStatus:   { width: "10%" },
  colSigns:    { width: "3%"  },
  colMisc:     { width: "3%"  },

  statusBadge: {
    borderRadius: 3,
    paddingVertical: 1,
    paddingHorizontal: 3,
    backgroundColor: "#f0f9ff",
  },

  /* ── Manager notes appendix ── */
  notesSection: {
    backgroundColor: "#fefce8",
    border: `1 solid #fde68a`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 12,
  },
  notesSectionTitle: { fontSize: 8, fontWeight: 700, color: "#92400e", marginBottom: 5, textAlign: "right" },
  notesRow: { flexDirection: "row-reverse", gap: 6, marginBottom: 3 },
  notesOrderNum: { fontSize: 7, fontWeight: 700, color: "#92400e", textAlign: "right", width: "12%" },
  notesText: { fontSize: 7, color: "#78350f", textAlign: "right", flex: 1 },

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
  graphics_pending:   "ממתין",
  graphics_active:    "גרפיקה",
  graphics_done:      "גרפיקה ✓",
  production:         "ייצור",
  ready_installation: "מוכן",
  completed:          "הושלם",
  cancelled:          "בוטל",
};

export interface AccountingReportData {
  orders: WorkOrder[];
  filterCustomer: string;
  filterDateFrom: string;
  filterDateTo: string;
  filterStatus: string;
  generatedAt: string;
}

export function AccountingDocument({ data }: { data: AccountingReportData }) {
  const { orders, filterCustomer, filterDateFrom, filterDateTo, generatedAt } = data;

  const totalSigns       = orders.reduce((s, o) => s + countSignQty(o), 0);
  const totalMisc        = orders.reduce((s, o) => s + countMiscQty(o), 0);
  const uniqueCustomers  = new Set(orders.map((o) => o.customer)).size;
  const generatedDate    = formatDate(generatedAt.split("T")[0]);

  const hasFilters = filterCustomer || filterDateFrom || filterDateTo;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header band */}
        <View style={s.headerBand}>
          <View style={s.companyBlock}>
            <Text style={s.companyName}>אלקיים סימון כבישים בע״מ</Text>
            <Text style={s.companyTagline}>Road Marking & Signage Solutions</Text>
          </View>
          <View style={s.docBlock}>
            <Text style={s.docTitle}>דוח עבודות</Text>
            <Text style={s.docSub}>Works Report · {generatedDate}</Text>
          </View>
        </View>

        {/* Active filters */}
        {hasFilters && (
          <View style={s.filterStrip}>
            <Text style={s.filterLabel}>סינון פעיל:</Text>
            {filterCustomer ? (
              <View style={s.filterChip}>
                <Text style={s.filterLabel}>לקוח:</Text>
                <Text style={s.filterValue}>{filterCustomer}</Text>
              </View>
            ) : null}
            {filterDateFrom ? (
              <View style={s.filterChip}>
                <Text style={s.filterLabel}>מ-</Text>
                <Text style={s.filterValue}>{formatDate(filterDateFrom)}</Text>
              </View>
            ) : null}
            {filterDateTo ? (
              <View style={s.filterChip}>
                <Text style={s.filterLabel}>עד</Text>
                <Text style={s.filterValue}>{formatDate(filterDateTo)}</Text>
              </View>
            ) : null}
          </View>
        )}

        <View style={s.body}>

          {/* Summary chips */}
          <View style={s.summaryRow}>
            <View style={s.chip}>
              <Text style={s.chipLabel}>הזמנות</Text>
              <Text style={s.chipValue}>{orders.length}</Text>
            </View>
            <View style={s.chip}>
              <Text style={s.chipLabel}>לקוחות</Text>
              <Text style={s.chipValue}>{uniqueCustomers}</Text>
            </View>
            <View style={s.chip}>
              <Text style={s.chipLabel}>שלטים</Text>
              <Text style={s.chipValue}>{totalSigns}</Text>
            </View>
            <View style={s.chip}>
              <Text style={s.chipLabel}>פריטי שונות</Text>
              <Text style={s.chipValue}>{totalMisc}</Text>
            </View>
          </View>

          {/* Table */}
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.th, s.colNum]}>#</Text>
              <Text style={[s.th, s.colOrder]}>הזמנה</Text>
              <Text style={[s.th, s.colCustomer]}>לקוח</Text>
              <Text style={[s.th, s.colJob]}>שם עבודה</Text>
              <Text style={[s.th, s.colLocation]}>מיקום</Text>
              <Text style={[s.th, s.colDate]}>תאריך</Text>
              <Text style={[s.th, s.colStatus]}>סטטוס</Text>
              <Text style={[s.th, s.colSigns]}>שלטים</Text>
              <Text style={[s.th, s.colMisc]}>שונות</Text>
            </View>

            {orders.map((order, idx) => (
              <View key={order.id} style={idx % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                <Text style={[s.td, s.colNum]}>{idx + 1}</Text>
                <Text style={[s.td, s.colOrder]}>{order.orderNumber}</Text>
                <Text style={[s.td, s.colCustomer]}>{order.customer}</Text>
                <Text style={[s.td, s.colJob]}>{order.jobName || "—"}</Text>
                <Text style={[s.td, s.colLocation]}>{order.location || "—"}</Text>
                <Text style={[s.td, s.colDate]}>{formatDate(order.date)}</Text>
                <Text style={[s.td, s.colStatus]}>{STATUS_LABELS[order.status] || order.status}</Text>
                <Text style={[s.td, s.colSigns]}>{countSignQty(order) || "—"}</Text>
                <Text style={[s.td, s.colMisc]}>{countMiscQty(order) || "—"}</Text>
              </View>
            ))}

            {orders.length > 0 && (
              <View style={s.totalsRow}>
                <Text style={[s.tdBold, s.colNum]}></Text>
                <Text style={[s.tdBold, s.colOrder]}>סה״כ</Text>
                <Text style={[s.tdBold, s.colCustomer]}>{uniqueCustomers} לקוחות</Text>
                <Text style={[s.tdBold, s.colJob]}></Text>
                <Text style={[s.tdBold, s.colLocation]}></Text>
                <Text style={[s.tdBold, s.colDate]}>{orders.length} הזמנות</Text>
                <Text style={[s.tdBold, s.colStatus]}></Text>
                <Text style={[s.tdBold, s.colSigns]}>{totalSigns}</Text>
                <Text style={[s.tdBold, s.colMisc]}>{totalMisc}</Text>
              </View>
            )}
          </View>

          {/* Manager notes appendix */}
          {orders.some(o => (o as { generalNotes?: string }).generalNotes) && (
            <View style={s.notesSection}>
              <Text style={s.notesSectionTitle}>הערות מנהל לפי הזמנה</Text>
              {orders
                .filter(o => (o as { generalNotes?: string }).generalNotes)
                .map(o => (
                  <View key={o.id} style={s.notesRow}>
                    <Text style={s.notesOrderNum}>{o.orderNumber}</Text>
                    <Text style={s.notesText}>{(o as { generalNotes?: string }).generalNotes}</Text>
                  </View>
                ))}
            </View>
          )}

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>אלקיים סימון כבישים בע״מ · דוח עבודות</Text>
          <Text style={s.footerText}>הופק: {generatedDate} · לשימוש פנימי בלבד</Text>
        </View>

      </Page>
    </Document>
  );
}
