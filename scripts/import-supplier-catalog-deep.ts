/**
 * Phase B (deep) — Import Asclean products from scrape_asclean_deep.py output.
 * Reads public/catalog/supplier/asclean/scraped-products-deep.json.
 *
 * Behaviour:
 *   - All imports: is_active=false, source_type=external_supplier_reference
 *   - Upsert on item_id (idempotent re-runs)
 *   - Removes old shallow placeholder rows (ext-asc-*-placeholder)
 *   - Skips insert if an ACTIVE Elkayam item with the same normalised name exists
 *
 * Run: npx tsx scripts/import-supplier-catalog-deep.ts
 *      npx tsx scripts/import-supplier-catalog-deep.ts --dry-run
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually (dotenv not installed)
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEEP_JSON = path.join(
  __dirname, '..', 'public', 'catalog', 'supplier', 'asclean', 'scraped-products-deep.json'
);

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/['"״׳]/g, '')
    .replace(/[—–-]+/g, '-');
}

interface DownloadedImage {
  local: string | null;
  remote: string;
  status: string;
}

interface DeepProduct {
  item_id: string;
  product_slug: string;
  product_name: string;
  category_path: string[];
  catalog_category: string;
  breadcrumb: string[];
  source_url: string;
  description_short: string;
  description_long: string;
  features: string[];
  spec_variants: Record<string, string>[];
  technical_specs: Record<string, string>;
  image_urls_found: string[];
  images_downloaded: DownloadedImage[];
  local_original: string | null;
  local_thumb: string | null;
  local_processed: string | null;
  specs_downloaded: string[];
  pdf_urls: string[];
  extraction_status: string;
  image_status: string;
  crop_status: string;
  db_status: string;
  review_state: string;
  failure_reason: string | null;
  imported_at: string;
}

async function main() {
  console.log(`=== Asclean Deep Import${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  if (!fs.existsSync(DEEP_JSON)) {
    console.error('scraped-products-deep.json not found.');
    console.error('Run: python3 scripts/scrape_asclean_deep.py');
    process.exit(1);
  }

  const data: { products: DeepProduct[]; report: Record<string, unknown> } =
    JSON.parse(fs.readFileSync(DEEP_JSON, 'utf-8'));

  const products = data.products ?? [];
  console.log(`Input: ${products.length} products from deep scrape\n`);

  // Load active items for name dedup
  const { data: existingItems } = await supabase
    .from('catalog_items')
    .select('id, name, is_active');

  const activeNames = new Set(
    (existingItems ?? []).filter(i => i.is_active).map(i => normalize(i.name))
  );
  console.log(`Active items in DB for dedup: ${activeNames.size}`);

  // Remove old shallow placeholders
  const placeholderIds = (existingItems ?? [])
    .filter(i => i.id.endsWith('-placeholder'))
    .map(i => i.id);

  if (placeholderIds.length > 0) {
    console.log(`\nRemoving ${placeholderIds.length} shallow placeholder rows...`);
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('catalog_items')
        .delete()
        .in('id', placeholderIds);
      if (error) {
        console.warn(`  Warning: could not delete placeholders: ${error.message}`);
      } else {
        console.log(`  Deleted: ${placeholderIds.join(', ')}`);
      }
    } else {
      console.log(`  [dry] Would delete: ${placeholderIds.join(', ')}`);
    }
  }

  // Dedup by item_id
  const seen = new Set<string>();
  const unique = products.filter(p => {
    if (seen.has(p.item_id)) return false;
    seen.add(p.item_id);
    return true;
  });
  console.log(`\nUnique products to import: ${unique.length}`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of unique) {
    const nameNorm = normalize(product.product_name);

    if (activeNames.has(nameNorm)) {
      console.log(`  [skip] "${product.product_name}" — already active in catalog`);
      skipped++;
      continue;
    }

    // Build images metadata — primary downloaded image, with crop pending
    const primaryImg = product.images_downloaded?.find(d => d.local) ?? null;
    const imagesMeta: Record<string, unknown> = {
      thumb:        product.local_thumb ?? null,
      full:         product.local_processed ?? null,
      original:     primaryImg?.local ?? null,
      original_url: primaryImg?.remote ?? product.image_urls_found?.[0] ?? null,
      source_page:  product.source_url,
      crop_status:  product.crop_status ?? 'pending',
      imported_at:  product.imported_at,
    };

    // Build sources array including PDF spec links
    const sources: Array<Record<string, unknown>> = [{
      type: 'external_supplier_reference',
      note: 'Asclean / ארבל שטראוס',
      url:  product.source_url,
    }];
    for (const pdfPath of product.specs_downloaded ?? []) {
      sources.push({ type: 'spec_pdf', url: pdfPath });
    }

    // Build description — use long desc, fall back to short, then generic
    const description =
      product.description_long?.trim() ||
      product.description_short?.trim() ||
      `מוצר ייחוס מספק חיצוני — ${product.catalog_category}`;

    const row = {
      id:                product.item_id,
      name:              product.product_name,
      type:              'product' as const,
      category:          product.catalog_category,
      unit_of_measure:   'יחידה',
      default_price:     null,
      cost_price:        null,
      description,
      is_active:         false,    // HARD RULE — never true for supplier imports
      current_quantity:  0,
      minimum_quantity:  0,
      reserved_quantity: 0,
      metadata: {
        sources,
        images:        imagesMeta,
        review_state:  'needs_review',
        specs:         product.technical_specs ?? {},
        spec_variants: product.spec_variants ?? [],
        features:      product.features ?? [],
        breadcrumb:    product.breadcrumb ?? [],
        category_path: product.category_path ?? [],
        pdf_urls:      product.pdf_urls ?? [],
      },
    };

    if (DRY_RUN) {
      console.log(`  [dry] ${product.item_id} — "${product.product_name}" → ${product.catalog_category}`);
      inserted++;
      continue;
    }

    const { error } = await supabase
      .from('catalog_items')
      .upsert(row, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      console.error(`  [err] ${product.item_id}: ${error.message}`);
      errors++;
    } else {
      const imgStatus = product.local_original ? '📷' : '🚫';
      const specCount = Object.keys(product.technical_specs ?? {}).length;
      console.log(`  [ok] ${imgStatus} ${product.item_id} — "${product.product_name}" | specs=${specCount}`);
      inserted++;
    }
  }

  console.log(`\n✓ Done.`);
  console.log(`  Imported/updated: ${inserted}`);
  console.log(`  Skipped (name dedup): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Placeholders removed: ${placeholderIds.length}`);

  if (DRY_RUN) {
    console.log('\n[dry run] No changes written to DB.');
  }
}

main().catch(console.error);
