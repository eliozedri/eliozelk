/* eslint-disable jsx-a11y/alt-text -- react-pdf Image component does not support alt; accessibility rules do not apply to PDF output */
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
import {
  DOC_PRIMARY,
  DOC_LIGHT,
  DOC_BORDER,
  DOC_GRAY,
  DOC_DARK,
  DOC_LIGHT_TEXT,
  DOC_GOLD,
} from "@/lib/pdfBrand";

Font.register({
  family: "Heebo",
  fonts: [
    { src: "/fonts/Heebo-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Heebo-Bold.ttf", fontWeight: 700 },
  ],
});

const PRIMARY = DOC_PRIMARY;
const LIGHT = DOC_LIGHT;
const BORDER = DOC_BORDER;
const GRAY = DOC_GRAY;

const s = StyleSheet.create({
  page: {
    fontFamily: "Heebo",
    fontSize: 8,
    direction: "rtl",
    backgroundColor: "#ffffff",
    paddingBottom: 44,
  },

  /* ── Header ── */
  headerBand: {
    backgroundColor: PRIMARY,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  companyBlock: { alignItems: "flex-end" },
  companyName: { fontSize: 13, fontWeight: 700, color: "#ffffff" },
  companyTagline: { fontSize: 7, color: DOC_LIGHT_TEXT, marginTop: 2 },
  diaryBlock: { alignItems: "flex-start" },
  docTitle: { fontSize: 12, fontWeight: 700, color: "#ffffff" },
  diaryNumLabel: { fontSize: 7, color: DOC_LIGHT_TEXT, marginTop: 2 },
  diaryNum: { fontSize: 10, fontWeight: 700, color: DOC_GOLD },

  body: { paddingHorizontal: 24, paddingTop: 14 },

  /* ── Date/time strip ── */
  dateStrip: {
    flexDirection: "row-reverse",
    gap: 16,
    backgroundColor: LIGHT,
    border: `1 solid ${BORDER}`,
    borderRadius: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 12,
    alignItems: "center",
  },
  dateChip: { alignItems: "flex-end" },
  dateLabel: { fontSize: 6, color: GRAY },
  dateValue: { fontSize: 9, fontWeight: 700, color: "#1e3a8a" },

  /* ── Section ── */
  section: { marginBottom: 10 },
  sectionHead: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 5,
    gap: 5,
  },
  sectionAccent: { width: 3, height: 11, backgroundColor: PRIMARY, borderRadius: 2 },
  sectionTitle: { fontSize: 9, fontWeight: 700, color: PRIMARY },

  /* ── Field grid ── */
  fieldGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 5,
    backgroundColor: "#f9fafb",
    border: `1 solid #e5e7eb`,
    borderRadius: 4,
    padding: 8,
  },
  field: { width: "31%", textAlign: "right", marginBottom: 2 },
  fieldFull: { width: "98%", textAlign: "right", marginBottom: 2 },
  label: { fontSize: 6, color: GRAY },
  value: { fontSize: 8, fontWeight: 700, color: "#111827" },

  /* ── Table ── */
  table: {
    borderTop: `1 solid ${BORDER}`,
    borderRight: `1 solid ${BORDER}`,
    borderRadius: 3,
  },
  tableHeaderRow: {
    flexDirection: "row-reverse",
    backgroundColor: PRIMARY,
    borderBottom: `1 solid ${BORDER}`,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottom: `1 solid #e5e7eb`,
  },
  tableRowAlt: {
    flexDirection: "row-reverse",
    borderBottom: `1 solid #e5e7eb`,
    backgroundColor: LIGHT,
  },
  thCell: {
    borderLeft: `1 solid #3b82f6`,
    paddingVertical: 3,
    paddingHorizontal: 3,
    fontSize: 7,
    fontWeight: 700,
    color: "#ffffff",
    textAlign: "center",
    flex: 1,
  },
  thCellWide: {
    borderLeft: `1 solid #3b82f6`,
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 7,
    fontWeight: 700,
    color: "#ffffff",
    textAlign: "right",
    flex: 2,
  },
  tdCell: {
    borderLeft: `1 solid #e5e7eb`,
    paddingVertical: 3,
    paddingHorizontal: 3,
    fontSize: 7,
    textAlign: "center",
    flex: 1,
    color: "#111827",
  },
  tdCellWide: {
    borderLeft: `1 solid #e5e7eb`,
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 7,
    textAlign: "right",
    flex: 2,
    color: "#111827",
  },

  /* ── Notes box ── */
  notesBox: {
    backgroundColor: "#fefce8",
    border: `1 solid #fde047`,
    borderRadius: 4,
    padding: 8,
    marginTop: 4,
  },
  notesText: { fontSize: 8, color: "#78350f" },

  /* ── Signatures ── */
  sigBlock: {
    flexDirection: "row-reverse",
    gap: 14,
    marginTop: 14,
  },
  sigBox: {
    flex: 1,
    borderTop: `2 solid ${PRIMARY}`,
    paddingTop: 8,
  },
  sigLabel: { fontSize: 7, color: GRAY, marginBottom: 4 },
  sigName: { fontSize: 8, fontWeight: 700, color: DOC_DARK },
  sigMeta: { fontSize: 6, color: "#9ca3af", marginTop: 2 },
  sigImageWrap: {
    height: 64,
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    padding: 4,
    marginBottom: 4,
  },
  sigBlankLine: { height: 60, borderBottom: `1 dashed #d1d5db` },

  /* ── Landscape page (signs table) ── */
  landscapePage: {
    fontFamily: "Heebo",
    fontSize: 8,
    direction: "rtl",
    backgroundColor: "#ffffff",
    paddingBottom: 36,
  },
  landscapeHeaderBand: {
    backgroundColor: PRIMARY,
    paddingVertical: 8,
    paddingHorizontal: 20,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  landscapeCompanyName: { fontSize: 11, fontWeight: 700, color: "#ffffff" },
  landscapeDocInfo: { alignItems: "flex-start" },
  landscapeDocTitle: { fontSize: 10, fontWeight: 700, color: "#ffffff" },
  landscapeDiaryNum: { fontSize: 9, fontWeight: 700, color: DOC_GOLD },
  landscapeBody: { paddingHorizontal: 20, paddingTop: 12 },
  landscapeFooter: {
    position: "absolute",
    bottom: 0,
    right: 0,
    left: 0,
    backgroundColor: "#f8fafc",
    borderTop: `1 solid ${BORDER}`,
    paddingVertical: 4,
    paddingHorizontal: 20,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },

  /* ── Photos ── */
  photoGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  photoWrap: { width: 120 },
  photoImg: { width: 120, height: 88, objectFit: "cover", borderRadius: 3 },
  photoCaption: { fontSize: 6, color: GRAY, marginTop: 2, textAlign: "center" },

  /* ── Footer ── */
  footer: {
    position: "absolute",
    bottom: 0,
    right: 0,
    left: 0,
    backgroundColor: "#f8fafc",
    borderTop: `1 solid ${BORDER}`,
    paddingVertical: 5,
    paddingHorizontal: 24,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 6, color: "#9ca3af" },
});

