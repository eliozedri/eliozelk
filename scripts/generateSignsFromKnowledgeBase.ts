// AUTO-GENERATES src/data/signs.ts from the official knowledge base.
// Source: מקורות מידע/Sign/knowledge-base/ (לוח תמרורים, Traffic Ordinance 2022)
// Run: npm run generate:signs

import * as fs from "fs";
import * as path from "path";

const KB_DIR = path.join(
  __dirname,
  "../מקורות מידע/Sign/knowledge-base/categories"
);
const IMAGES_DIR = path.join(__dirname, "../public/signs");
const OUTPUT_FILE = path.join(__dirname, "../src/data/signs.ts");

// Primary category files only — ignore " 2" duplicates
const CATEGORY_FILES = [
  "01_warning_alert_101-152.md",
  "02_instructions_201-231.md",
  "03_right_of_way_301-310.md",
  "04_prohibitions_restrictions_401-441.md",
  "05_public_transport_501-516.md",
  "06_information_guidance_601-640.md",
  "07_traffic_lights_lane_control_701-729.md",
  "08_road_markings_801-821.md",
  "09_work_zone_901-935.md",
];

// Shape keyword rules — evaluated in priority order, first match wins.
// NO numeric ranges are used. Shape is derived entirely from the
// "Shape / Color" description in the knowledge base entry.
const SHAPE_RULES: Array<{ keywords: string[]; shape: string }> = [
  { keywords: ["inverted triangle"], shape: "משולש הפוך" },
  { keywords: ["octagon", "octagonal"], shape: "מתומן" },
  { keywords: ["diamond"], shape: "יהלום" },
  {
    keywords: ["barrier", "gate", "chevron", "delineator", "signal housing", "signal lamp"],
    shape: "מיוחד",
  },
  {
    keywords: [
      "road surface",
      "surface marking",
      "road marking",
      "road centre",
      "centre line",
      "transverse line",
      "shark teeth",
      "dashed line",
      "diagonal",
      "stripes",
      "markings",
      "marking",
      "painted",
    ],
    shape: "סימון כביש",
  },
  { keywords: ["triangle"], shape: "משולש" },
  { keywords: ["circle", "circular"], shape: "עיגול" },
  { keywords: ["rectangle", "rectangular"], shape: "מלבן" },
  { keywords: ["panel"], shape: "מלבן" },
];

// Hebrew reversal detection.
// In correct Hebrew, non-final forms of כ מ נ פ צ must NOT appear at word ends.
// If any word ends with one of these, the term was likely extracted reversed from the PDF.
const NON_FINAL_AT_WORD_END = new Set(["כ", "מ", "נ", "פ", "צ"]);
function looksReversed(term: string): boolean {
  const hebrewOnly = term.replace(/[^א-ת\s]/g, "");
  const words = hebrewOnly.trim().split(/\s+/).filter((w) => w.length > 1);
  return words.some((w) => NON_FINAL_AT_WORD_END.has(w[w.length - 1]));
}

function resolveShape(shapeColor: string): { shape: string; needsReview: boolean } {
  const lower = shapeColor.toLowerCase();
  for (const rule of SHAPE_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { shape: rule.shape, needsReview: false };
    }
  }
  return { shape: "לא ידוע", needsReview: true };
}

function resolveSeries(key: string): string {
  if (key.startsWith("p")) return "provisional";
  const n = parseInt(key.split("_")[0], 10);
  if (isNaN(n)) return "unknown";
  return `${Math.floor(n / 100)}xx`;
}

// Normalize sign number from KB format: "302" → "302", "פ401" → "p401"
function normalizeKBNumber(raw: string): string {
  return raw.trim().replace(/^פ/, "p");
}

interface KBEntry {
  key: string;
  name: string;
  shapeColor: string;
}

