/**
 * Phase A — Attach new image metadata to catalog_items in Supabase.
 * Reads public/catalog/manifest.json.
 * For items with images: upserts metadata.images.thumb/full/original_url/crop_status.
 * Also marks legacy images.product references as image_needs_replacement.
 *
 * Run: npx tsx scripts/attach-catalog-images.ts
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'catalog', 'manifest.json');

interface ManifestEntry {
  item_id: string;
  file_type: string;
  source: string;
  category: string;
  source_url?: string;
  source_page?: string;
  local_path: string;
  local_thumb?: string;
  local_processed?: string;
  crop_status: string;
  review_state?: string;
  imported_at: string;
}

async function markLegacyImagesForReplacement() {
  console.log('\n[step] Marking legacy safety images for replacement...');
  const { data, error } = await supabase
    .from('catalog_items')
    .select('id, metadata')
    .not('metadata->images->product', 'is', null);

  if (error) { console.error(error); return; }
  if (!data?.length) { console.log('  No legacy images found.'); return; }

  let updated = 0;
  for (const row of data) {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const images = (meta.images as Record<string, unknown>) ?? {};
    if (!images.product) continue;

    const newImages = {
      ...images,
      _legacy_product: images.product,
      _legacy_page: images.page,
      product: undefined,
      page: undefined,
      crop_status: 'image_needs_replacement',
    };

    const { error: updateError } = await supabase
      .from('catalog_items')
      .update({
        metadata: { ...meta, images: newImages },
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (!updateError) updated++;
  }
  console.log(`  Marked ${updated} items as image_needs_replacement.`);
}

async function attachImagesFromManifest() {
  console.log('\n[step] Reading manifest...');
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.log('  No manifest found, skipping.');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const entries: ManifestEntry[] = manifest.entries ?? [];

  // Group by item_id — collect thumb, processed, original together
  const grouped: Record<string, Partial<ManifestEntry> & { local_thumb?: string; local_processed?: string }> = {};
  for (const e of entries) {
    if (!grouped[e.item_id]) grouped[e.item_id] = { ...e };
    if (e.local_thumb) grouped[e.item_id].local_thumb = e.local_thumb;
    if (e.local_processed) grouped[e.item_id].local_processed = e.local_processed;
    if (e.crop_status && e.crop_status !== 'pending') {
      grouped[e.item_id].crop_status = e.crop_status;
    }
  }

  console.log(`  Found ${Object.keys(grouped).length} unique items in manifest.`);
  let attached = 0;
  let notFound = 0;

  for (const [itemId, info] of Object.entries(grouped)) {
    if (!info.local_thumb) continue;

    const { data: existing } = await supabase
      .from('catalog_items')
      .select('id, metadata')
      .eq('id', itemId)
      .maybeSingle();

    if (!existing) {
      notFound++;
      continue;
    }

    const meta = (existing.metadata as Record<string, unknown>) ?? {};
    const newImages = {
      ...(meta.images as Record<string, unknown> ?? {}),
      thumb:        info.local_thumb,
      full:         info.local_processed ?? info.local_thumb,
      original_url: info.source_url ?? '',
      source_page:  info.source_page ?? '',
      crop_status:  info.crop_status ?? 'ok',
      imported_at:  info.imported_at,
    };

    const { error } = await supabase
      .from('catalog_items')
      .update({
        metadata: { ...meta, images: newImages },
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (!error) {
      attached++;
      console.log(`  [ok] ${itemId} → ${info.local_thumb}`);
    } else {
      console.error(`  [err] ${itemId}:`, error.message);
    }
  }

  console.log(`  Attached: ${attached}, Not found in DB (will be created in Phase B): ${notFound}`);
}

async function main() {
  console.log('=== Phase A: Attach catalog image metadata ===');
  await markLegacyImagesForReplacement();
  await attachImagesFromManifest();
  console.log('\n✓ Done.');
}

main().catch(console.error);
