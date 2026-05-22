#!/usr/bin/env python3
"""
Extract product images from מקורות מידע/catalog/catalog.pdf.

For each PDF page:
  - extract embedded images
  - capture surrounding text (used as caption / product name)
  - save image to public/catalog/elkayam/pdf-extracted/<safe_slug>/original/
  - record a manifest entry with page number + caption text

Output: public/catalog/elkayam/pdf-extracted/manifest.json
"""
import fitz  # PyMuPDF
import hashlib, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF  = os.path.join(ROOT, 'מקורות מידע', 'catalog', 'catalog.pdf')
OUT  = os.path.join(ROOT, 'public', 'catalog', 'elkayam', 'pdf-extracted')


def slugify(s, default='item'):
    s = s.strip()
    s = re.sub(r'[״׳"\'<>:/\\|?*]', '', s)
    s = re.sub(r'\s+', '-', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s[:60] or default


def main():
    if not os.path.exists(PDF):
        print(f'ERROR: {PDF} not found')
        sys.exit(1)

    doc = fitz.open(PDF)
    print(f'Opened: {PDF}')
    print(f'  Pages: {doc.page_count}')

    os.makedirs(OUT, exist_ok=True)
    entries = []
    seen_hashes = set()
    img_id = 0

    for page_num in range(doc.page_count):
        page = doc[page_num]

        # Page text (RTL-friendly) — keep first 600 chars as raw caption material
        text = page.get_text("text") or ''
        text = re.sub(r'\s+', ' ', text).strip()[:600]

        # Page-level keywords from headings (largest font lines)
        blocks = page.get_text("dict").get('blocks', [])
        headings = []
        for b in blocks:
            for line in b.get('lines', []):
                for span in line.get('spans', []):
                    if span.get('size', 0) >= 14 and span.get('text', '').strip():
                        headings.append(span['text'].strip())
        page_title = headings[0] if headings else ''

        # Embedded images
        images = page.get_images(full=True)
        for img_index, img in enumerate(images):
            xref = img[0]
            try:
                pix = fitz.Pixmap(doc, xref)
                if pix.n - pix.alpha >= 4:  # CMYK → RGB
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                img_bytes = pix.tobytes('png')
                pix = None
            except Exception as e:
                print(f'  page {page_num+1} img {img_index}: extract fail ({e})')
                continue

            # Skip tiny icons (<50×50 → very likely a logo/bullet)
            try:
                # The pixmap is gone, so re-extract metadata from img tuple
                w, h = img[2], img[3]
            except Exception:
                w, h = 0, 0
            if w < 80 or h < 80:
                continue

            # Skip duplicates by content hash
            hsh = hashlib.sha256(img_bytes).hexdigest()
            if hsh in seen_hashes:
                continue
            seen_hashes.add(hsh)

            img_id += 1
            slug = slugify(page_title or f'page-{page_num+1}', f'item-{img_id}')
            folder = os.path.join(OUT, f'page-{page_num+1:03d}', 'original')
            os.makedirs(folder, exist_ok=True)
            fname = f'pdf-p{page_num+1:03d}-i{img_index+1:02d}-{slug}.png'
            dest = os.path.join(folder, fname)
            with open(dest, 'wb') as f:
                f.write(img_bytes)

            entries.append({
                'page':       page_num + 1,
                'index':      img_index + 1,
                'width':      w,
                'height':     h,
                'sha256':     hsh,
                'slug_hint':  slug,
                'page_title': page_title,
                'page_text':  text,
                'local':      f'/catalog/elkayam/pdf-extracted/page-{page_num+1:03d}/original/{fname}',
            })

    manifest_path = os.path.join(OUT, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump({
            'source_pdf':         PDF,
            'page_count':         doc.page_count,
            'extracted_images':   len(entries),
            'unique_hash_count':  len(seen_hashes),
            'entries':            entries,
        }, f, ensure_ascii=False, indent=2)

    print(f'\n✓ Extracted {len(entries)} unique product images from {doc.page_count} pages.')
    print(f'  Manifest: {manifest_path}')


if __name__ == '__main__':
    main()
