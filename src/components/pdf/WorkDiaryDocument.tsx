import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { WorkDiary } from "@/types/workDiary";

Font.register({
  family: "Heebo",
  fonts: [
    { src: "/fonts/Heebo-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Heebo-Bold.ttf", fontWeight: 700 },
  ],
});

const s = StyleSheet.create({
  page: { fontFamily: "Heebo", fontSize: 9, padding: 24, direction: "rtl" },
  header: {
    textAlign: "center",
    marginBottom: 10,
    borderBottom: "1 solid #e5e7eb",
    paddingBottom: 8,
  },
  company: { fontSize: 13, fontWeight: 700 },
  title: { fontSize: 11, fontWeight: 700, marginTop: 4 },
  meta: { fontSize: 9, color: "#6b7280", marginTop: 2 },
  section: { marginBottom: 10 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
    backgroundColor: "#f3f4f6",
    padding: "3 6",
  },
  fieldRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    marginBottom: 6,
    gap: 4,
  },
  field: { width: "32%", textAlign: "right", marginBottom: 2 },
  label: { fontSize: 7, color: "#6b7280" },
  value: { fontSize: 9, fontWeight: 700 },
  table: { borderTop: "1 solid #e5e7eb", borderRight: "1 solid #e5e7eb" },
  tableRow: { flexDirection: "row-reverse", borderBottom: "1 solid #e5e7eb" },
  th: {
    borderLeft: "1 solid #e5e7eb",
    padding: "2 3",
    backgroundColor: "#f9fafb",
    fontSize: 7,
    fontWeight: 700,
    textAlign: "center",
    flex: 1,
  },
  thWide: {
    borderLeft: "1 solid #e5e7eb",
    padding: "2 4",
    backgroundColor: "#f9fafb",
    fontSize: 7,
    fontWeight: 700,
    textAlign: "right",
    flex: 2,
  },
  td: {
    borderLeft: "1 solid #e5e7eb",
    padding: "2 3",
    fontSize: 8,
    textAlign: "center",
    flex: 1,
  },
  tdWide: {
    borderLeft: "1 solid #e5e7eb",
    padding: "2 4",
    fontSize: 8,
    textAlign: "right",
    flex: 2,
  },
  sigBlock: {
    flexDirection: "row-reverse",
    gap: 12,
    marginTop: 10,
  },
  sigBox: { flex: 1, borderTop: "1 solid #d1d5db", paddingTop: 6 },
  sigLabel: { fontSize: 8, color: "#6b7280", marginBottom: 4 },
  sigName: { fontSize: 9, fontWeight: 700 },
  sigMeta: { fontSize: 7, color: "#9ca3af", marginTop: 2 },
  photoGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  photoWrap: { width: 120 },
  photoImg: { width: 120, height: 90, objectFit: "cover" },
  photoCaption: {
    fontSize: 7,
    color: "#6b7280",
    marginTop: 2,
    textAlign: "center",
  },
});

function fmt(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function F({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || "—"}</Text>
    </View>
  );
}

