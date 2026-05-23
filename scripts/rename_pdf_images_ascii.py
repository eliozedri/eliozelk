#!/usr/bin/env python3
"""
Rename PDF-extracted product images to ASCII-only filenames so they
serve cleanly through Vercel's CDN regardless of URL-encoding quirks.

Pattern:
  pdf-p012-i03-עיני-חתול.png  →  pdf-p012-i03.png
  pdf-p012-i03-עיני-חתול-thumb.webp → pdf-p012-i03-thumb.webp

Updates the corresponding manifest.json and writes a rename map for the
DB-update script.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_DIR = os.path.join(ROOT, 'public', 'catalog', 'elkayam', 'pdf-extracted')
MANIFEST = os.path.join(PDF_DIR, 'manifest.json')
MAP_OUT  = os.path.join(PDF_DIR, 'ascii-rename-map.json')

# Strict ASCII: keep [a-z0-9-_.]; everything else collapses to '-'.
ASCII_RE = re.compile(r'^([a-z0-9][a-z0-9\-_.]*)$', re.I)

def ascii_only(stem: str) -> str:
    # Strip any trailing -hebrew suffix, keeping pdf-pNNN-iMM(-NN)? prefix
    m = re.match(r'^(pdf-p\d{3}-i\d{2})(?:-(\d+))?(?:-.+)?$', stem)
    if m:
        prefix = m.group(1)
        idx    = m.group(2)
        return f"{prefix}-{idx}" if idx else prefix
    # Fallback — just strip non-ascii
    return re.sub(r'[^a-zA-Z0-9_.-]+', '-', stem).strip('-')


def main():
    if not os.path.exists(MANIFEST):
        print(f'manifest not found: {MANIFEST}')
        sys.exit(1)
    manifest = json.load(open(MANIFEST, encoding='utf-8'))

    rename_map = {}  # old-rel-path -> new-rel-path
    renamed = 0
    skipped = 0

    for entry in manifest['entries']:
        old_local = entry['local']  # e.g. /catalog/elkayam/pdf-extracted/page-012/original/pdf-p012-i03-עיני-חתול.png
        old_filename = old_local.split('/')[-1]
        stem, ext = os.path.splitext(old_filename)
        new_stem = ascii_only(stem)
        if new_stem == stem:
            skipped += 1
            entry['local_ascii'] = old_local  # already ascii
            continue
        new_filename = new_stem + ext
        new_local = old_local.rsplit('/', 1)[0] + '/' + new_filename

        # Rename original file
        old_abs = os.path.join(ROOT, 'public', old_local.lstrip('/'))
        new_abs = os.path.join(ROOT, 'public', new_local.lstrip('/'))
        if not os.path.exists(old_abs):
            print(f'  MISSING: {old_abs}')
            continue
        if os.path.exists(new_abs) and old_abs != new_abs:
            print(f'  COLLISION (skipping): {new_abs} already exists')
            continue
        os.rename(old_abs, new_abs)

        # Rename thumbs/processed siblings (best-effort)
        for kind, ext_out in [('thumbs', '-thumb.webp'), ('processed', '.webp')]:
            sib_dir = os.path.join(os.path.dirname(os.path.dirname(old_abs)), kind)
            if not os.path.isdir(sib_dir):
                continue
            old_sib = stem + ('-thumb.webp' if kind == 'thumbs' else '.webp')
            new_sib = new_stem + ('-thumb.webp' if kind == 'thumbs' else '.webp')
            old_sib_path = os.path.join(sib_dir, old_sib)
            new_sib_path = os.path.join(sib_dir, new_sib)
            if os.path.exists(old_sib_path) and not os.path.exists(new_sib_path):
                os.rename(old_sib_path, new_sib_path)

        entry['local_ascii'] = new_local
        rename_map[old_local] = new_local
        renamed += 1

    # Save updated manifest
    json.dump(manifest, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    # Save the rename map for the DB updater
    json.dump(rename_map, open(MAP_OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'\n✓ Renamed {renamed} files (skipped {skipped} already-ascii).')
    print(f'  Manifest updated:  {MANIFEST}')
    print(f'  Rename map saved:  {MAP_OUT}')


if __name__ == '__main__':
    main()
