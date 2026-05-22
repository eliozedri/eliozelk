#!/usr/bin/env python3
"""
Build a name→image index from the downloaded elkayam.co.il images.
Each filename is a Hebrew slug derived from the source page title.

Output: public/catalog/elkayam/image-index.json
Format:
  { "pages": [ { "slug": "...", "primary_local": "...", "extras": [...] }, ... ] }
"""
import json, os, re
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR      = os.path.join(PROJECT_ROOT, 'public', 'catalog', 'elkayam', 'website', 'original')
OUT_FILE     = os.path.join(PROJECT_ROOT, 'public', 'catalog', 'elkayam', 'image-index.json')

def main():
    if not os.path.isdir(SRC_DIR):
        print(f'no such dir: {SRC_DIR}')
        return
    files = [f for f in os.listdir(SRC_DIR)
             if not f.startswith('.') and os.path.splitext(f)[1].lower() in
             ('.jpg', '.jpeg', '.png', '.webp')]
    groups = {}
    for fname in files:
        stem, ext = os.path.splitext(fname)
        # Strip trailing -N suffix so all variants group under their base slug
        m = re.match(r'^(.*?)(?:-(\d+))?$', stem)
        base = m.group(1) if m else stem
        suffix = m.group(2) if m else None
        groups.setdefault(base, []).append({
            'fname':  fname,
            'rel':    f'/catalog/elkayam/website/original/{fname}',
            'suffix': suffix,
        })

    pages = []
    for base, files in sorted(groups.items()):
        # Primary = no suffix; otherwise lowest-numbered
        primary = next((f for f in files if f['suffix'] is None), None)
        if not primary:
            files_sorted = sorted(files, key=lambda f: int(f['suffix'] or '0'))
            primary = files_sorted[0]
        extras = [f for f in files if f is not primary]
        pages.append({
            'slug':          base,
            'primary_local': primary['rel'],
            'all_locals':    [f['rel'] for f in files],
            'extra_count':   len(extras),
        })

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump({'pages': pages, 'count': len(pages)}, f, ensure_ascii=False, indent=2)
    print(f'Indexed {len(pages)} distinct image groups → {OUT_FILE}')

    # Sample
    for p in pages[:10]:
        print(f'  {p["slug"]} → {p["primary_local"]} (+{p["extra_count"]} extras)')


if __name__ == '__main__':
    main()
