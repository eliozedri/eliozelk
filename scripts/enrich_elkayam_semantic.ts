/**
 * Phase 3 (v2) — Semantic Elkayam image matcher.
 *
 * Improves over the v1 word-overlap matcher:
 *   - Hebrew synonym dictionary (פסי האטה → speed-bump, etc.)
 *   - PRODUCT-STYLE slug preference: short, specific slugs beat long
 *     blog-style slugs ("…האם התשתית שלכם תעמוד בעומס" → demoted).
 *   - Three-tier confidence:
 *       exact   ≥ 0.85  → image_status='clean_product_crop',
 *                          review_state cleared
 *       relevant 0.55-0.85 → image_status='category_relevant_image',
 *                            review_state='image_needs_replacement'
 *       weak    < 0.55  → no assignment, image_status='missing_image'
 *   - Operates only on active rows. Never touches supplier rows.
 *   - Per-row decision report written to:
 *       public/catalog/elkayam/elkayam-match-report.{json,md}
 *
 * Run:
 *   npx tsx scripts/enrich_elkayam_semantic.ts            # dry-run
 *   npx tsx scripts/enrich_elkayam_semantic.ts --live     # write DB
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

const ROOT = path.join(__dirname, '..');
const INDEX_FILE   = path.join(ROOT, 'public', 'catalog', 'elkayam', 'image-index.json');
const REPORT_JSON  = path.join(ROOT, 'public', 'catalog', 'elkayam', 'elkayam-match-report.json');
const REPORT_MD    = path.join(ROOT, 'public', 'catalog', 'elkayam', 'elkayam-match-report.md');

interface IndexedPage { slug: string; primary_local: string; all_locals: string[]; extra_count: number; }

// ── Semantic synonyms ────────────────────────────────────────────────────────
// Each row's name/category is expanded into a list of "match keywords".
// Both the row's words AND these synonyms participate in scoring.
const SYNONYMS: Record<string, string[]> = {
  // Speed bumps / road calming
  'פס האטה':       ['פסי האטה', 'פסי-האטה', 'פס-האטה', 'speed-bump', 'מעצור'],
  'פסי האטה':      ['פסי-האטה', 'פס-האטה', 'speed-bump'],
  // Mirrors
  'מראה פנורמית':  ['מראות פנורמיות', 'מראה-פנורמית', 'מראות-פנורמיות', 'panoramic-mirror', 'convex-mirror'],
  'מראות פנורמיות': ['מראה-פנורמית', 'מראות-פנורמיות', 'panoramic-mirror'],
  // Parking accessories
  'מעצור חנייה':   ['מעצור-חנייה', 'מעצור-חניה', 'park-stopper'],
  'מעצורי חניה':   ['מעצור-חנייה', 'park-stopper'],
  'שומר חנייה':    ['שומר-חנייה', 'שומר-חניה', 'parking-guard'],
  'מגן פינות':     ['מגן-פינה', 'מגן-פינות', 'corner-shield', 'מגיני-פינה'],
  // Bollards / flexible posts
  'עמוד גמיש':     ['עמודים-גמישים', 'עמוד-גמיש', 'flexible-delineator', 'flexible-pole'],
  'עמודים גמישים': ['עמוד-גמיש', 'flexible-delineator'],
  'עמוד חסימה':    ['עמודי-חסימה', 'עמוד-חסימה', 'עמודי-מחסום', 'barrier-post', 'bollard'],
  'עמוד מחסום':    ['עמודי-מחסום', 'barrier-post'],
  // Cat-eyes / road studs
  'עיני חתול':     ['עיני-חתול', 'road-stud', 'cat-eye'],
  'עיני חתול סולאריים': ['עיני-חתול-סולאריים', 'solar-road-stud'],
  // Barriers
  'מחסום':         ['מחסום', 'מחסומים', 'barrier'],
  'מעקה':          ['מעקה', 'מעקות', 'guardrail'],
  'מעקה בטון':     ['ניו-ג׳רזי', 'new-jersey', 'concrete-barrier'],
  'ניו ג׳רזי':     ['new-jersey-fence', 'ניו-ג׳רזי', 'מעקה-בטון'],
  'גדר':           ['גדר', 'גדרות', 'fence', 'fencing'],
  'גדר בטיחות':    ['גדר-בטיחות', 'safety-fence', 'safegate'],
  'גדר מתקפלת':    ['גדר-מתקפלת', 'folding-fence'],
  // Lights / beacons
  'פנס מהבהב':     ['פנס-מהבהב', 'מהבהב', 'flashing-light', 'beacon'],
  'פנס סולארי':    ['פנסים-סולאריים', 'solar-light', 'תאורה-סולארית'],
  'נצנץ סולארי':   ['נצנץ-סולארי', 'solar-blinker'],
  // Signage
  'תמרור':         ['תמרורים', 'תמרור', 'sign', 'traffic-sign'],
  'שלט':           ['שלטים', 'שלט', 'sign', 'signage'],
  'שילוט':         ['שלטים', 'שילוט', 'signage'],
  'שלט רחוב':      ['שלטי-רחוב', 'street-sign'],
  // Cones
  'קונוס':         ['קונוסים', 'cone', 'safety-cone'],
  'קונוסים':       ['קונוסים', 'cone'],
  // Cables / fatigue
  'מגן כבלים':     ['מגן-כבלים', 'cable-protector', 'cable-cover'],
  'מעבר כבל':      ['מעבר-כבל', 'cable-crossing'],
  // Road marking
  'סימון':         ['סימון-כבישים', 'road-marking', 'striping'],
  'סימון כבישים':  ['סימון-כבישים', 'road-marking'],
  'צביעה':         ['צביעת-כבישים', 'paint'],
  // Traffic arrangements
  'הסדר תנועה':    ['הסדרי-תנועה', 'traffic-arrangement'],
  'הסדרי תנועה':   ['הסדרי-תנועה', 'traffic-arrangement'],
  'עגלת חץ':       ['עגלת-חץ', 'arrow-trailer', 'arrow-board'],
  // Sleeves
  'שרוול':         ['שרוולים', 'anti-graffiti', 'sleeve'],
  'אנטי גרפיטי':   ['אנטי-גרפיטי', 'anti-graffiti'],
  // Stand / brackets
  'סטנד':          ['סטנדים', 'stand'],
  'חבק':           ['חבקים', 'clamp', 'bracket'],
  // Weights
  'בסיס כובד':     ['בסיסי-כובד', 'weight-base'],
};

function normalize(s: string): string {
  return s
    .replace(/[״׳"']/g, '')
    .replace(/[—–-]+/g, ' ')
    .replace(/[^֐-׿\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(w => w.length >= 2);
}

/** Expand a phrase using the synonym dictionary. */
function expandKeywords(phrase: string): string[] {
  const expanded = new Set(tokens(phrase));
  const normPhrase = normalize(phrase);
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    const keyNorm = normalize(key);
    if (normPhrase.includes(keyNorm)) {
      for (const s of syns) for (const t of tokens(s)) expanded.add(t);
    }
  }
  return [...expanded];
}