export function WorkDiaryDocument({ diary }: { diary: WorkDiary }) {
  const hasPainting = diary.paintingItems.some(
    (i) => i.white || i.orange || i.yellow || i.black || i.retroReflective || i.beads
  );
  const hasPoles = diary.poleItems.some(
    (i) => i.name && (i.supply || i.install || i.out || i.dismantle || i.move)
  );
  const hasSigns = diary.signItems.some(
    (i) => i.urban || i.basic || i.regular || i.reinforced || i.diamond || i.supply || i.install
  );

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.company}>אלקיים סימון כבישים בע״מ</Text>
          <Text style={s.title}>יומן עבודה מס׳ {diary.diaryNumber}</Text>
          <Text style={s.meta}>
            {fmt(diary.executionDate)}
            {diary.startTime ? ` | ${diary.startTime}` : ""}
            {diary.endTime ? ` — ${diary.endTime}` : ""}
          </Text>
        </View>

        {/* Project */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>פרטי הפרויקט</Text>
          <View style={s.fieldRow}>
            <F label="שם הקבלן" value={diary.customerName} />
            <F label="אתר העבודה" value={diary.siteName} />
            <F label="איש קשר" value={diary.contactName} />
            <F label="טלפון" value={diary.contactPhone} />
            <F label="תאריך ביצוע" value={fmt(diary.executionDate)} />
            <F label="שעת תחילה" value={diary.startTime} />
            <F label="שעת סיום" value={diary.endTime} />
            <F label="רכב מס׳" value={diary.vehicleNumber} />
            <F label="נגרר מס׳" value={diary.trailerNumber} />
            <F label="שם הנהג" value={diary.driverName} />
            <F label="ראש צוות" value={diary.crewLeaderName} />
            {diary.crewMembers
              .filter(Boolean)
              .map((m, i) => (
                <F key={i} label={`איש צוות ${i + 1}`} value={m} />
              ))}
          </View>
        </View>

        {/* Painting */}
        {hasPainting && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>צביעה וסימון כבישים</Text>
            <View style={s.table}>
              <View style={s.tableRow}>
                <View style={s.thWide}><Text>פריט</Text></View>
                {["לבן", "כתום", "צהוב", "שחור", "קירוצף", "כדוריות", "מידה"].map((h) => (
                  <View key={h} style={s.th}><Text>{h}</Text></View>
                ))}
                <View style={s.thWide}><Text>הערות</Text></View>
              </View>
              {diary.paintingItems
                .filter((i) => i.white || i.orange || i.yellow || i.black || i.retroReflective || i.beads)
                .map((item) => (
                  <View key={item.id} style={s.tableRow}>
                    <View style={s.tdWide}><Text>{item.name}</Text></View>
                    <View style={s.td}><Text>{item.white}</Text></View>
                    <View style={s.td}><Text>{item.orange}</Text></View>
                    <View style={s.td}><Text>{item.yellow}</Text></View>
                    <View style={s.td}><Text>{item.black}</Text></View>
                    <View style={s.td}><Text>{item.retroReflective ? "✓" : ""}</Text></View>
                    <View style={s.td}><Text>{item.beads ? "✓" : ""}</Text></View>
                    <View style={s.td}><Text>{item.size}</Text></View>
                    <View style={s.tdWide}><Text>{item.notes}</Text></View>
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* Poles */}
        {hasPoles && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>עמודים</Text>
            <View style={s.table}>
              <View style={s.tableRow}>
                <View style={s.thWide}><Text>פריט</Text></View>
                {["יצא", "אספקה", "התקנה", "פירוק", "העתקה", "יישור", "חזר", "מידה"].map((h) => (
                  <View key={h} style={s.th}><Text>{h}</Text></View>
                ))}
              </View>
              {diary.poleItems
                .filter((i) => i.name)
                .map((item) => (
                  <View key={item.id} style={s.tableRow}>
                    <View style={s.tdWide}><Text>{item.name}</Text></View>
                    {(["out", "supply", "install", "dismantle", "move", "straighten", "returned", "size"] as const).map((c) => (
                      <View key={c} style={s.td}><Text>{item[c]}</Text></View>
                    ))}
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* Signs */}
        {hasSigns && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>תמרורים</Text>
            <View style={s.table}>
              <View style={s.tableRow}>
                {["עירוני", "ב״ע", "רגיל", "ר״ע", "יהלום", "יצא", "אספקה", "התקנה", "פירוק", "העתקה", "זווית", "מסגרת", "פרופיל", "גודל", "סוללה", "סולרי", "חזר"].map((h) => (
                  <View key={h} style={s.th}><Text>{h}</Text></View>
                ))}
              </View>
              {diary.signItems
                .filter((i) => i.urban || i.basic || i.regular || i.reinforced || i.diamond || i.supply || i.install)
                .map((item) => (
                  <View key={item.id} style={s.tableRow}>
                    {(["urban", "basic", "regular", "reinforced", "diamond", "out", "supply", "install", "dismantle", "move", "angle", "frame", "profile", "signSize"] as const).map((c) => (
                      <View key={c} style={s.td}><Text>{item[c]}</Text></View>
                    ))}
                    <View style={s.td}><Text>{item.battery ? "✓" : ""}</Text></View>
                    <View style={s.td}><Text>{item.solar ? "✓" : ""}</Text></View>
                    <View style={s.td}><Text>{item.returned}</Text></View>
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* Notes */}
        {diary.generalNotes ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>הערות כלליות</Text>
            <Text style={{ fontSize: 9, padding: "4 6" }}>{diary.generalNotes}</Text>
          </View>
        ) : null}

        {/* Signatures */}
        <View style={s.sigBlock}>
          {([
            { label: "חתימת קבלן / מפקח", sig: diary.customerSignature },
            { label: "חתימת ראש צוות", sig: diary.companySignature },
          ] as const).map(({ label, sig }) => (
            <View key={label} style={s.sigBox}>
              <Text style={s.sigLabel}>{label}</Text>
              {sig?.dataUrl ? (
                <Image
                  src={sig.dataUrl}
                  style={{ width: 160, height: 50, objectFit: "contain" }}
                />
              ) : (
                <View style={{ height: 50, borderBottom: "1 solid #d1d5db" }} />
              )}
              {sig?.signerName ? (
                <Text style={s.sigName}>{sig.signerName}</Text>
              ) : null}
              {sig?.signedAt ? (
                <Text style={s.sigMeta}>
                  {new Date(sig.signedAt).toLocaleString("he-IL")}
                </Text>
              ) : null}
              {sig?.location ? (
                <Text style={s.sigMeta}>{sig.location}</Text>
              ) : null}
            </View>
          ))}
        </View>

        {/* Photos */}
        {diary.photos.length > 0 && (
          <View style={[s.section, { marginTop: 12 }]}>
            <Text style={s.sectionTitle}>תמונות מהשטח</Text>
            <View style={s.photoGrid}>
              {diary.photos.map((photo) => (
                <View key={photo.id} style={s.photoWrap}>
                  <Image src={photo.dataUrl} style={s.photoImg} />
                  {photo.caption ? (
                    <Text style={s.photoCaption}>{photo.caption}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}
