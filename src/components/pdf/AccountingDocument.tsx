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

const styles = StyleSheet.create({
  page: {
    fontFamily: "Heebo",
    fontSize: 10,
    padding: 30,
    direction: "rtl",
  },
  companyName: {
    fontSize: 14,
    fontWeight: 700,
    textAlign: "right",
    marginBottom: 2,
  },
  reportTitle: {
    fontSize: 11,
    fontWeight: 700,
    textAlign: "right",
    color: "#374151",
    marginBottom: 4,
  },
  meta: {
    fontSize: 8,
    color: "#6b7280",
    textAlign: "right",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row-reverse",
    gap: 16,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: "1 solid #e5e7eb",
  },
  summaryChip: {
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  summaryLabel: {
    fontSize: 7,
    color: "#6b7280",
    textAlign: "right",
  },
  summaryValue: {
    fontSize: 11,
    fontWeight: 700,
    textAlign: "right",
    color: "#111827",
  },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: "#f3f4f6",
    borderBottom: "1 solid #d1d5db",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottom: "1 solid #f3f4f6",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRowAlt: {
    flexDirection: "row-reverse",
    borderBottom: "1 solid #f3f4f6",
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: "#f9fafb",
  },
  totalsRow: {
    flexDirection: "row-reverse",
    borderTop: "1 solid #d1d5db",
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: "#eff6ff",
  },
  th: {
    fontSize: 8,
    fontWeight: 700,
    textAlign: "right",
    color: "#374151",
  },
  td: {
    fontSize: 8,
    textAlign: "right",
    color: "#111827",
  },
  tdBold: {
    fontSize: 8,
    fontWeight: 700,
    textAlign: "right",
    color: "#111827",
  },
  colNum: { width: "5%" },
  colOrder: { width: "12%" },
  colCustomer: { width: "20%" },
  colLocation: { width: "20%" },
  colDate: { width: "13%" },
  colStatus: { width: "15%" },
  colSigns: { width: "7%" },
  colMisc: { width: "8%" },
  footer: {
    position: "absolute",
    bottom: 20,
    right: 30,
    left: 30,
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "right",
    borderTop: "1 solid #e5e7eb",
    paddingTop: 4,
  },
});

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function countSignQty(order: WorkOrder): number {
  return order.signRows.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
}

function countMiscQty(order: WorkOrder): number {
  return order.miscRows.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
}

const STATUS_LABELS_HE: Record<string, string> = {
  graphics_pending: "ממתין לגרפיקה",
  graphics_active: "בטיפול גרפיקה",
  graphics_done: "גרפיקה הושלמה",
  production: "בייצור",
  ready_installation: "מוכן להתקנה",
  completed: "הושלם",
  cancelled: "בוטל",
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

  const totalSigns = orders.reduce((s, o) => s + countSignQty(o), 0);
  const totalMisc = orders.reduce((s, o) => s + countMiscQty(o), 0);
  const uniqueCustomers = new Set(orders.map((o) => o.customer)).size;

  const filterParts: string[] = [];
  if (filterCustomer) filterParts.push(`לקוח: ${filterCustomer}`);
  if (filterDateFrom) filterParts.push(`מ: ${formatDate(filterDateFrom)}`);
  if (filterDateTo) filterParts.push(`עד: ${formatDate(filterDateTo)}`);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.companyName}>אלקיים סימון כבישים בע״מ</Text>
        <Text style={styles.reportTitle}>דוח עבודות</Text>
        {filterParts.length > 0 && (
          <Text style={styles.meta}>{filterParts.join(" | ")}</Text>
        )}
        <Text style={styles.meta}>נוצר: {formatDate(generatedAt.split("T")[0])}</Text>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>הזמנות</Text>
            <Text style={styles.summaryValue}>{orders.length}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>לקוחות ייחודיים</Text>
            <Text style={styles.summaryValue}>{uniqueCustomers}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>שלטים (כמות)</Text>
            <Text style={styles.summaryValue}>{totalSigns}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>פריטי שונות (כמות)</Text>
            <Text style={styles.summaryValue}>{totalMisc}</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colNum]}>#</Text>
          <Text style={[styles.th, styles.colOrder]}>הזמנה</Text>
          <Text style={[styles.th, styles.colCustomer]}>לקוח</Text>
          <Text style={[styles.th, styles.colLocation]}>מיקום</Text>
          <Text style={[styles.th, styles.colDate]}>תאריך</Text>
          <Text style={[styles.th, styles.colStatus]}>סטטוס</Text>
          <Text style={[styles.th, styles.colSigns]}>שלטים</Text>
          <Text style={[styles.th, styles.colMisc]}>שונות</Text>
        </View>

        {/* Rows */}
        {orders.map((order, idx) => (
          <View key={order.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.td, styles.colNum]}>{idx + 1}</Text>
            <Text style={[styles.td, styles.colOrder]}>{order.orderNumber}</Text>
            <Text style={[styles.td, styles.colCustomer]}>{order.customer}</Text>
            <Text style={[styles.td, styles.colLocation]}>{order.location || "—"}</Text>
            <Text style={[styles.td, styles.colDate]}>{formatDate(order.date)}</Text>
            <Text style={[styles.td, styles.colStatus]}>{STATUS_LABELS_HE[order.status] || order.status}</Text>
            <Text style={[styles.td, styles.colSigns]}>{countSignQty(order)}</Text>
            <Text style={[styles.td, styles.colMisc]}>{countMiscQty(order)}</Text>
          </View>
        ))}

        {/* Totals */}
        {orders.length > 0 && (
          <View style={styles.totalsRow}>
            <Text style={[styles.tdBold, styles.colNum]}></Text>
            <Text style={[styles.tdBold, styles.colOrder]}>סה״כ</Text>
            <Text style={[styles.tdBold, styles.colCustomer]}></Text>
            <Text style={[styles.tdBold, styles.colLocation]}></Text>
            <Text style={[styles.tdBold, styles.colDate]}></Text>
            <Text style={[styles.tdBold, styles.colStatus]}>{orders.length} הזמנות</Text>
            <Text style={[styles.tdBold, styles.colSigns]}>{totalSigns}</Text>
            <Text style={[styles.tdBold, styles.colMisc]}>{totalMisc}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          נוצר ב-{formatDate(generatedAt.split("T")[0])} על ידי מערכת אלקיים
        </Text>
      </Page>
    </Document>
  );
}
