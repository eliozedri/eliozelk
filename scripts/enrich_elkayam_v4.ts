/**
 * Phase 3 (v4) — Strict exact-vs-fallback audit + rescue.
 *
 * Distinguishes seven match-types instead of the v3 two-tier model:
 *
 *   - exact_catalog_image      Row.name matches PDF page heading at high
 *                              precision, OR appears verbatim in page_text
 *                              keyword list adjacent to the image.
 *   - exact_website_image      Same idea but for non-blocked website slugs.
 *   - category_relevant_image  Same product family, not exact name.
 *   - service_relevant_image   Row is a service ("עבודות", "תכנון", ...),
 *                              no physical product image exists.
 *   - needs_review             Ambiguous low-confidence match.
 *   - fallback_placeholder     No image (intentional null thumb).
 *   - invalid_logo_or_branding Pre-filtered by content-hash blocklist.
 *
 * Sources, in priority order:
 *   1. PDF page heading + adjacent page_text keywords
 *   2. PDF same-page-text (loose match)
 *   3. Website (with branded blocklist)
 *
 * Run:
 *   npx tsx scripts/enrich_elkayam_v4.ts            # dry-run (audit only)
 *   npx tsx scripts/enrich_elkayam_v4.ts --live     # apply upgrades to DB
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const LIVE = process.argv.includes('--live');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ROOT          = path.join(__dirname, '..');
const PDF_MANIFEST  = path.join(ROOT, 'public', 'catalog', 'elkayam', 'pdf-extracted', 'manifest.json');
const WEB_INDEX     = path.join(ROOT, 'public', 'catalog', 'elkayam', 'image-index.json');
const BLOCKLIST     = path.join(ROOT, 'public', 'catalog', 'elkayam', 'branded-slugs-blocklist.json');
const REPORT_JSON   = path.join(ROOT, 'public', 'catalog', 'elkayam', 'elkayam-match-report-v4.json');
const REPORT_MD     = path.join(ROOT, 'public', 'catalog', 'elkayam', 'elkayam-match-report-v4.md');

interface PdfEntry { page: number; index: number; width: number; height: number; sha256: string;
                     slug_hint: string; page_title: string; page_text: string; local: string; }
interface WebPage  { slug: string; primary_local: string; }

type Tier = 'exact_catalog_image' | 'exact_website_image' | 'category_relevant_image'
          | 'service_relevant_image' | 'needs_review' | 'fallback_placeholder'
          | 'invalid_logo_or_branding';

// ── Hand-curated PDF page → exact-product mapping ────────────────────────────
// Each row.name (or substring) on this list is considered an EXACT match to
// the image on the listed PDF page. Built from inspecting page headings AND
// page_text excerpts of catalog.pdf.
interface ExactRule { page: number; productHints: string[]; }
const EXACT_RULES: ExactRule[] = [
  { page: 7,  productHints: ['קונוסים', 'קונוס', 'שרוולי קונוס', 'שרוול קונוס'] },
  { page: 8,  productHints: ['עמוד מחזיר אור גמיש', 'מפרדת נתיבים', 'מפרדת נתיבים גמישה',
                              'עמוד גמיש', 'עמודים גמישים', 'מחזיר אור גמיש'] },
  { page: 10, productHints: ['עמודי מחסום', 'עמוד מחסום', 'עמוד חסימה', 'עמוד מחסום מואר',
                              'עמודי מחסום מוארים', 'עמוד מחסום פחוס'] },
  { page: 11, productHints: ['סטנד לשילוט', 'סטנד לתמרור', 'מתקנים מודולאריים',
                              'סטנד זמני', 'סטנד תמרור'] },
  { page: 12, productHints: ['עיני חתול', 'פנס מהבהב סולארי', 'פנס מהבהב', 'פנסי LED סולאריים',
                              'פנס LED'] },
  { page: 13, productHints: ['פסי האטה', 'פס האטה', 'פסי האטה PVC', 'פסי האטה גומי',
                              'פס האטה PVC', 'פס האטה גומי', 'מגן כבלים', 'מעבר כבל',
                              'פסי האטה ומגן כבלים'] },
  { page: 14, productHints: ['מעצור חנייה', 'מעצור חניה', 'שומר חנייה מתקפל', 'שומר חנייה',
                              'מחסום דוקרנים', 'מגן פינות', 'מגן פינות לחניה'] },
  { page: 15, productHints: ['מד מהירות סולארי', 'מד מהירות'] },
  { page: 16, productHints: ['אנטי גרפיטי', 'חבקים לתמרורים', 'חבק לתמרור', 'שרוול אנטי גרפיטי',
                              'אנטי גרפיטי לעמודים', 'שרוולים לתמרורים'] },
  { page: 17, productHints: ['גדר מתקפלת'] },
  { page: 18, productHints: ['גדר רשת פלדה', 'גדר פלדה', 'גדר רשת', 'חיזוק פלדה לגדרות',
                              'בסיסי כובד', 'בסיסי כובד לגדרות', 'בסיס גומי לגדרות',
                              'גדר בטיחות', 'גדר בטיחות SAFEGATE', 'גדר קל-גד', 'גדר קל',
                              'גדר רשת פלדה מגולוונת', 'גדרות', 'גידור זמני'] },
  { page: 19, productHints: ['עבודות הנגשה', 'נגישות', 'משטח גבשושיות', 'סימון נגישות',
                              'משטחי גבשושיות', 'משטח גבשושיות להכוונה',
                              'מדבקות למניעת החלקה', 'מדבקות נגד החלקה',
                              'ציפוי נגד החלקה', 'אנטי סליפ'] },
  { page: 20, productHints: ['מתקן למניעת הצפות', 'מניעת הצפות', 'מתקן הצפות'] },
  { page: 21, productHints: ['עגלות חץ', 'עגלת חץ', 'מעקה בטון זמני', 'עמודי תיחום',
                              'תיחום אתר זמני', 'מחסום נייד', 'תיחום זמני'] },
  { page: 22, productHints: ['הסדרי תנועה', 'הסדר תנועה', 'מעקה בטיחות', 'מעקה',
                              'הסדר תנועה זמני', 'הסדר תנועה קבוע',
                              'תכנון והסדרת תנועה', 'הכוונת תנועה',
                              'סופג אנרגיה', 'יחידת קצה', 'מעקה בטון',
                              'מעקה בטון (ניו ג׳רזי)', 'ניו ג׳רזי'] },
  { page: 23, productHints: ['שלטי רחוב', 'שלט רחוב', 'שלט רחוב בעיצוב מיוחד', 'שלט רחוב סטנדרטי',
                              'שילוט מיוחד', 'אותיות תלת מימד', 'אותיות', 'ייצור שלטים',
                              'ייצור שלטים לפי הזמנה', 'חומרי התקנה לשילוט', 'תמרור סטנדרטי',
                              'שלט פולט אור', 'שלט פולט אור / מואר', 'שלט מואר',
                              'שירות גרפיקה', 'שירות גרפיקה לתכנון', 'תמרור', 'תמרורים'] },
  { page: 24, productHints: ['שילוט גנים', 'שלט גן', 'שלט גן / שטח ירוק'] },
  { page: 25, productHints: ['שלטי תדמית', 'שלט תדמית'] },
  { page: 27, productHints: ['שילוט נתיבי ישראל', 'שלט נתיבי ישראל', 'שילוט הכוונה',
                              'שלט מידע', 'שלט הכוונה', 'שלט נתיבי'] },
  { page: 28, productHints: ['שלטי אכיפה', 'שלט אכיפה', 'שילוט חנייה', 'שלט חניון',
                              'שלט חניון — כיוון', 'שלט חניון — כיוון / מידע',
                              'שלט אכיפה'] },
  { page: 29, productHints: ['שלטי נגישות', 'שלטי בטיחות', 'שלט בטיחות', 'שלט נגישות',
                              'תמרור נגישות', 'תמרור סולארי עם LED לנגישות'] },
  { page: 30, productHints: ['שילוט חשמל', 'שילוט הכוונה ומילוט', 'שילוט קומות',
                              'שלט חירום', 'שלט מילוט', 'שלט קומות'] },
  { page: 31, productHints: ['סימון וצביעה', 'סימון וצביעת כבישים', 'סימון וצביעת חניונים',
                              'סימון וצביעת אבני שפה', 'צביעת אבני שפה'] },
  { page: 32, productHints: ['אפוקסי', 'סימון אפוקסי', 'סימון תרמו פלסטי', 'סימון וצביעת מגרש',
                              'הסרת סימון', 'הסרת סימון בלחץ מים', 'הסרת סימון כדוריות פלדה',
                              'שוט בלסטינג', 'סרטי סימון אדום-לבן', 'סימון וצביעת שבילי אופניים',
                              'סימון וצביעת נתיבים', 'תרמופלסט'] },
  { page: 33, productHints: ['מסלולי רצפה', 'משטחים טרמופלסטיים', 'טרמופלסטי'] },
  { page: 34, productHints: ['תמרורים סולאריים', 'תמרור סולארי', 'תמרור סולארי / שלט LED',
                              'תמרור סולארי עם LED', 'שלט LED סולארי', 'שלט LED',
                              'LED סולארי'] },
  { page: 35, productHints: ['גדר מדברת', 'גדר מדברת / חיפוי גדר', 'חיפוי גדר'] },
];

// Rows whose name signals "service, not a physical product" — never expect
// an exact catalog image for these.
const SERVICE_KEYWORDS = ['עבודות', 'שירות', 'תכנון', 'ניהול', 'הובלה', 'משלוח',
                          'אבטחה', 'גרפיקה', 'ייצור', 'אספקה', 'התקנה', 'הסרת', 'יצור'];

function normalize(s: string): string {
  return s.replace(/[״׳"']/g, '')
          .replace(/[—–-]+/g, ' ')
          .replace(/[^֐-׿\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(w => w.length >= 2);
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  return a.startsWith(b.substring(0, 3)) || b.startsWith(a.substring(0, 3));
}

function f1(rowKw: string[], slugTokens: string[]): number {
  if (rowKw.length === 0 || slugTokens.length === 0) return 0;
  let nHit = 0, sHit = 0;
  for (const t of rowKw) if (slugTokens.some(st => tokensMatch(t, st))) nHit++;
  for (const st of slugTokens) if (rowKw.some(t => tokensMatch(t, st))) sHit++;
  const r = nHit / rowKw.length, p = sHit / slugTokens.length;
  if (r === 0 || p === 0) return 0;
  return 2 * (r * p) / (r + p);
}

function isService(name: string): boolean {
  const norm = normalize(name);
  return SERVICE_KEYWORDS.some(kw => norm.includes(normalize(kw)));
}

/** EXACT — row name matches one of the hand-curated product hints on a page. */
function findExactCatalogMatch(
  rowName: string,
  entries: PdfEntry[],
): { page: number; entry: PdfEntry; matchedHint: string } | null {
  const normName = normalize(rowName);
  for (const rule of EXACT_RULES) {
    for (const hint of rule.productHints) {
      if (normName.includes(normalize(hint)) || normalize(hint).includes(normName)) {
        // Pick the first entry on that page (largest image is usually first)
        const ent = entries.find(e => e.page === rule.page);
        if (ent) return { page: rule.page, entry: ent, matchedHint: hint };
      }
    }
  }
  return null;
}

