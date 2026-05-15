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

const PRIMARY = "#1d4ed8";
const LIGHT_BG = "#eff6ff";
const BORDER = "#dbeafe";
const GRAY = "#6b7280";
const DARK = "#111827";

const s = StyleSheet.create({
  page: {
    fontFamily: "Heebo",
    fontSize: 9,
    padding: 0,
    direction: "rtl",
    backgroundColor: "#ffffff",
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
  headerLeft: { alignItems: "flex-end" },
  companyName: { fontSize: 15, fontWeight: 700, color: "#ffffff" },
  companyTagline: { fontSize: 8, color: "#bfdbfe", marginTop: 2 },
  headerRight: { alignItems: "flex-start" },
  docTitle: { fontSize: 13, fontWeight: 700, color: "#ffffff" },
  orderNumberLabel: { fontSize: 7, color: "#bfdbfe", marginTop: 3 },
  orderNumberValue: { fontSize: 11, fontWeight: 700, color: "#facc15" },

  /* ── Body padding ── */
  body: { paddingHorizontal: 28, paddingTop: 16, paddingBottom: 50 },

  /* ── Meta grid ── */
  metaGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
    backgroundColor: LIGHT_BG,
    borderRadius: 6,
    padding: 10,
    border: `1 solid ${BORDER}`,
  },
  metaField: { width: "22%", textAlign: "right" },
  metaLabel: { fontSize: 7, color: GRAY, marginBottom: 2, textAlign: "right" },
  metaValue: { fontSize: 9, fontWeight: 700, textAlign: "right", color: DARK },

  /* ── Section heading ── */
  sectionHeading: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 6,
    gap: 6,
  },
  sectionBar: { width: 3, height: 12, backgroundColor: PRIMARY, borderRadius: 2 },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: PRIMARY },

  /* ── Table ── */
  table: { marginBottom: 16, border: `1 solid ${BORDER}`, borderRadius: 4 },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: PRIMARY,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottom: `1 solid #f0f4ff`,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  tableRowAlt: {
    flexDirection: "row-reverse",
    borderBottom: `1 solid #f0f4ff`,
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: LIGHT_BG,
    alignItems: "center",
  },
  th: { fontSize: 8, fontWeight: 700, color: "#ffffff", textAlign: "right" },
  td: { fontSize: 8, color: DARK, textAlign: "right" },
  emptyRow: { padding: 10, textAlign: "center", color: GRAY, fontSize: 8 },

  /* Column widths — signs */
  colNum:     { width: "10%" },
  colQty:     { width: "8%"  },
  colSize:    { width: "18%" },
  colType:    { width: "18%" },
  colImg:     { width: "10%", textAlign: "center" },
  colNotes:   { width: "36%" },

  /* Column widths — misc */
  mColDesc:   { width: "55%" },
  mColQty:    { width: "12%" },
  mColUnit:   { width: "15%" },
  mColNotes:  { width: "18%" },

  signImage: { width: 28, height: 28, objectFit: "contain" },

  /* ── Manager note ── */
  managerNote: {
    backgroundColor: "#fefce8",
    border: `1 solid #fde68a`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 6,
  },
  managerNoteLabel: { fontSize: 8, fontWeight: 700, color: "#92400e", marginBottom: 3, textAlign: "right" },
  managerNoteText: { fontSize: 8, color: "#78350f", textAlign: "right" },

  /* ── Signature block ── */
  sigSection: {
    marginTop: 28,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    gap: 20,
  },
  sigBox: { flex: 1, borderTop: `2 solid ${PRIMARY}`, paddingTop: 6 },
  sigLabel: { fontSize: 8, color: GRAY, textAlign: "right" },
  sigLine: { marginTop: 24, borderBottom: `1 dashed #d1d5db` },

  /* ── Footer ── */
  footer: {
    position: "absolute",
    bottom: 0,
    right: 0,
    left: 0,
    backgroundColor: "#f8fafc",
    borderTop: `1 solid ${BORDER}`,
    paddingVertical: 6,
    paddingHorizontal: 28,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: "#9ca3af" },
});

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  execution:        "ביצוע עבודה",
  pickup:           "הזמנה לאיסוף",
  equipment_supply: "אספקת ציוד",
};

interface Props {
  order: OrderSnapshot;
}

