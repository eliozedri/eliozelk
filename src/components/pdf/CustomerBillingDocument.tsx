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
    padding: 36,
    direction: "rtl",
  },
  companyName: {
    fontSize: 15,
    fontWeight: 700,
    textAlign: "right",
    marginBottom: 2,
  },
  reportTitle: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: "right",
    color: "#1d4ed8",
    marginBottom: 2,
  },
  customerLine: {
    fontSize: 10,
    textAlign: "right",
    color: "#374151",
    marginBottom: 2,
  },
  meta: {
    fontSize: 8,
    color: "#6b7280",
    textAlign: "right",
    marginBottom: 12,
  },
  divider: {
    borderBottom: "1 solid #e5e7eb",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row-reverse",
    gap: 12,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: "1 solid #e5e7eb",
  },
  summaryChip: {
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  summaryLabel: {
    fontSize: 7,
    color: "#6b7280",
    textAlign: "right",
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: "right",
    color: "#1d4ed8",
  },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: "#1d4ed8",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottom: "1 solid #f3f4f6",
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  tableRowAlt: {
    flexDirection: "row-reverse",
    borderBottom: "1 solid #f3f4f6",
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: "#f8fafc",
  },
  totalsRow: {
    flexDirection: "row-reverse",
    borderTop: "2 solid #1d4ed8",
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: "#eff6ff",
    marginTop: 2,
  },
  th: {
    fontSize: 8,
    fontWeight: 700,
    textAlign: "right",
    color: "#ffffff",
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
  colNum:      { width: "5%"  },
  colOrder:    { width: "14%" },
  colJob:      { width: "22%" },
  colLocation: { width: "20%" },
  colDate:     { width: "12%" },
  colSigns:    { width: "9%"  },
  colMisc:     { width: "9%"  },
  colAmount:   { width: "9%"  },
  footer: {
    position: "absolute",
    bottom: 20,
    right: 36,
    left: 36,
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "right",
    borderTop: "1 solid #e5e7eb",
    paddingTop: 4,
  },
  notesBox: {
    marginTop: 16,
    padding: 8,
    backgroundColor: "#fefce8",
    borderRadius: 4,
    border: "1 solid #fde047",
  },
  notesLabel: {
    fontSize: 8,
    fontWeight: 700,
    textAlign: "right",
    color: "#92400e",
    marginBottom: 3,
  },
  notesText: {
    fontSize: 8,
    textAlign: "right",
    color: "#78350f",
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
  const totalMisc = orders.reduce((s, o) => s + countMiscQty(o), 0);

  const periodLabel =
    dateFrom && dateTo
      ? `${formatDate(dateFrom)} — ${formatDate(dateTo)}`
      : dateFrom
      ? `מ-${formatDate(dateFrom)}`
      : dateTo
      ? `עד ${formatDate(dateTo)}`
      : "כל התקופה";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <Text style={styles.companyName}>אלקיים סימון כבישים בע״מ</Text>
        <Text style={styles.reportTitle}>דוח חיוב לקוח</Text>
        <Text style={styles.customerLine}>לקוח: {customerName}</Text>
        <Text style={styles.meta}>תקופה: {periodLabel}</Text>
        <Text style={styles.meta}>נוצר: {formatDate(generatedAt.split("T")[0])}</Text>
        <View style={styles.divider} />

        {/* Summary chips */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>הזמנות</Text>
            <Text style={styles.summaryValue}>{orders.length}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>שלטים (סה״כ)</Text>
            <Text style={styles.summaryValue}>{totalSigns}</Text>
          </View>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>פריטי שונות (סה״כ)</Text>
            <Text style={styles.summaryValue}>{totalMisc}</Text>
          </View>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colNum]}>#</Text>
          <Text style={[styles.th, styles.colOrder]}>מס׳ הזמנה</Text>
          <Text style={[styles.th, styles.colJob]}>שם עבודה</Text>
          <Text style={[styles.th, styles.colLocation]}>מיקום</Text>
          <Text style={[styles.th, styles.colDate]}>תאריך</Text>
          <Text style={[styles.th, styles.colSigns]}>שלטים</Text>
          <Text style={[styles.th, styles.colMisc]}>שונות</Text>
          <Text style={[styles.th, styles.colAmount]}>לחיוב</Text>
        </View>

        {/* Order rows */}
        {orders.map((order, idx) => (
          <View key={order.id} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
            <Text style={[styles.td, styles.colNum]}>{idx + 1}</Text>
            <Text style={[styles.td, styles.colOrder]}>{order.orderNumber}</Text>
            <Text style={[styles.td, styles.colJob]}>{order.jobName || "—"}</Text>
            <Text style={[styles.td, styles.colLocation]}>{order.location || "—"}</Text>
            <Text style={[styles.td, styles.colDate]}>{formatDate(order.date)}</Text>
            <Text style={[styles.td, styles.colSigns]}>{countSignQty(order) || "—"}</Text>
            <Text style={[styles.td, styles.colMisc]}>{countMiscQty(order) || "—"}</Text>
            <Text style={[styles.td, styles.colAmount]}>
              {order.billedAmount != null ? `₪${order.billedAmount.toLocaleString()}` : "—"}
            </Text>
          </View>
        ))}

        {/* Totals */}
        {orders.length > 0 && (
          <View style={styles.totalsRow}>
            <Text style={[styles.tdBold, styles.colNum]}></Text>
            <Text style={[styles.tdBold, styles.colOrder]}>סה״כ</Text>
            <Text style={[styles.tdBold, styles.colJob]}></Text>
            <Text style={[styles.tdBold, styles.colLocation]}></Text>
            <Text style={[styles.tdBold, styles.colDate]}>{orders.length} הזמנות</Text>
            <Text style={[styles.tdBold, styles.colSigns]}>{totalSigns}</Text>
            <Text style={[styles.tdBold, styles.colMisc]}>{totalMisc}</Text>
            <Text style={[styles.tdBold, styles.colAmount]}>
              {(() => {
                const total = orders.reduce((s, o) => s + (o.billedAmount ?? 0), 0);
                return total > 0 ? `₪${total.toLocaleString()}` : "—";
              })()}
            </Text>
          </View>
        )}

        {/* Notes */}
        {notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>הערות</Text>
            <Text style={styles.notesText}>{notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          נוצר ב-{formatDate(generatedAt.split("T")[0])} · אלקיים סימון כבישים בע״מ · מסמך זה מיועד לשימוש פנימי בלבד
        </Text>
      </Page>
    </Document>
  );
}