/** Looser PDF match (F1 against heading+text) — used to pick category_relevant. */
function findCategoryPdfMatch(
  rowName: string, rowCategory: string,
  entries: PdfEntry[],
): { entry: PdfEntry; score: number } | null {
  const kw = [...tokens(rowName), ...tokens(rowCategory)];
  if (!kw.length) return null;
  let best: { entry: PdfEntry; score: number } | null = null;
  // Group by page for efficiency
  const seenPages = new Set<number>();
  for (const e of entries) {
    if (seenPages.has(e.page)) continue;
    seenPages.add(e.page);
    const pageTokens = tokens(e.page_title + ' ' + e.page_text);
    const s = f1(kw, pageTokens);
    if (s > 0 && (!best || s > best.score)) best = { entry: e, score: s };
  }
  return best;
}

function findWebMatch(
  rowName: string, rowCategory: string,
  pages: WebPage[], blockedSlugs: Set<string>,
): { page: WebPage; score: number } | null {
  const kw = [...tokens(rowName), ...tokens(rowCategory)];
  if (!kw.length) return null;
  let best: { page: WebPage; score: number } | null = null;
  for (const p of pages) {
    if (blockedSlugs.has(p.slug)) continue;
    const slugTokens = tokens(p.slug.replace(/-/g, ' '));
    const s = f1(kw, slugTokens);
    if (s > 0 && (!best || s > best.score)) best = { page: p, score: s };
  }
  return best;
}

