/**
 * Phase B — Import Asclean supplier products into catalog_items as INACTIVE.
 * Reads public/catalog/supplier/asclean/scraped-products.json.
 * Deduplication: skips insert if active Elkayam item with same name already exists.
 * All imports: is_active=false, source_type=external_supplier_reference, review_state=needs_review.
 *
 * Run: npx tsx scripts/import-supplier-catalog.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ASCLEAN_PATH = path.join(
  __dirname, '..', 'public', 'catalog', 'supplier', 'asclean', 'scraped-products.json'
);

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/['"״׳]/g, '')
    .replace(/[—–-]+/g, '-');
}

interface ScrapedProduct {
  item_id: string;
  name_he: string;
  category_folder: string;
  catalog_category: string;
  source_url: string;
  image_url_remote: string | null;
  local_original: string | null;
  local_thumb: string | null;
  local_processed: string | null;
  description: string;
  crop_status: string;
  review_state: string;
  imported_at: string;
}

async function main() {
  console.log('=== Phase B: Supplier catalog import ===\n');

  if (!fs.existsSync(ASCLEAN_PATH)) {
    console.error('scraped-products.json not found — run scrape_asclean.py first.');
    process.exit(1);
  }

  const scraped: { products: ScrapedProduct[] } = JSON.parse(
    fs.readFileSync(ASCLEAN_PATH, 'utf-8')
  );

  // Load all existing active items for dedup check
  const { data: existingItems } = await supabase
    .from('catalog_items')
    .select('id, name, is_active')
    .eq('is_active', true);

  const activeNames = new Set((existingItems ?? []).map(i => normalize(i.name)));
  console.log(`Loaded ${activeNames.size} active items for dedup check.`);

  // Deduplicate scraped products by item_id (keep first of duplicates)
  const seen = new Set<string>();
  const unique = scraped.products.filter(p => {
    if (seen.has(p.item_id)) return false;
    seen.add(p.item_id);
    return true;
  });

  console.log(`Unique products to import: ${unique.length}`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of unique) {
    const nameNorm = normalize(product.name_he);

    if (activeNames.has(nameNorm)) {
      console.log(`  [skip] "${product.name_he}" — already active in catalog`);
      skipped++;
      continue;
    }

    const imagesMeta = product.local_thumb ? {
      thumb:        product.local_thumb,
      full:         product.local_processed ?? product.local_thumb,
      original_url: product.image_url_remote ?? '',
      source_page:  product.source_url,
      crop_status:  product.crop_status,
      imported_at:  product.imported_at,
    } : {
      thumb:        null,
      full:         null,
      original_url: product.image_url_remote ?? '',
      source_page:  product.source_url,
      crop_status:  product.crop_status ?? 'download_failed',
      imported_at:  product.imported_at,
    };

    const row = {
      id:                product.item_id,
      name:              product.name_he,
      type:              'product' as const,
      category:          product.catalog_category,
      unit_of_measure:   'יחידה',
      default_price:     null,
      cost_price:        null,
      description:       product.description || `מוצר ייחוס מספק חיצוני — ${product.catalog_category}`,
      is_active:         false,   // HARD RULE — never true for supplier imports
      current_quantity:  0,
      minimum_quantity:  0,
      reserved_quantity: 0,
      metadata: {
        sources: [{
          type: 'external_supplier_reference',
          note: 'Asclean / ארבל שטראוס',
          url:  product.source_url,
        }],
        images:       imagesMeta,
        review_state: 'needs_review',
        specs:        {},
      },
    };

    const { error } = await supabase
      .from('catalog_items')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      console.error(`  [err] ${product.item_id}: ${error.message}`);
      errors++;
    } else {
      console.log(`  [ok] ${product.item_id} — "${product.name_he}" → ${product.catalog_category}`);
      inserted++;
    }
  }

  console.log(`\n✓ Import done. Inserted/updated: ${inserted}, Skipped (dedup): ${skipped}, Errors: ${errors}`);
}

main().catch(console.error);
