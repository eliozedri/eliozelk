// Validates src/data/signs.ts against the spec requirements.
// Run: npm run audit:signs
// Writes a report to scripts/audit-signs-report.md and prints to stdout.

import * as fs from "fs";
import * as path from "path";
import { SIGNS_DATA } from "../src/data/signs";

const IMAGES_DIR = path.join(__dirname, "../public/signs");
const REPORT_FILE = path.join(__dirname, "audit-signs-report.md");

const VALID_PATTERN = /^sign_(p?\d+(?:_[bcd])?)\.png$/;
const imageFiles = fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR) : [];
const imageKeys = new Set(
  imageFiles.map((f) => f.match(VALID_PATTERN)?.[1]).filter(Boolean) as string[]
);

const VALID_SHAPES = new Set([
  "משולש", "עיגול", "מלבן", "משולש הפוך",
  "מתומן", "יהלום", "סימון כביש", "מיוחד", "לא ידוע",
]);

const lines: string[] = [];
const counts: Record<string, number> = {};

function section(title: string) {
  lines.push(`\n## ${title}\n`);
  counts[title] = 0;
}

function issue(key: string, detail: string, sectionTitle: string) {
  lines.push(`- \`${key}\`: ${detail}`);
  counts[sectionTitle] = (counts[sectionTitle] ?? 0) + 1;
}

// 1. Road markings with wrong shape
const s1 = "1. Road markings with wrong shape (8xx must be סימון כביש)";
section(s1);
for (const [key, r] of Object.entries(SIGNS_DATA)) {
  if (r.series === "8xx" && r.shape !== "סימון כביש") {
    issue(key, `shape="${r.shape}" (MUST be סימון כביש)`, s1);
  }
}

// 2. Suspicious 4xx circle assignments that are also flagged needsReview
const s2 = "2. Suspicious 4xx circle assignments (עיגול + needsReview)";
section(s2);
for (const [key, r] of Object.entries(SIGNS_DATA)) {
  if (r.series === "4xx" && r.shape === "עיגול" && r.needsReview) {
    issue(key, `shape=עיגול and needsReview=true`, s2);
  }
}

// 3. Missing Hebrew name
const s3 = "3. Missing Hebrew name";
section(s3);
for (const [key, r] of Object.entries(SIGNS_DATA)) {
  if (!r.name) issue(key, `name is empty`, s3);
}

// 4. Unknown shape
const s4 = "4. Unknown shape (לא ידוע)";
section(s4);
for (const [key, r] of Object.entries(SIGNS_DATA)) {
  if (r.shape === "לא ידוע") issue(key, `shape=לא ידוע`, s4);
}

// 5. Invalid shape token (not in vocabulary)
const s5 = "5. Invalid shape token (not in allowed vocabulary)";
section(s5);
for (const [key, r] of Object.entries(SIGNS_DATA)) {
  if (!VALID_SHAPES.has(r.shape)) issue(key, `shape="${r.shape}" is not a valid token`, s5);
}

// 6. All needsReview entries
const s6 = "6. All entries flagged needsReview";
section(s6);
for (const [key, r] of Object.entries(SIGNS_DATA)) {
  if (r.needsReview) issue(key, `shape="${r.shape}", name="${r.name}"`, s6);
}

// 7. Metadata entries with no image
const s7 = "7. Metadata entries with no image (available=false)";
section(s7);
for (const [key, r] of Object.entries(SIGNS_DATA)) {
  if (!r.available) issue(key, `no image in public/signs/`, s7);
}

// 8. Images with no metadata entry
const s8 = "8. Images with no metadata entry";
section(s8);
for (const imgKey of imageKeys) {
  if (!SIGNS_DATA[imgKey]) issue(imgKey, `image exists but no SIGNS_DATA entry`, s8);
}

// Summary
const total = Object.keys(SIGNS_DATA).length;
const summaryLines = [
  `| Check | Count |`,
  `|---|---|`,
  ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`),
];

const report = [
  `# Traffic Sign Audit Report`,
  ``,
  `Generated: ${new Date().toISOString()}`,
  `Total SIGNS_DATA entries: ${total}`,
  `Total images in public/signs/: ${imageKeys.size}`,
  ``,
  `## Summary`,
  ``,
  ...summaryLines,
  ...lines,
].join("\n");

fs.writeFileSync(REPORT_FILE, report, "utf-8");
console.log(report);
console.log(`\nReport saved → ${REPORT_FILE}`);

// Exit non-zero if critical violations found (8xx with wrong shape)
if (counts[s1] > 0) {
  console.error(`\n❌ CRITICAL: ${counts[s1]} road markings have wrong shape`);
  process.exit(1);
}
console.log("\n✅ No critical violations.");