interface Decision {
  row_id: string;
  row_name: string;
  row_category: string;
  prior_thumb: string | null;
  prior_status: string | null;
  prior_source: string | null;
  prior_score: number | null;
  new_tier: Tier;
  new_thumb: string | null;
  new_source: 'company_catalog_pdf' | 'elkayam_website' | 'none';
  new_score: number;
  matched_hint?: string;
  pdf_page?: number;
  reason: string;
}

function pathsFromOriginal(primary: string): { thumb: string; full: string } {
  const m = primary.match(/^(.*)\/original\/([^/]+?)(?:-\d+)?\.[^./]+$/);
  if (m) return { thumb: `${m[1]}/thumbs/${m[2]}-thumb.webp`, full: `${m[1]}/processed/${m[2]}.webp` };
  return { thumb: primary, full: primary };
}

async function main() {
  console.log(`=== Elkayam v4 Strict Audit${LIVE ? ' [LIVE]' : ' [DRY]'} ===\n`);

  const pdfManifest: { entries: PdfEntry[] } = JSON.parse(fs.readFileSync(PDF_MANIFEST, 'utf-8'));
  const webIndex:    { pages: WebPage[] }    = JSON.parse(fs.readFileSync(WEB_INDEX, 'utf-8'));
  const blockData:   { blocked_slugs: string[] } = JSON.parse(fs.readFileSync(BLOCKLIST, 'utf-8'));
  const blockedSlugs = new Set(blockData.blocked_slugs);
  console.log(`PDF entries:           ${pdfManifest.entries.length}`);
  console.log(`Website usable slugs:  ${webIndex.pages.filter(p => !blockedSlugs.has(p.slug)).length}\n`);

  const { data: rows, error } = await supabase
    .from('catalog_items')
    .select('id, name, category, metadata')
    .eq('is_active', true);
  if (error) { console.error(error); process.exit(1); }

  const decisions: Decision[] = [];
  const counts: Record<Tier, number> = {
    exact_catalog_image: 0,
    exact_website_image: 0,
    category_relevant_image: 0,
    service_relevant_image: 0,
    needs_review: 0,
    fallback_placeholder: 0,
    invalid_logo_or_branding: 0,
  };

  for (const row of rows!) {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const images = (meta.images as Record<string, unknown> | undefined) ?? {};
    const priorThumb = (images.thumb as string | null) ?? null;
    const priorSlugMatch = priorThumb?.split('/').pop()?.replace(/-thumb\.webp$/, '') ?? '';
    const wasBranded = blockedSlugs.has(priorSlugMatch);

    const decision: Decision = {
      row_id:       row.id,
      row_name:     row.name,
      row_category: row.category,
      prior_thumb:  priorThumb,
      prior_status: (images.image_status as string) ?? null,
      prior_source: (images.source_type as string) ?? null,
      prior_score:  (meta.image_match_score as number) ?? null,
      new_tier:     'fallback_placeholder',
      new_thumb:    null,
      new_source:   'none',
      new_score:    0,
      reason:       '',
    };

    // 1. EXACT PDF match (hand-curated rules)
    const exact = findExactCatalogMatch(row.name, pdfManifest.entries);
    if (exact) {
      const { thumb } = pathsFromOriginal(exact.entry.local);
      decision.new_tier      = 'exact_catalog_image';
      decision.new_thumb     = thumb;
      decision.new_source    = 'company_catalog_pdf';
      decision.new_score     = 1.0;
      decision.matched_hint  = exact.matchedHint;
      decision.pdf_page      = exact.page;
      decision.reason        = `Row name matches PDF page-${exact.page} hint '${exact.matchedHint}'.`;
      counts.exact_catalog_image++;
      decisions.push(decision);
      continue;
    }

    // 2. Service row? Mark as service_relevant
    const serviceRow = isService(row.name);

    // 3. PDF loose match (category-level)
    const pdfBest = findCategoryPdfMatch(row.name, row.category, pdfManifest.entries);
    // 4. Website match
    const webBest = findWebMatch(row.name, row.category, webIndex.pages, blockedSlugs);

    const pdfScore = pdfBest?.score ?? 0;
    const webScore = webBest?.score ?? 0;

    if (serviceRow && pdfScore >= 0.30) {
      const { thumb } = pathsFromOriginal(pdfBest!.entry.local);
      decision.new_tier   = 'service_relevant_image';
      decision.new_thumb  = thumb;
      decision.new_source = 'company_catalog_pdf';
      decision.new_score  = pdfScore;
      decision.pdf_page   = pdfBest!.entry.page;
      decision.reason     = `Service row; PDF page-${pdfBest!.entry.page} text overlap score=${pdfScore.toFixed(2)}.`;
      counts.service_relevant_image++;
    } else if (pdfScore >= 0.40) {
      const { thumb } = pathsFromOriginal(pdfBest!.entry.local);
      decision.new_tier   = 'category_relevant_image';
      decision.new_thumb  = thumb;
      decision.new_source = 'company_catalog_pdf';
      decision.new_score  = pdfScore;
      decision.pdf_page   = pdfBest!.entry.page;
      decision.reason     = `PDF page-${pdfBest!.entry.page} category match score=${pdfScore.toFixed(2)}.`;
      counts.category_relevant_image++;
    } else if (webScore >= 0.60) {
      const { thumb } = pathsFromOriginal(webBest!.page.primary_local);
      decision.new_tier   = 'exact_website_image';
      decision.new_thumb  = thumb;
      decision.new_source = 'elkayam_website';
      decision.new_score  = webScore;
      decision.reason     = `Non-branded website slug '${webBest!.page.slug}' high overlap.`;
      counts.exact_website_image++;
    } else if (webScore >= 0.30) {
      const { thumb } = pathsFromOriginal(webBest!.page.primary_local);
      decision.new_tier   = 'category_relevant_image';
      decision.new_thumb  = thumb;
      decision.new_source = 'elkayam_website';
      decision.new_score  = webScore;
      decision.reason     = `Non-branded website slug '${webBest!.page.slug}' loose match.`;
      counts.category_relevant_image++;
    } else if (pdfScore > 0 || webScore > 0) {
      decision.new_tier = 'needs_review';
      decision.new_score = Math.max(pdfScore, webScore);
      decision.reason = `Best PDF=${pdfScore.toFixed(2)}, web=${webScore.toFixed(2)} — both below relevance threshold.`;
      counts.needs_review++;
    } else {
      decision.new_tier = 'fallback_placeholder';
      decision.reason = `No PDF or website candidate at all.`;
      counts.fallback_placeholder++;
    }

    decisions.push(decision);

    if (wasBranded && decision.new_tier === 'fallback_placeholder') {
      counts.invalid_logo_or_branding++;  // for accounting only — was logo before
    }
  }

  // Apply
  if (LIVE) {
    for (const d of decisions) {
      const row = rows!.find(r => r.id === d.row_id)!;
      const meta = (row.metadata as Record<string, unknown> | null) ?? {};
      const newMeta: Record<string, unknown> = {
        ...meta,
        images: {
          thumb:        d.new_thumb,
          full:         d.new_thumb ? d.new_thumb.replace('/thumbs/', '/processed/').replace(/-thumb\.webp$/, '.webp') : null,
          original:     null,
          source_type:  d.new_source,
          image_status: d.new_tier,
          is_branded:   false,
          crop_status:  'pending',
          imported_at:  new Date().toISOString(),
        },
        image_match_type:  d.new_tier,
        image_match_score: d.new_score,
        image_match_pdf_page: d.pdf_page ?? null,
        image_match_hint:  d.matched_hint ?? null,
      };
      if (d.new_tier === 'exact_catalog_image' || d.new_tier === 'exact_website_image') {
        delete newMeta.review_state;
      } else if (d.new_tier === 'fallback_placeholder') {
        newMeta.review_state = 'image_needs_replacement';
      } else {
        newMeta.review_state = 'image_needs_replacement';
      }
      const { error: upd } = await supabase.from('catalog_items').update({ metadata: newMeta }).eq('id', row.id);
      if (upd) console.error(`  UPDATE FAIL ${d.row_id}: ${upd.message}`);
    }
  }

  // Reports
  const report = {
    generated_at: new Date().toISOString(),
    live: LIVE,
    counts,
    decisions,
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

  const md: string[] = ['# Elkayam v4 strict classification', `_Generated ${report.generated_at}_`, ''];
  md.push('## Counts');
  for (const [k, v] of Object.entries(counts)) md.push(`- **${k}**: ${v}`);
  md.push('\n## Per-row classification');
  md.push('| Row | Category | Tier | Source | PDF page | Score | Reason |');
  md.push('|---|---|---|---|---|---|---|');
  for (const d of decisions) {
    md.push(`| ${d.row_name} | ${d.row_category} | ${d.new_tier} | ${d.new_source} | ${d.pdf_page ?? '—'} | ${d.new_score.toFixed(2)} | ${d.reason} |`);
  }
  fs.writeFileSync(REPORT_MD, md.join('\n'));

  console.log('Summary:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`\nReport: ${REPORT_JSON}`);
  if (!LIVE) console.log('[DRY] No DB writes.');
}

main().catch(console.error);