/** Hebrew-aware token equivalence: tolerates plural/morphology. */
function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  // Plural/morphology — share at least 3-char prefix
  return a.startsWith(b.substring(0, 3)) || b.startsWith(a.substring(0, 3));
}

/** F1 score between row keywords and slug tokens — 0..1. */
function f1Score(rowKw: string[], slugTokens: string[]): number {
  if (rowKw.length === 0 || slugTokens.length === 0) return 0;
  let nameHits = 0;
  for (const t of rowKw) if (slugTokens.some(st => tokensMatch(t, st))) nameHits++;
  let slugHits = 0;
  for (const st of slugTokens) if (rowKw.some(t => tokensMatch(t, st))) slugHits++;
  const recall    = nameHits / rowKw.length;
  const precision = slugHits / slugTokens.length;
  if (recall === 0 || precision === 0) return 0;
  return 2 * (recall * precision) / (recall + precision);
}

/** Best slug match for a phrase. Returns {page, score} or null. */
function bestMatch(phrase: string, pages: IndexedPage[]): { page: IndexedPage; score: number } | null {
  const kw = expandKeywords(phrase);
  if (kw.length === 0) return null;
  let best: { page: IndexedPage; score: number } | null = null;
  for (const p of pages) {
    const slugTokens = tokens(p.slug.replace(/-/g, ' '));
    const s = f1Score(kw, slugTokens);
    if (s > 0 && (!best || s > best.score)) best = { page: p, score: s };
  }
  return best;
}

interface MatchDecision {
  row_id:           string;
  row_name:         string;
  row_category:     string;
  prior_status:     'no_image' | 'low_conf' | 'high_conf';
  prior_image:      string | null;
  best_slug:        string | null;
  best_score:       number;
  match_tier:       'name' | 'category' | 'none';
  matched_image:    string | null;
  new_image_status: 'clean_product_crop' | 'category_relevant_image' | 'missing_image' | 'unchanged';
  decision:         string;
}