export function OrderDocument({ order }: Props) {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const generatedAt = formatDate(new Date().toISOString().split("T")[0]);
  const orderTypeLabel = ORDER_TYPE_LABELS[(order as { orderType?: string }).orderType ?? ""] || "ביצוע עבודה";

  const signRows = order.signRows.filter((r) => r.signNumber || r.quantity);
  const miscRows = order.miscRows.filter((r) => r.description);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header band */}
        <View style={s.headerBand}>
          <View style={s.headerLeft}>
            <Text style={s.companyName}>אלקיים סימון כבישים בע״מ</Text>
            <Text style={s.companyTagline}>Road Marking & Signage Solutions</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>הזמנת שילוט</Text>
            <Text style={s.orderNumberLabel}>מספר הזמנה</Text>
            <Text style={s.orderNumberValue}>{(order as { orderNumber?: string }).orderNumber || "—"}</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* Meta grid */}
          <View style={s.metaGrid}>
            <View style={s.metaField}>
              <Text style={s.metaLabel}>תאריך הזמנה</Text>
              <Text style={s.metaValue}>{formatDate(order.date)}</Text>
            </View>
            <View style={s.metaField}>
              <Text style={s.metaLabel}>שם הלקוח</Text>
              <Text style={s.metaValue}>{order.customer || "—"}</Text>
            </View>
            <View style={s.metaField}>
              <Text style={s.metaLabel}>עיר / מיקום</Text>
              <Text style={s.metaValue}>{order.city || (order as { location?: string }).location || "—"}</Text>
            </View>
            <View style={s.metaField}>
              <Text style={s.metaLabel}>סוג הזמנה</Text>
              <Text style={s.metaValue}>{orderTypeLabel}</Text>
            </View>
            <View style={s.metaField}>
              <Text style={s.metaLabel}>מזמין</Text>
              <Text style={s.metaValue}>{order.orderedBy || "—"}</Text>
            </View>
            <View style={s.metaField}>
              <Text style={s.metaLabel}>איש קשר</Text>
              <Text style={s.metaValue}>{order.contactPerson || "—"}</Text>
            </View>
            {(order as { jobName?: string }).jobName ? (
              <View style={{ width: "46%", textAlign: "right" }}>
                <Text style={s.metaLabel}>שם עבודה</Text>
                <Text style={s.metaValue}>{(order as { jobName?: string }).jobName}</Text>
              </View>
            ) : null}
          </View>

          {/* Signs section */}
          <View style={s.sectionHeading}>
            <View style={s.sectionBar} />
            <Text style={s.sectionTitle}>תמרורים ושלטים</Text>
          </View>
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.th, s.colNum]}>מספר</Text>
              <Text style={[s.th, s.colQty]}>כמות</Text>
              <Text style={[s.th, s.colSize]}>מידות</Text>
              <Text style={[s.th, s.colType]}>סוג</Text>
              <Text style={[s.th, s.colImg]}>תמונה</Text>
              <Text style={[s.th, s.colNotes]}>הערות</Text>
            </View>
            {signRows.length === 0 ? (
              <Text style={s.emptyRow}>אין תמרורים בהזמנה זו</Text>
            ) : signRows.map((row, i) => (
              <View key={row.id} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                <Text style={[s.td, s.colNum]}>{row.signNumber}</Text>
                <Text style={[s.td, s.colQty]}>{row.quantity}</Text>
                <Text style={[s.td, s.colSize]}>{row.size || "—"}</Text>
                <Text style={[s.td, s.colType]}>{row.type || "—"}</Text>
                <View style={s.colImg}>
                  {row.imageUrl ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image src={origin + row.imageUrl} style={s.signImage} />
                  ) : (
                    <Text style={s.td}>—</Text>
                  )}
                </View>
                <Text style={[s.td, s.colNotes]}>{row.notes || "—"}</Text>
              </View>
            ))}
          </View>

          {/* Misc section */}
          {miscRows.length > 0 && (
            <>
              <View style={s.sectionHeading}>
                <View style={s.sectionBar} />
                <Text style={s.sectionTitle}>פריטים נוספים / שונות</Text>
              </View>
              <View style={s.table}>
                <View style={s.tableHeader}>
                  <Text style={[s.th, s.mColDesc]}>תיאור פריט</Text>
                  <Text style={[s.th, s.mColQty]}>כמות</Text>
                  <Text style={[s.th, s.mColUnit]}>יחידה</Text>
                  <Text style={[s.th, s.mColNotes]}>הערות</Text>
                </View>
                {miscRows.map((row, i) => (
                  <View key={row.id} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                    <Text style={[s.td, s.mColDesc]}>{row.description}</Text>
                    <Text style={[s.td, s.mColQty]}>{row.quantity || "—"}</Text>
                    <Text style={[s.td, s.mColUnit]}>{(row as { catalogItemUnit?: string }).catalogItemUnit || "—"}</Text>
                    <Text style={[s.td, s.mColNotes]}>{row.notes || "—"}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Manager note */}
          {(order as { generalNotes?: string }).generalNotes ? (
            <View style={s.managerNote}>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={s.managerNoteLabel}>הערת מנהל</Text>
                <Text style={s.managerNoteText}>{(order as { generalNotes?: string }).generalNotes}</Text>
              </View>
            </View>
          ) : null}

          {/* Signature block */}
          <View style={s.sigSection}>
            <View style={s.sigBox}>
              <Text style={s.sigLabel}>חתימת מורשה / מנהל</Text>
              <View style={s.sigLine} />
              <Text style={[s.sigLabel, { marginTop: 3 }]}>שם מלא ותאריך</Text>
            </View>
            <View style={s.sigBox}>
              <Text style={s.sigLabel}>חתימת לקוח / מפקח</Text>
              <View style={s.sigLine} />
              <Text style={[s.sigLabel, { marginTop: 3 }]}>שם מלא ותאריך</Text>
            </View>
            <View style={s.sigBox}>
              <Text style={s.sigLabel}>חותמת חברה (אם נדרש)</Text>
              <View style={s.sigLine} />
            </View>
          </View>

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>אלקיים סימון כבישים בע״מ · מסמך פנימי בלבד</Text>
          <Text style={s.footerText}>הופק: {generatedAt}</Text>
        </View>

      </Page>
    </Document>
  );
}
