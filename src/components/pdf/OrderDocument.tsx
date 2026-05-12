import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { OrderSnapshot } from "@/types/order";

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
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: "right",
    marginBottom: 12,
    color: "#374151",
  },
  headerGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
    borderBottom: "1 solid #e5e7eb",
    paddingBottom: 10,
  },
  headerField: {
    width: "22%",
    textAlign: "right",
  },
  headerLabel: {
    fontSize: 8,
    color: "#6b7280",
    marginBottom: 2,
    textAlign: "right",
  },
  headerValue: {
    fontSize: 10,
    fontWeight: 700,
    textAlign: "right",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textAlign: "right",
    marginBottom: 6,
    color: "#1f2937",
  },
  table: {
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: "#f3f4f6",
    borderBottom: "1 solid #d1d5db",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottom: "1 solid #f3f4f6",
    paddingVertical: 4,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  th: {
    fontSize: 9,
    fontWeight: 700,
    textAlign: "right",
    color: "#374151",
  },
  td: {
    fontSize: 9,
    textAlign: "right",
    color: "#111827",
  },
  colNumber: { width: "12%", textAlign: "right" },
  colQty: { width: "8%", textAlign: "right" },
  colNotes: { width: "20%", textAlign: "right" },
  colImage: { width: "12%", textAlign: "center" },
  colSize: { width: "20%", textAlign: "right" },
  colType: { width: "20%", textAlign: "right" },
  signImage: {
    width: 32,
    height: 32,
    objectFit: "contain",
  },
  miscColDesc: { width: "50%", textAlign: "right" },
  miscColQty: { width: "15%", textAlign: "right" },
  miscColNotes: { width: "35%", textAlign: "right" },
});

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface Props {
  order: OrderSnapshot;
}

export function OrderDocument({ order }: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.companyName}>אלקיים סימון כבישים בע״מ</Text>
        <Text style={styles.title}>הזמנת שילוט</Text>

        {/* Header */}
        <View style={styles.headerGrid}>
          <View style={styles.headerField}>
            <Text style={styles.headerLabel}>תאריך</Text>
            <Text style={styles.headerValue}>{formatDate(order.date)}</Text>
          </View>
          <View style={styles.headerField}>
            <Text style={styles.headerLabel}>שם החברה</Text>
            <Text style={styles.headerValue}>{order.customer || "—"}</Text>
          </View>
          <View style={styles.headerField}>
            <Text style={styles.headerLabel}>עיר</Text>
            <Text style={styles.headerValue}>{order.city || "—"}</Text>
          </View>
          <View style={styles.headerField}>
            <Text style={styles.headerLabel}>מזמין</Text>
            <Text style={styles.headerValue}>{order.orderedBy || "—"}</Text>
          </View>
          <View style={styles.headerField}>
            <Text style={styles.headerLabel}>סלאש</Text>
            <Text style={styles.headerValue}>{order.jobSlash || "—"}</Text>
          </View>
        </View>

        {/* Signs table */}
        <Text style={styles.sectionTitle}>תמרורים</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colNumber]}>מספר</Text>
            <Text style={[styles.th, styles.colQty]}>כמות</Text>
            <Text style={[styles.th, styles.colNotes]}>הערות</Text>
            <Text style={[styles.th, styles.colImage]}>תמונה</Text>
            <Text style={[styles.th, styles.colSize]}>מידות</Text>
            <Text style={[styles.th, styles.colType]}>סוג</Text>
          </View>
          {order.signRows
            .filter((r) => r.signNumber || r.quantity)
            .map((row) => (
              <View key={row.id} style={styles.tableRow}>
                <Text style={[styles.td, styles.colNumber]}>{row.signNumber}</Text>
                <Text style={[styles.td, styles.colQty]}>{row.quantity}</Text>
                <Text style={[styles.td, styles.colNotes]}>{row.notes}</Text>
                <View style={styles.colImage}>
                  {row.imageUrl ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image
                      src={origin + row.imageUrl}
                      style={styles.signImage}
                    />
                  ) : (
                    <Text style={styles.td}>—</Text>
                  )}
                </View>
                <Text style={[styles.td, styles.colSize]}>{row.size}</Text>
                <Text style={[styles.td, styles.colType]}>{row.type}</Text>
              </View>
            ))}
        </View>

        {/* Misc table */}
        {order.miscRows.some((r) => r.description) && (
          <>
            <Text style={styles.sectionTitle}>שונות</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.miscColDesc]}>תיאור פריט</Text>
                <Text style={[styles.th, styles.miscColQty]}>כמות</Text>
                <Text style={[styles.th, styles.miscColNotes]}>הערות</Text>
              </View>
              {order.miscRows
                .filter((r) => r.description)
                .map((row) => (
                  <View key={row.id} style={styles.tableRow}>
                    <Text style={[styles.td, styles.miscColDesc]}>{row.description}</Text>
                    <Text style={[styles.td, styles.miscColQty]}>{row.quantity}</Text>
                    <Text style={[styles.td, styles.miscColNotes]}>{row.notes}</Text>
                  </View>
                ))}
            </View>
          </>
        )}

        {/* Signature line */}
        <View style={{ marginTop: 30, flexDirection: "row-reverse", justifyContent: "space-between" }}>
          <View style={{ width: "40%", borderTop: "1 solid #374151", paddingTop: 4 }}>
            <Text style={{ fontSize: 9, textAlign: "right", color: "#6b7280" }}>חתימת מורשה</Text>
          </View>
          <View style={{ width: "40%", borderTop: "1 solid #374151", paddingTop: 4 }}>
            <Text style={{ fontSize: 9, textAlign: "right", color: "#6b7280" }}>תאריך אישור</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