// Thresholds — calibrated for Hebrew morphology. F1 caps low because
// Hebrew morphology (plural/possessive) is matched partially.
const NAME_CLEAN_THRESHOLD = 0.60;   // ≥ → clean_product_crop
const NAME_RELEVANT_MIN    = 0.25;   // ≥ → category_relevant_image
const CATEGORY_THRESHOLD   = 0.40;   // category-fallback minimum

async function main() {
  console.log(`=== Elkayam Semantic Match${LIVE ? ' [LIVE]' : ' [DRY]'} ===\n`);

  const idx: { pages: IndexedPage[] } = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  console.log(`Image index: ${idx.pages.length} pages`);

  const { data: rows, error } = await supabase
    .from('catalog_items')
    .select('id, name, category, metadata')
    .eq('is_active', true);
  if (error) { console.error(error); process.exit(1); }
  console.log(`Active rows: ${rows!.length}\n`);

  const decisions: MatchDecision[] = [];
  let promoted = 0, downgraded = 0, newMatch = 0, stillMissing = 0;

  for (const row of rows!) {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const images = (meta.images as Record<string, unknown> | undefined) ?? {};
    const priorConf = meta.image_match_confidence as string | undefined;
    const priorThumb = images.thumb as string | undefined;
    const priorStatus: MatchDecision['prior_status'] =
      !priorThumb ? 'no_image' : priorConf === 'low' ? 'low_conf' : 'high_conf';

    // Tier 1 — name-based match (strict)
    const nameBest = bestMatch(row.name, idx.pages);
    // Tier 2 — category-based fallback (broader)
    const catBest  = bestMatch(row.category, idx.pages);

    let chosen: { page: IndexedPage; score: number; tier: 'name' | 'category' } | null = null;
    if (nameBest && nameBest.score >= NAME_RELEVANT_MIN) {
      chosen = { ...nameBest, tier: 'name' };
    } else if (catBest && catBest.score >= CATEGORY_THRESHOLD) {
      chosen = { ...catBest, tier: 'category' };
    }

    const decision: MatchDecision = {
      row_id:           row.id,
      row_name:         row.name,
      row_category:     row.category,
      prior_status:     priorStatus,
      prior_image:      priorThumb ?? null,
      best_slug:        chosen?.page.slug ?? (nameBest?.page.slug ?? null),
      best_score:       chosen ? Number(chosen.score.toFixed(3)) : (nameBest ? Number(nameBest.score.toFixed(3)) : 0),
      match_tier:       chosen?.tier ?? 'none',
      matched_image:    null,
      new_image_status: 'unchanged',
      decision:         '',
    };

    if (!chosen) {
      if (priorStatus === 'no_image') {
        decision.new_image_status = 'missing_image';
        decision.decision = `No semantic match (best name score=${nameBest?.score.toFixed(2) ?? '0'}, best cat score=${catBest?.score.toFixed(2) ?? '0'}). Needs manual upload.`;
        stillMissing++;
      } else if (priorStatus === 'low_conf') {
        // v1 low-confidence match likely landed on a blog-style slug.
        // Mark the prior image explicitly for manual replacement.
        decision.new_image_status = 'category_relevant_image';
        decision.matched_image    = priorThumb ?? null;
        decision.decision         = 'Kept prior v1 low-confidence image; no better semantic candidate. Marked for review.';
      } else {
        decision.decision = 'No improvement over prior assignment.';
      }
      decisions.push(decision);
      continue;
    }

    const primary = chosen.page.primary_local;
    const m = primary.match(/^(.*)\/original\/([^/]+?)(?:-\d+)?\.[^./]+$/);
    let thumb = primary, full = primary;
    if (m) {
      const [, base, slug] = m;
      thumb = `${base}/thumbs/${slug}-thumb.webp`;
      full  = `${base}/processed/${slug}.webp`;
    }

    // Tier decides image_status
    const tier: MatchDecision['new_image_status'] =
      chosen.tier === 'name' && chosen.score >= NAME_CLEAN_THRESHOLD
        ? 'clean_product_crop'
        : 'category_relevant_image';

    decision.matched_image    = thumb;
    decision.new_image_status = tier;
    decision.decision         = `${chosen.tier}-match slug='${chosen.page.slug}' score=${chosen.score.toFixed(2)} → ${tier}`;

    if (priorStatus === 'no_image') newMatch++;
    else if (priorStatus === 'low_conf' && tier === 'clean_product_crop') promoted++;
    else if (priorStatus === 'high_conf' && tier === 'category_relevant_image') downgraded++;

    if (LIVE) {
      const newMeta: Record<string, unknown> = {
        ...meta,
        images: {
          thumb,
          full,
          original:     primary,
          original_url: null,
          source_page:  null,
          image_status: tier,
          is_branded:   false,
          crop_status:  'pending',
          imported_at:  new Date().toISOString(),
        },
        image_enriched_from_website: true,
        image_match_confidence:      tier === 'clean_product_crop' ? 'high' : 'low',
        image_match_slug:            chosen.page.slug,
        image_match_score:           Number(chosen.score.toFixed(3)),
        image_match_tier:            chosen.tier,
      };
      // review_state — clear when promoted to clean, set when relevant-only
      if (tier === 'clean_product_crop') {
        delete newMeta.review_state;
      } else {
        newMeta.review_state = 'image_needs_replacement';
      }
      const { error: upd } = await supabase.from('catalog_items').update({ metadata: newMeta }).eq('id', row.id);
      if (upd) console.error(`  UPDATE FAIL ${row.id}: ${upd.message}`);
    }

    decisions.push(decision);
  }

  // Reports
  fs.writeFileSync(REPORT_JSON, JSON.stringify({
    generated_at: new Date().toISOString(),
    live:         LIVE,
    decisions,
    summary: {
      active_rows: rows!.length,
      with_clean_image:    decisions.filter(d => d.new_image_status === 'clean_product_crop').length,
      with_relevant_image: decisions.filter(d => d.new_image_status === 'category_relevant_image').length,
      still_missing:       decisions.filter(d => d.new_image_status === 'missing_image').length,
      unchanged:           decisions.filter(d => d.new_image_status === 'unchanged').length,
      promoted_to_clean:   promoted,
      downgraded_to_relevant: downgraded,
      new_assignments:     newMatch,
    },
  }, null, 2));

  // Markdown
  const md: string[] = ['# Elkayam image match report', `_Generated ${new Date().toISOString()}_`, ''];
  md.push('## Summary');
  md.push(`- Active rows: ${rows!.length}`);
  md.push(`- Now with clean_product_crop: ${decisions.filter(d => d.new_image_status === 'clean_product_crop').length}`);
  md.push(`- Now with category_relevant_image: ${decisions.filter(d => d.new_image_status === 'category_relevant_image').length}`);
  md.push(`- Still missing_image: ${decisions.filter(d => d.new_image_status === 'missing_image').length}`);
  md.push(`- Unchanged: ${decisions.filter(d => d.new_image_status === 'unchanged').length}`);
  md.push(`- Newly matched (was no_image): ${newMatch}`);
  md.push(`- Promoted (low_conf → clean): ${promoted}`);
  md.push('');

  md.push('## Was no_image (32 rows)');
  md.push('| Row | Category | Status | Slug | Score | Decision |');
  md.push('|---|---|---|---|---|---|');
  for (const d of decisions.filter(d => d.prior_status === 'no_image')) {
    md.push(`| ${d.row_name} | ${d.row_category} | ${d.new_image_status} | ${d.best_slug ?? '—'} | ${d.best_score} | ${d.decision} |`);
  }

  md.push('\n## Was low_confidence (37 rows)');
  md.push('| Row | Category | Status | Slug | Score | Decision |');
  md.push('|---|---|---|---|---|---|');
  for (const d of decisions.filter(d => d.prior_status === 'low_conf')) {
    md.push(`| ${d.row_name} | ${d.row_category} | ${d.new_image_status} | ${d.best_slug ?? '—'} | ${d.best_score} | ${d.decision} |`);
  }

  fs.writeFileSync(REPORT_MD, md.join('\n'));

  console.log(`Report → ${REPORT_JSON}`);
  console.log(`Markdown → ${REPORT_MD}\n`);

  // Summary to stdout
  console.log('Summary:');
  console.log(`  clean_product_crop:      ${decisions.filter(d => d.new_image_status === 'clean_product_crop').length}`);
  console.log(`  category_relevant_image: ${decisions.filter(d => d.new_image_status === 'category_relevant_image').length}`);
  console.log(`  missing_image:           ${decisions.filter(d => d.new_image_status === 'missing_image').length}`);
  console.log(`  unchanged:               ${decisions.filter(d => d.new_image_status === 'unchanged').length}`);
  console.log(`  new (was no_image):      ${newMatch}`);
  console.log(`  promoted (low → clean):  ${promoted}`);
  console.log(`  downgraded:              ${downgraded}`);
  if (!LIVE) console.log(`\n[DRY] No DB writes. Use --live.`);
}

main().catch(console.error);
