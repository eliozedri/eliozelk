/**
 * Update catalog_items.metadata.images paths that reference the renamed
 * pdf-extracted files. Uses ascii-rename-map.json built by
 * rename_pdf_images_ascii.py.
 *
 * Idempotent: skips rows whose paths are already ASCII.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ROOT     = path.join(__dirname, '..');
const MAP_FILE = path.join(ROOT, 'public', 'catalog', 'elkayam', 'pdf-extracted', 'ascii-rename-map.json');

interface Images { thumb?: string|null; full?: string|null; original?: string|null; [k: string]: unknown }

function deriveSiblings(oldPath: string, newPath: string): { oldThumb: string; newThumb: string; oldFull: string; newFull: string } {
  // /catalog/elkayam/pdf-extracted/page-012/original/pdf-p012-i03-עיני-חתול.png
  const oldStem = path.basename(oldPath, path.extname(oldPath));
  const newStem = path.basename(newPath, path.extname(newPath));
  const oldDirSegments = oldPath.split('/');
  const baseSegments = oldDirSegments.slice(0, oldDirSegments.indexOf('original'));
  const base = baseSegments.join('/');
  return {
    oldThumb: `${base}/thumbs/${oldStem}-thumb.webp`,
    newThumb: `${base}/thumbs/${newStem}-thumb.webp`,
    oldFull:  `${base}/processed/${oldStem}.webp`,
    newFull:  `${base}/processed/${newStem}.webp`,
  };
}

async function main() {
  const renameMap: Record<string, string> = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
  console.log(`Rename map: ${Object.keys(renameMap).length} originals.`);

  // Build full thumb→thumb and processed→processed maps too
  const thumbMap: Record<string, string> = {};
  const fullMap:  Record<string, string> = {};
  for (const [oldOrig, newOrig] of Object.entries(renameMap)) {
    const sib = deriveSiblings(oldOrig, newOrig);
    thumbMap[sib.oldThumb] = sib.newThumb;
    fullMap[sib.oldFull]   = sib.newFull;
  }

  const { data: rows, error } = await supabase
    .from('catalog_items')
    .select('id, name, metadata');
  if (error) { console.error(error); process.exit(1); }

  let updated = 0, untouched = 0;
  for (const row of rows!) {
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const images = (meta.images as Images | undefined) ?? {};
    let dirty = false;
    const next: Images = { ...images };

    if (images.original && renameMap[images.original]) {
      next.original = renameMap[images.original];
      dirty = true;
    }
    if (images.thumb && thumbMap[images.thumb]) {
      next.thumb = thumbMap[images.thumb];
      dirty = true;
    }
    if (images.full && fullMap[images.full]) {
      next.full = fullMap[images.full];
      dirty = true;
    }
    if (!dirty) { untouched++; continue; }

    const newMeta = { ...meta, images: next };
    const { error: upd } = await supabase.from('catalog_items').update({ metadata: newMeta }).eq('id', row.id);
    if (upd) {
      console.error(`UPDATE FAIL ${row.id}: ${upd.message}`);
    } else {
      updated++;
    }
  }
  console.log(`\n✓ Updated ${updated} rows; left ${untouched} untouched.`);
}

main().catch(console.error);