function parseCategoryFile(filePath: string): KBEntry[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const entries: KBEntry[] = [];
  const blocks = content.split(/(?=^### Sign)/m);

  for (const block of blocks) {
    if (!block.startsWith("### Sign")) continue;

    const numMatch = block.match(/\|\s*\*\*Number\*\*\s*\|\s*([^|]+?)\s*\|/);
    if (!numMatch) continue;
    const rawNum = numMatch[1].trim();
    if (!rawNum || rawNum === "Number") continue;
    const key = normalizeKBNumber(rawNum);

    const termMatch = block.match(/\|\s*\*\*Hebrew Term\*\*\s*\|\s*([^|]+?)\s*\|/);
    const name = termMatch ? termMatch[1].trim() : "";

    const shapeMatch = block.match(/\|\s*\*\*Shape \/ Color\*\*\s*\|\s*([^|]+?)\s*\|/);
    const shapeColor = shapeMatch ? shapeMatch[1].trim() : "";

    if (key) entries.push({ key, name, shapeColor });
  }
  return entries;
}

// ── Main ──────────────────────────────────────────────────────────────────

interface MetaEntry {
  name: string;
  shape: string;
  needsReview: boolean;
}

const metaMap = new Map<string, MetaEntry>();

for (const filename of CATEGORY_FILES) {
  const filePath = path.join(KB_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠  Missing category file: ${filename}`);
    continue;
  }
  for (const e of parseCategoryFile(filePath)) {
    const { shape, needsReview } = resolveShape(e.shapeColor);
    const reversed = e.name ? looksReversed(e.name) : false;
    metaMap.set(e.key, {
      name: e.name,
      shape,
      needsReview: needsReview || reversed,
    });
  }
}

// Resolve p-prefix sign shapes by inheriting from base sign when not explicitly set
for (const [key, meta] of metaMap) {
  if (key.startsWith("p") && meta.shape === "לא ידוע") {
    const baseKey = key.slice(1).split("_")[0];
    const baseMeta = metaMap.get(baseKey);
    if (baseMeta && baseMeta.shape !== "לא ידוע") {
      metaMap.set(key, { ...meta, shape: baseMeta.shape });
    }
  }
}

// Scan public/signs/ for image files
const VALID_PATTERN = /^sign_(p?\d+(?:_[bcd])?)\.png$/;
const imageFiles = fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR) : [];
const imageFileMap = new Map<string, string>();
for (const f of imageFiles) {
  const m = f.match(VALID_PATTERN);
  if (m) imageFileMap.set(m[1], f);
}

// Build output entries — union of metadata keys and image keys
const allKeys = new Set([...metaMap.keys(), ...imageFileMap.keys()]);
const outputEntries: string[] = [];
let reviewCount = 0;
let missingImageCount = 0;
let missingMetaCount = 0;

for (const key of allKeys) {
  const meta = metaMap.get(key);
  const imgFile = imageFileMap.get(key);
  const available = imageFileMap.has(key);
  const series = resolveSeries(key);
  let shape = meta?.shape ?? "לא ידוע";
  const name = meta?.name ?? "";
  let needsReview = meta?.needsReview ?? true;

  // 8xx is categorically road surface markings — override regardless of keyword match
  if (series === "8xx" && shape !== "סימון כביש") {
    shape = "סימון כביש";
    needsReview = false;
  }

  if (needsReview) reviewCount++;
  if (!available) missingImageCount++;
  if (!meta) missingMetaCount++;

  const imageFile = imgFile ?? `sign_${key}.png`;
  const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  outputEntries.push(
    `  "${key}": { number: "${key}", imageFile: "${imageFile}", shape: "${shape}", name: "${escapedName}", series: "${series}", available: ${available}, needsReview: ${needsReview} }`
  );
}

outputEntries.sort((a, b) => {
  const ka = a.match(/"([^"]+)":/)?.[1] ?? "";
  const kb = b.match(/"([^"]+)":/)?.[1] ?? "";
  return ka.localeCompare(kb, undefined, { numeric: true });
});

const output = `// AUTO-GENERATED — do not edit manually
// Source: מקורות מידע/Sign/knowledge-base/ (לוח תמרורים, Traffic Ordinance 2022)
// Re-run: npm run generate:signs

export interface SignRecord {
  number: string;
  imageFile: string;
  shape: string;
  name: string;
  series: string;
  available: boolean;
  needsReview: boolean;
}

export const SIGNS_DATA: Record<string, SignRecord> = {
${outputEntries.join(",\n")}
};
`;

fs.writeFileSync(OUTPUT_FILE, output, "utf-8");
console.log(`\n✅ Generated ${outputEntries.length} sign entries → ${OUTPUT_FILE}`);
console.log(`   needsReview : ${reviewCount}`);
console.log(`   missing image: ${missingImageCount}`);
console.log(`   missing meta : ${missingMetaCount}`);