function fmt(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function F({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <View style={full ? s.fieldFull : s.field}>
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
  const generatedAt = fmt(new Date().toISOString().split("T")[0]);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header band */}
        <View style={s.headerBand}>
          <View style={s.companyBlock}>
            <Text style={s.companyName}>אלקיים סימון כבישים בע״מ</Text>
            <Text style={s.companyTagline}>Road Marking & Signage Solutions</Text>
          </View>
          <View style={s.diaryBlock}>
            <Text style={s.docTitle}>יומן עבודה</Text>
            <Text style={s.diaryNumLabel}>מספר יומן</Text>
            <Text style={s.diaryNum}>{diary.diaryNumber || "—"}</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* Date/time strip */}
          <View style={s.dateStrip}>
            <View style={s.dateChip}>
              <Text style={s.dateLabel}>תאריך ביצוע</Text>
              <Text style={s.dateValue}>{fmt(diary.executionDate)}</Text>
            </View>
            {diary.startTime ? (
              <View style={s.dateChip}>
                <Text style={s.dateLabel}>שעת תחילה</Text>
                <Text style={s.dateValue}>{diary.startTime}</Text>
              </View>
            ) : null}
            {diary.endTime ? (
              <View style={s.dateChip}>
                <Text style={s.dateLabel}>שעת סיום</Text>
                <Text style={s.dateValue}>{diary.endTime}</Text>
              </View>
            ) : null}
            {diary.startTime && diary.endTime ? (
              <View style={s.dateChip}>
                <Text style={s.dateLabel}>משך</Text>
                <Text style={s.dateValue}>
                  {(() => {
                    const [sh, sm] = diary.startTime.split(":").map(Number);
                    const [eh, em] = diary.endTime.split(":").map(Number);
                    const totalMin = (eh * 60 + em) - (sh * 60 + sm);
                    if (totalMin <= 0) return "—";
                    return `${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, "0")} שעות`;
                  })()}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Project details */}
          <View style={s.section}>
            <View style={s.sectionHead}>
              <View style={s.sectionAccent} />
              <Text style={s.sectionTitle}>פרטי הפרויקט</Text>
            </View>
            <View style={s.fieldGrid}>
              <F label="שם הקבלן / לקוח" value={diary.customerName} />
              <F label="אתר העבודה" value={diary.siteName} />
              <F label="איש קשר" value={diary.contactName} />
              <F label="טלפון" value={diary.contactPhone} />
              <F label="רכב מס׳" value={diary.vehicleNumber} />
              <F label="נגרר מס׳" value={diary.trailerNumber} />
            </View>
          </View>

          {/* Crew */}
          <View style={s.section}>
            <View style={s.sectionHead}>
              <View style={s.sectionAccent} />
              <Text style={s.sectionTitle}>צוות</Text>
            </View>
            <View style={s.fieldGrid}>
              <F label="שם הנהג" value={diary.driverName} />
              <F label="ראש צוות" value={diary.crewLeaderName} />
              {diary.crewMembers.filter(Boolean).map((m, i) => (
                <F key={i} label={`איש צוות ${i + 1}`} value={m} />
              ))}
            </View>
          </View>

          {/* Painting */}
          {hasPainting && (
            <View style={s.section}>
              <View style={s.sectionHead}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>צביעה וסימון כבישים</Text>
              </View>
              <View style={s.table}>
                <View style={s.tableHeaderRow}>
                  <View style={s.thCellWide}><Text>פריט</Text></View>
                  {["לבן", "כתום", "צהוב", "שחור", "קירוצף", "כדוריות", "מידה"].map((h) => (
                    <View key={h} style={s.thCell}><Text>{h}</Text></View>
                  ))}
                  <View style={s.thCellWide}><Text>הערות</Text></View>
                </View>
                {diary.paintingItems
                  .filter((i) => i.white || i.orange || i.yellow || i.black || i.retroReflective || i.beads)
                  .map((item, idx) => (
                    <View key={item.id} style={idx % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                      <View style={s.tdCellWide}><Text>{item.name}</Text></View>
                      <View style={s.tdCell}><Text>{item.white}</Text></View>
                      <View style={s.tdCell}><Text>{item.orange}</Text></View>
                      <View style={s.tdCell}><Text>{item.yellow}</Text></View>
                      <View style={s.tdCell}><Text>{item.black}</Text></View>
                      <View style={s.tdCell}><Text>{item.retroReflective ? "✓" : ""}</Text></View>
                      <View style={s.tdCell}><Text>{item.beads ? "✓" : ""}</Text></View>
                      <View style={s.tdCell}><Text>{item.size}</Text></View>
                      <View style={s.tdCellWide}><Text>{item.notes}</Text></View>
                    </View>
                  ))}
              </View>
            </View>
          )}

          {/* Poles */}
          {hasPoles && (
            <View style={s.section}>
              <View style={s.sectionHead}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>עמודים</Text>
              </View>
              <View style={s.table}>
                <View style={s.tableHeaderRow}>
                  <View style={s.thCellWide}><Text>פריט</Text></View>
                  {["יצא", "אספקה", "התקנה", "פירוק", "העתקה", "יישור", "חזר", "מידה"].map((h) => (
                    <View key={h} style={s.thCell}><Text>{h}</Text></View>
                  ))}
                </View>
                {diary.poleItems
                  .filter((i) => i.name)
                  .map((item, idx) => (
                    <View key={item.id} style={idx % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                      <View style={s.tdCellWide}><Text>{item.name}</Text></View>
                      {(["out", "supply", "install", "dismantle", "move", "straighten", "returned", "size"] as const).map((c) => (
                        <View key={c} style={s.tdCell}><Text>{item[c]}</Text></View>
                      ))}
                    </View>
                  ))}
              </View>
            </View>
          )}

          {/* General notes */}
          {diary.generalNotes ? (
            <View style={s.section}>
              <View style={s.sectionHead}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>הערות כלליות</Text>
              </View>
              <View style={s.notesBox}>
                <Text style={s.notesText}>{diary.generalNotes}</Text>
              </View>
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
                <View style={s.sigImageWrap}>
                  {sig?.dataUrl ? (
                    <Image
                      src={sig.dataUrl}
                      style={{ width: 200, height: 56, objectFit: "contain" }}
                    />
                  ) : (
                    <View style={s.sigBlankLine} />
                  )}
                </View>
                {sig?.signerName ? <Text style={s.sigName}>{sig.signerName}</Text> : null}
                {sig?.signedAt ? (
                  <Text style={s.sigMeta}>{new Date(sig.signedAt).toLocaleString("he-IL")}</Text>
                ) : null}
                {sig?.location ? <Text style={s.sigMeta}>{sig.location}</Text> : null}
              </View>
            ))}
          </View>

          {/* Photos */}
          {diary.photos.length > 0 && (
            <View style={[s.section, { marginTop: 14 }]}>
              <View style={s.sectionHead}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>תמונות מהשטח</Text>
              </View>
              <View style={s.photoGrid}>
                {diary.photos.map((photo) => (
                  <View key={photo.id} style={s.photoWrap}>
                    <Image src={photo.dataUrl} style={s.photoImg} />
                    {photo.caption ? <Text style={s.photoCaption}>{photo.caption}</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          )}

        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>אלקיים סימון כבישים בע״מ · יומן עבודה מס׳ {diary.diaryNumber}</Text>
          <Text style={s.footerText}>הופק: {generatedAt}</Text>
        </View>

      </Page>

      {/* ── Page 2: Signs table on landscape for full readability ── */}
      {hasSigns && (
        <Page size="A4" orientation="landscape" style={s.landscapePage}>

          {/* Compact header */}
          <View style={s.landscapeHeaderBand}>
            <Text style={s.landscapeCompanyName}>אלקיים סימון כבישים בע״מ</Text>
            <View style={s.landscapeDocInfo}>
              <Text style={s.landscapeDocTitle}>יומן עבודה — נספח תמרורים</Text>
              <Text style={s.landscapeDiaryNum}>מס׳ {diary.diaryNumber || "—"} · {fmt(diary.executionDate)}</Text>
            </View>
          </View>

          <View style={s.landscapeBody}>
            <View style={s.section}>
              <View style={s.sectionHead}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>תמרורים</Text>
              </View>
              <View style={s.table}>
                <View style={s.tableHeaderRow}>
                  {["עירוני", "ב״ע", "רגיל", "ר״ע", "יהלום", "יצא", "אספקה", "התקנה", "פירוק", "העתקה", "זווית", "מסגרת", "פרופיל", "גודל", "סולרי", "חזר"].map((h) => (
                    <View key={h} style={s.thCell}><Text>{h}</Text></View>
                  ))}
                </View>
                {diary.signItems
                  .filter((i) => i.urban || i.basic || i.regular || i.reinforced || i.diamond || i.supply || i.install)
                  .map((item, idx) => (
                    <View key={item.id} style={idx % 2 === 0 ? s.tableRow : s.tableRowAlt}>
                      {(["urban", "basic", "regular", "reinforced", "diamond", "out", "supply", "install", "dismantle", "move", "angle", "frame", "profile", "signSize"] as const).map((c) => (
                        <View key={c} style={s.tdCell}><Text>{item[c]}</Text></View>
                      ))}
                      <View style={s.tdCell}><Text>{item.solar ? "✓" : ""}</Text></View>
                      <View style={s.tdCell}><Text>{item.returned}</Text></View>
                    </View>
                  ))}
              </View>
            </View>
          </View>

          <View style={s.landscapeFooter} fixed>
            <Text style={s.footerText}>אלקיים סימון כבישים בע״מ · נספח תמרורים · יומן {diary.diaryNumber}</Text>
            <Text style={s.footerText}>הופק: {generatedAt}</Text>
          </View>

        </Page>
      )}

    </Document>
  );
}
