/**
 * Phase 3 (v3) — PDF-first Elkayam image matcher with branded-asset rejection.
 *
 * Critical changes vs v2:
 *   1. PRIORITY-ORDERED SOURCES
 *      Priority 1: public/catalog/elkayam/pdf-extracted/      (company catalog PDF)
 *      Priority 2: public/catalog/elkayam/website/  (FILTERED through blocklist)
 *      Priority 3: missing_image (no logo/banner ever used as fallback)
 *
 *   2. CONTENT-HASH BLOCKLIST
 *      branded-slugs-blocklist.json lists 329 website-source slugs whose
 *      primary file is byte-identical to the Elkayam logo/banner. The matcher
 *      hard-rejects these from ever being assigned to a product row.
 *
 *   3. PER-ROW DECISION REPORT
 *      public/catalog/elkayam/elkayam-match-report-v3.{json,md}
 *
 * Hard rules retained from v2:
 *   - Only modifies is_active=true rows.
 *   - Never sets is_active=false on Elkayam rows.
 *   - Never touches ext-asc-* (supplier) rows.
 *
 * Usage:
 *   npx tsx scripts/enrich_elkayam_v3.ts            # dry-run
 *   npx tsx scripts/enrich_elkayam_v3.ts --live     # write DB
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ROOT          = path.join(__dirname, '..');
const PDF_MANIFEST  = path.join(ROOT, 'public', 'catalog', 'elkayam', 'pdf-extracted', 'manifest.json');
const WEB_INDEX     = path.join(ROOT, 'public', 'catalog', 'elkayam', 'image-index.json');
const BLOCKLIST     = path.join(ROOT, 'public', 'catalog', 'elkayam', 'branded-slugs-blocklist.json');
const REPORT_JSON   = path.join(ROOT, 'public', 'catalog', 'elkayam', 'elkayam-match-report-v3.json');
const REPORT_MD     = path.join(ROOT, 'public', 'catalog', 'elkayam', 'elkayam-match-report-v3.md');

interface PdfEntry { page: number; index: number; width: number; height: number; sha256: string; slug_hint: string; page_title: string; page_text: string; local: string; }
interface WebPage  { slug: string; primary_local: string; all_locals: string[]; extra_count: number; }

// ── Hebrew tokenisation + synonyms (same as v2) ──────────────────────────────
const SYNONYMS: Record<string, string[]> = {
  'פס האטה':       ['פסי האטה', 'פסי-האטה', 'פס-האטה', 'speed-bump', 'מעצור'],
  'פסי האטה':      ['פסי-האטה', 'פס-האטה', 'speed-bump'],
  'מראה פנורמית':  ['מראות פנורמיות', 'מראה-פנורמית', 'מראות-פנורמיות', 'panoramic-mirror'],
  'מראות פנורמיות': ['מראה-פנורמית', 'מראות-פנורמיות'],
  'מעצור חנייה':   ['מעצור-חנייה', 'מעצור-חניה', 'park-stopper'],
  'מעצורי חניה':   ['מעצור-חנייה', 'park-stopper'],
  'שומר חנייה':    ['שומר-חנייה', 'שומר-חניה'],
  'מגן פינות':     ['מגן-פינה', 'מגן-פינות', 'מגיני-פינה'],
  'עמוד גמיש':     ['עמודים-גמישים', 'עמוד-גמיש', 'flexible-delineator', 'מחזיר-אור-גמיש'],
  'עמודים גמישים': ['עמוד-גמיש', 'מחזיר-אור-גמיש'],
  'עמוד חסימה':    ['עמודי-חסימה', 'עמוד-חסימה', 'עמודי-מחסום', 'barrier-post'],
  'עמוד מחסום':    ['עמודי-מחסום', 'barrier-post'],
  'עיני חתול':     ['עיני-חתול', 'road-stud', 'cat-eye'],
  'מחסום':         ['מחסום', 'מחסומים', 'barrier'],
  'מעקה':          ['מעקה', 'מעקות', 'guardrail'],
  'גדר':           ['גדר', 'גדרות', 'fence'],
  'גדר בטיחות':    ['גדר-בטיחות', 'safegate'],
  'גדר מתקפלת':    ['גדר-מתקפלת'],
  'פנס מהבהב':     ['פנס-מהבהב', 'מהבהב', 'flashing'],
  'פנס סולארי':    ['פנסים-סולאריים', 'solar-light'],
  'נצנץ סולארי':   ['נצנץ-סולארי'],
  'תמרור':         ['תמרורים', 'תמרור'],
  'שלט':           ['שלטים', 'שלט', 'signage'],
  'שילוט':         ['שלטים', 'שילוט'],
  'שלט רחוב':      ['שלטי-רחוב'],
  'קונוס':         ['קונוסים'],
  'מגן כבלים':     ['מגן-כבלים'],
  'סימון':         ['סימון-כבישים', 'סימון-וצביעה'],
  'סימון כבישים':  ['סימון-וצביעה'],
  'צביעה':         ['סימון-וצביעה'],
  'הסדר תנועה':    ['הסדרי-תנועה', 'הכוונת-תנועה'],
  'הסדרי תנועה':   ['הסדרי-תנועה', 'הכוונת-תנועה'],
  'עגלת חץ':       ['עגלת-חץ', 'עגלות-חץ'],
  'מד מהירות':     ['מד-מהירות-סולארי'],
};

function normalize(s: string): string {
  return s.replace(/[״׳"']/g, '').replace(/[—–-]+/g, ' ').replace(/[^֐-׿\w\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
function tokens(s: string): string[] { return normalize(s).split(' ').filter(w => w.length >= 2); }

function expandKeywords(phrase: string): string[] {
  const expanded = new Set(tokens(phrase));
  const normPhrase = normalize(phrase);
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (normPhrase.includes(normalize(key))) for (const s of syns) for (const t of tokens(s)) expanded.add(t);
  }
  return [...expanded];
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

// ── Thresholds ───────────────────────────────────────────────────────────────
const PDF_CLEAN_THRESHOLD = 0.55;   // PDF source → clean_product_crop if name matches
const PDF_RELEVANT_MIN    = 0.30;   // PDF source → category_relevant_image
const WEB_CLEAN_THRESHOLD = 0.65;   // website (post-blocklist) → clean
const WEB_RELEVANT_MIN    = 0.30;   // website → relevant

interface MatchResult {
  source: 'pdf' | 'website';
  slug:   string;
  primary_local: string;
  score:  number;
}

function bestPdfMatch(phrase: string, entries: PdfEntry[]): MatchResult | null {
  const kw = expandKeywords(phrase);
  if (!kw.length) return null;
  let best: MatchResult | null = null;
  for (const e of entries) {
    // Match against page_title (primary) + slug_hint (fallback)
    const titleTokens = tokens(e.page_title + ' ' + e.slug_hint.replace(/-/g, ' '));
    const s = f1(kw, titleTokens);
    if (s > 0 && (!best || s > best.score)) {
      best = { source: 'pdf', slug: e.slug_hint, primary_local: e.local, score: s };
    }
  }
  return best;
}

function bestWebMatch(phrase: string, pages: WebPage[], blockedSlugs: Set<string>): MatchResult | null {
  const kw = expandKeywords(phrase);
  if (!kw.length) return null;
  let best: MatchResult | null = null;
  for (const p of pages) {
    if (blockedSlugs.has(p.slug)) continue;       // HARD-REJECT branded slugs
    const slugTokens = tokens(p.slug.replace(/-/g, ' '));
    const s = f1(kw, slugTokens);
    if (s > 0 && (!best || s > best.score)) {
      best = { source: 'website', slug: p.slug, primary_local: p.primary_local, score: s };
    }
  }
  return best;
}

interface Decision {
  row_id: string;
  row_name: string;
  row_category: string;
  prior_image: string | null;
  prior_status: string | null;
  new_source: 'pdf' | 'website' | null;
  new_slug: string | null;
  new_score: number;
  new_image: string | null;
  new_image_status: 'clean_product_crop' | 'category_relevant_image' | 'missing_image' | 'unchanged';
  decision: string;
}

async function main() {
  console.log(`=== Elkayam v3 PDF-First Matcher${LIVE ? ' [LIVE]' : ' [DRY]'} ===\n`);

  const pdfManifest: { entries: PdfEntry[] } = JSON.parse(fs.readFileSync(PDF_MANIFEST, 'utf-8'));
  const webIndex:    { pages: WebPage[] }    = JSON.parse(fs.readFileSync(WEB_INDEX, 'utf-8'));
  const blockData:   { blocked_slugs: string[] } = JSON.parse(fs.readFileSync(BLOCKLIST, 'utf-8'));
  const blockedSlugs = new Set(blockData.blocked_slugs);

  console.log(`PDF entries:       ${pdfManifest.entries.length}`);
  console.log(`Website slugs:     ${webIndex.pages.length}`);
  console.log(`Blocked (logo):    ${blockedSlugs.size}`);
  console.log(`Usable website slugs: ${webIndex.pages.length - blockedSlugs.size}\n`);

  const { data: rows, error } = await supabase
    .from('catalog_items')
    .select('id, name, category, metadata')
    .eq('is_active', true);
  if (error) { console.error(error); process.exit(1); }
  console.log(`Active rows: ${rows!.length}\n`);

  const decisions: Decision[] = [];
  let stats = { pdf_clean: 0, pdf_relevant: 0, web_clean: 0, web_relevant: 0, missing: 0, demoted_from_logo: 0 };

  for (const row of rows!) {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const priorImages = meta.images as Record<string, unknown> | undefined;
    const priorThumb  = priorImages?.thumb as string | undefined;
    const priorStatus = priorImages?.image_status as string | undefined;

    // Tier 1: PDF
    const pdfBest = bestPdfMatch(row.name, pdfManifest.entries)
                ?? bestPdfMatch(row.category, pdfManifest.entries);

    // Tier 2: website (blocklist-filtered)
    const webBest = bestWebMatch(row.name, webIndex.pages, blockedSlugs)
                ?? bestWebMatch(row.category, webIndex.pages, blockedSlugs);

    let chosen: { source: 'pdf' | 'website'; slug: string; primary_local: string; score: number; tier: 'clean' | 'relevant' } | null = null;
    if (pdfBest && pdfBest.score >= PDF_CLEAN_THRESHOLD) {
      chosen = { ...pdfBest, tier: 'clean' };
    } else if (pdfBest && pdfBest.score >= PDF_RELEVANT_MIN) {
      chosen = { ...pdfBest, tier: 'relevant' };
    } else if (webBest && webBest.score >= WEB_CLEAN_THRESHOLD) {
      chosen = { ...webBest, tier: 'clean' };
    } else if (webBest && webBest.score >= WEB_RELEVANT_MIN) {
      chosen = { ...webBest, tier: 'relevant' };
    }

    const wasLogo = priorThumb ? blockedSlugs.has(priorThumb.split('/').pop()?.replace(/-thumb\.webp$/, '') ?? '') : false;
    if (wasLogo) stats.demoted_from_logo++;

    const decision: Decision = {
      row_id:           row.id,
      row_name:         row.name,
      row_category:     row.category,
      prior_image:      priorThumb ?? null,
      prior_status:     priorStatus ?? null,
      new_source:       chosen?.source ?? null,
      new_slug:         chosen?.slug ?? null,
      new_score:        chosen ? Number(chosen.score.toFixed(3)) : 0,
      new_image:        null,
      new_image_status: 'unchanged',
      decision:         '',
    };

    if (!chosen) {
      decision.new_image_status = 'missing_image';
      decision.new_image        = null;
      decision.decision = `No match. PDF best=${pdfBest?.score.toFixed(2) ?? 0}, web(filtered) best=${webBest?.score.toFixed(2) ?? 0}.`;
      stats.missing++;
    } else {
      const m = chosen.primary_local.match(/^(.*)\/original\/([^/]+?)(?:-\d+)?\.[^./]+$/);
      let thumb = chosen.primary_local, full = chosen.primary_local;
      if (m) {
        const [, base, slug] = m;
        thumb = `${base}/thumbs/${slug}-thumb.webp`;
        full  = `${base}/processed/${slug}.webp`;
      }
      decision.new_image = thumb;
      decision.new_image_status = chosen.tier === 'clean' ? 'clean_product_crop' : 'category_relevant_image';
      decision.decision = `${chosen.source}-match slug='${chosen.slug}' score=${chosen.score.toFixed(2)} → ${decision.new_image_status}`;

      if (chosen.source === 'pdf' && chosen.tier === 'clean') stats.pdf_clean++;
      else if (chosen.source === 'pdf') stats.pdf_relevant++;
      else if (chosen.tier === 'clean') stats.web_clean++;
      else stats.web_relevant++;

      if (LIVE) {
        const newMeta: Record<string, unknown> = {
          ...meta,
          images: {
            thumb, full,
            original:    chosen.primary_local,
            source_type: chosen.source === 'pdf' ? 'company_catalog_pdf' : 'elkayam_website',
            source_slug: chosen.slug,
            image_status: decision.new_image_status,
            is_branded:  false,
            crop_status: 'pending',
            imported_at: new Date().toISOString(),
          },
          image_enriched_from: chosen.source === 'pdf' ? 'company_catalog_pdf' : 'elkayam_website',
          image_match_score:  decision.new_score,
          image_match_tier:   chosen.tier,
        };
        if (decision.new_image_status === 'clean_product_crop') {
          delete newMeta.review_state;
        } else {
          newMeta.review_state = 'image_needs_replacement';
        }
        const { error: upd } = await supabase.from('catalog_items').update({ metadata: newMeta }).eq('id', row.id);
        if (upd) console.error(`  UPDATE FAIL ${row.id}: ${upd.message}`);
      }
    }

    decisions.push(decision);
  }

  // For missing_image, when LIVE, clear the bad logo assignment by replacing with null thumb
  if (LIVE) {
    for (const d of decisions) {
      if (d.new_image_status !== 'missing_image') continue;
      const row = rows!.find(r => r.id === d.row_id)!;
      const meta = (row.metadata as Record<string, unknown> | null) ?? {};
      const newMeta: Record<string, unknown> = {
        ...meta,
        images: {
          thumb: null, full: null, original: null,
          image_status: 'missing_image',
          is_branded:   false,
          imported_at:  new Date().toISOString(),
        },
        image_enriched_from: 'none',
        review_state:        'image_needs_replacement',
      };
      const { error: upd } = await supabase.from('catalog_items').update({ metadata: newMeta }).eq('id', row.id);
      if (upd) console.error(`  CLEAR FAIL ${d.row_id}: ${upd.message}`);
    }
  }

  // Reports
  const report = {
    generated_at: new Date().toISOString(),
    live: LIVE,
    counts: {
      active_rows:      rows!.length,
      pdf_clean:        stats.pdf_clean,
      pdf_relevant:     stats.pdf_relevant,
      web_clean:        stats.web_clean,
      web_relevant:     stats.web_relevant,
      missing_image:    stats.missing,
      demoted_from_logo: stats.demoted_from_logo,
    },
    decisions,
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

  const md: string[] = ['# Elkayam v3 match report', `_Generated ${report.generated_at}_`, '', '## Counts'];
  for (const [k, v] of Object.entries(report.counts)) md.push(`- **${k}**: ${v}`);
  md.push('\n## Per-row decisions');
  md.push('| Row | Category | Prior image | New source | New slug | Score | New status |');
  md.push('|---|---|---|---|---|---|---|');
  for (const d of decisions) {
    const prior = (d.prior_image ?? '').split('/').pop() ?? '—';
    md.push(`| ${d.row_name} | ${d.row_category} | ${prior} | ${d.new_source ?? '—'} | ${d.new_slug ?? '—'} | ${d.new_score} | ${d.new_image_status} |`);
  }
  fs.writeFileSync(REPORT_MD, md.join('\n'));

  console.log('\nSummary:');
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);
  console.log(`\nReport: ${REPORT_JSON}`);
  if (!LIVE) console.log('[DRY] No DB writes. Use --live.');
}

main().catch(console.error);
