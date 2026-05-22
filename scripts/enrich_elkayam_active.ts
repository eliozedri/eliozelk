/**
 * Phase 3 — Enrich ACTIVE Elkayam rows with images from elkayam.co.il scrape.
 *
 * Reads:
 *   public/catalog/elkayam/scraped-pages.json
 *
 * Matches each scraped page to an active catalog_items row by:
 *   - normalised name fuzzy-match against title + h2 sections
 *   - category hint (if scraped page has a category)
 *
 * Updates only rows that:
 *   - is_active = true
 *   - lack metadata.images.thumb
 *
 * Hard rules:
 *   - never sets is_active=false on Elkayam rows
 *   - never overwrites existing image metadata
 *   - never touches supplier (ext-asc-*) rows
 *
 * Usage:
 *   npx tsx scripts/enrich_elkayam_active.ts            # dry-run by default
 *   npx tsx scripts/enrich_elkayam_active.ts --live     # write to DB
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

const INDEX_FILE = path.join(__dirname, '..', 'public', 'catalog', 'elkayam', 'image-index.json');

interface IndexedPage {
  slug:          string;
  primary_local: string;
  all_locals:    string[];
  extra_count:   number;
}
// Shim for compatibility with old name-score logic
interface ScrapedPage {
  url: string;
  title: string;
  h2_sections: string[];
  local_images: Array<{ remote: string; local: string }>;
}

function normalize(s: string): string {
  return s
    .replace(/[״׳"']/g, '')
    .replace(/[—–-]+/g, ' ')
    .replace(/[^֐-׿\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Score 0..1 — share of words from row.name that appear in page title/h2 text. */
function nameScore(rowName: string, page: ScrapedPage): number {
  const rowWords = normalize(rowName).split(' ').filter(w => w.length >= 2);
  if (rowWords.length === 0) return 0;
  const haystack = normalize(page.title + ' ' + page.h2_sections.join(' '));
  let hits = 0;
  for (const w of rowWords) {
    if (haystack.includes(w)) hits++;
  }
  return hits / rowWords.length;
}

async function main() {
  console.log(`=== Elkayam enrichment${LIVE ? ' [LIVE]' : ' [dry-run]'} ===\n`);

  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`Missing ${INDEX_FILE}`);
    console.error('  Run: python3 scripts/build_elkayam_image_index.py');
    process.exit(1);
  }
  const idx: { pages: IndexedPage[] } = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  // Map indexed pages → ScrapedPage shape. The slug doubles as the title since
  // it was derived directly from the elkayam.co.il page title at download time.
  const pagesWithImages: ScrapedPage[] = idx.pages.map(p => ({
    url:          '',
    title:        p.slug.replace(/-/g, ' '),
    h2_sections: [],
    local_images: [{ remote: '', local: p.primary_local }],
  }));
  console.log(`Indexed: ${idx.pages.length} image groups available for matching.\n`);

  const { data: rows, error } = await supabase
    .from('catalog_items')
    .select('id, name, category, is_active, metadata')
    .eq('is_active', true);
  if (error) { console.error(error); process.exit(1); }

  const needImage = (rows ?? []).filter(r => {
    const images = (r.metadata as Record<string, unknown> | null)?.images as Record<string, unknown> | undefined;
    return !images?.thumb;
  });
  console.log(`Active rows needing images: ${needImage.length} / ${rows?.length}\n`);

  let matched = 0;
  let lowConfidence = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of needImage) {
    let best: { page: ScrapedPage; score: number } | null = null;
    for (const page of pagesWithImages) {
      const score = nameScore(row.name, page);
      if (score >= 0.5 && (!best || score > best.score)) {
        best = { page, score };
      }
    }
    if (!best) {
      skipped++;
      continue;
    }
    matched++;
    if (best.score < 0.7) {
      lowConfidence++;
    }

    const primary = best.page.local_images[0].local;
    // Derived thumb/processed paths follow the elkayam folder layout
    // /catalog/elkayam/website/original/<slug>.jpg →
    // /catalog/elkayam/website/thumbs/<slug>-thumb.webp
    const m = primary.match(/^(.*)\/original\/([^/]+?)(?:-\d+)?\.[^./]+$/);
    let thumb = primary;
    let full  = primary;
    if (m) {
      const [, base, slug] = m;
      thumb = `${base}/thumbs/${slug}-thumb.webp`;
      full  = `${base}/processed/${slug}.webp`;
    }

    const existingMeta = (row.metadata as Record<string, unknown> | null) ?? {};
    const newMeta: Record<string, unknown> = {
      ...existingMeta,
      images: {
        thumb,
        full,
        original:     primary,
        original_url: best.page.local_images[0].remote,
        source_page:  best.page.url,
        image_status: 'clean_product_crop',  // Elkayam-source = approved by default
        is_branded:   false,
        crop_status:  'pending',
        imported_at:  new Date().toISOString(),
      },
      image_enriched_from_website: true,
      image_match_confidence:      best.score < 0.7 ? 'low' : 'high',
    };

    if (best.score < 0.7) {
      // Mark for human review when fuzzy match is uncertain
      newMeta.review_state = 'image_needs_replacement';
    }

    console.log(`  ${(best.score * 100).toFixed(0)}% │ "${row.name}" ← "${best.page.title}"`);

    if (LIVE) {
      const { error: upd } = await supabase
        .from('catalog_items')
        .update({ metadata: newMeta })
        .eq('id', row.id);
      if (upd) {
        console.error(`    UPDATE FAIL: ${upd.message}`);
      } else {
        updated++;
      }
    } else {
      updated++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Active rows needing image:  ${needImage.length}`);
  console.log(`  Matched:                    ${matched}`);
  console.log(`  ├─ high confidence (≥70%):  ${matched - lowConfidence}`);
  console.log(`  └─ low confidence (50-70%): ${lowConfidence}`);
  console.log(`  Skipped (no match):         ${skipped}`);
  console.log(`  ${LIVE ? 'Updated in DB' : 'Would update'}: ${updated}`);
  if (!LIVE) console.log(`\n[dry-run] Use --live to write to DB.`);
}

main().catch(console.error);
