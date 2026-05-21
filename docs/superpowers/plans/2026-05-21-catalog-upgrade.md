# Catalog Assets, Product Import & Visual Catalog Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete 4-phase catalog upgrade: fresh image pipeline, supplier product import as INACTIVE, `/catalog` UI upgrade with images + click-to-edit, and new `/catalog-showcase` visual catalog page.

**Architecture:** Phase A scrapes Elkayam website + Asclean supplier catalog, downloads + crops images into a structured `public/catalog/` asset library with English slugs and per-source/category folder hierarchy, then upserts `metadata.images` into Supabase. Phase B imports supplier products as INACTIVE catalog items. Phase C upgrades the existing `/catalog` card UI (images, source badges, click-to-edit). Phase D adds a new `/catalog-showcase` visual page with hero, category grid, product grid, and product detail modal — all using `useCatalogContext()` and the new image paths.

**Tech Stack:** Python 3 + Pillow (scraping + crop), TypeScript + tsx + @supabase/supabase-js (DB scripts), Next.js App Router, Tailwind CSS, Supabase Postgres (catalog_items table, metadata JSONB).

**Env vars required:** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (both in `.env.local`).

---

## Asset Folder Convention (enforced throughout all tasks)

```
public/catalog/
  elkayam/
    road-marking/
      original/   ← raw downloaded file, kept forever
      thumbs/     ← 400×400 webp, for cards
      processed/  ← 800×800 webp, for detail modal
    signage/
    traffic-arrangements/
    barriers/
    safety-accessories/
  supplier/
    asclean/
      speed-bumps/
        original/
        thumbs/
        processed/
      convex-mirrors/
      parking-stops/
      flexible-posts/
      road-studs/
      barriers/
      cones/
      signage/
      anti-slip/
      cable-covers/
      solar-blinkers/
      other-safety-equipment/
  safety/          ← DEPRECATED — frozen, do not write new files here
```

**Filename convention:** `<item-id>-<english-slug>.<ext>` — e.g. `sa-001-traffic-cone-thumb.webp`, `ext-asc-speed-bump-001-rubber-bump-50cm-thumb.webp`. Always lowercase, hyphen-separated, no Hebrew, no spaces.

**Manifest:** `public/catalog/manifest.json` — one entry per image file, tracks source, status, and DB linkage.

---

## Task 1 — Directory Structure + Manifest Schema

**Files:**
- Create: `public/catalog/elkayam/road-marking/.gitkeep` (and all sibling dirs)
- Create: `public/catalog/supplier/asclean/speed-bumps/.gitkeep` (and siblings)
- Create: `public/catalog/manifest.json`
- Create: `scripts/catalog-utils.py` — shared helpers

- [ ] **Step 1: Create all asset directories**

```bash
cd /Users/eliozedri/Desktop/eliozelk

# Elkayam dirs
mkdir -p public/catalog/elkayam/road-marking/original
mkdir -p public/catalog/elkayam/road-marking/thumbs
mkdir -p public/catalog/elkayam/road-marking/processed
mkdir -p public/catalog/elkayam/signage/original
mkdir -p public/catalog/elkayam/signage/thumbs
mkdir -p public/catalog/elkayam/signage/processed
mkdir -p public/catalog/elkayam/traffic-arrangements/original
mkdir -p public/catalog/elkayam/traffic-arrangements/thumbs
mkdir -p public/catalog/elkayam/traffic-arrangements/processed
mkdir -p public/catalog/elkayam/barriers/original
mkdir -p public/catalog/elkayam/barriers/thumbs
mkdir -p public/catalog/elkayam/barriers/processed
mkdir -p public/catalog/elkayam/safety-accessories/original
mkdir -p public/catalog/elkayam/safety-accessories/thumbs
mkdir -p public/catalog/elkayam/safety-accessories/processed

# Asclean dirs
for cat in speed-bumps convex-mirrors parking-stops flexible-posts road-studs barriers cones signage anti-slip cable-covers solar-blinkers other-safety-equipment; do
  mkdir -p public/catalog/supplier/asclean/$cat/original
  mkdir -p public/catalog/supplier/asclean/$cat/thumbs
  mkdir -p public/catalog/supplier/asclean/$cat/processed
done
```

- [ ] **Step 2: Create manifest.json**

```bash
cat > public/catalog/manifest.json << 'EOF'
{
  "_schema": "1.0",
  "_note": "One entry per downloaded image. Updated by scrape + crop scripts.",
  "entries": []
}
EOF
```

- [ ] **Step 3: Create shared Python utilities**

Create `scripts/catalog-utils.py`:

```python
"""Shared utilities for catalog scraping and image processing scripts."""
import json
import os
import re
import unicodedata
from datetime import datetime, timezone

MANIFEST_PATH = os.path.join(os.path.dirname(__file__), '..', 'public', 'catalog', 'manifest.json')

def load_manifest():
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_manifest(manifest):
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

def add_manifest_entry(manifest, entry):
    """Add or update an entry keyed by item_id + file_type."""
    key = f"{entry['item_id']}_{entry['file_type']}"
    for i, e in enumerate(manifest['entries']):
        if f"{e['item_id']}_{e['file_type']}" == key:
            manifest['entries'][i] = entry
            return
    manifest['entries'].append(entry)

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def slugify(text):
    """Convert Hebrew or mixed text to a lowercase ASCII slug."""
    # Transliteration table for common Hebrew characters
    HE_MAP = {
        'א':'a','ב':'b','ג':'g','ד':'d','ה':'h','ו':'v','ז':'z','ח':'kh','ט':'t',
        'י':'y','כ':'k','ך':'k','ל':'l','מ':'m','ם':'m','נ':'n','ן':'n','ס':'s',
        'ע':'a','פ':'p','ף':'p','צ':'ts','ץ':'ts','ק':'k','ר':'r','ש':'sh','ת':'t',
    }
    result = ''
    for ch in text:
        if ch in HE_MAP:
            result += HE_MAP[ch]
        else:
            result += ch
    # Normalize, remove non-ASCII, lowercase, replace spaces/special with hyphen
    result = unicodedata.normalize('NFKD', result)
    result = re.sub(r'[^\w\s-]', '', result.lower())
    result = re.sub(r'[\s_]+', '-', result.strip())
    result = re.sub(r'-+', '-', result)
    return result[:60]
```

- [ ] **Step 4: Commit**

```bash
git add public/catalog/ scripts/catalog-utils.py
git commit -m "feat(catalog): create asset directory structure and manifest schema"
```

---

## Task 2 — Elkayam Website Image Scraper

**Files:**
- Create: `scripts/scrape-elkayam.py`

- [ ] **Step 1: Write the Elkayam scraper**

Create `scripts/scrape-elkayam.py`:

```python
#!/usr/bin/env python3
"""
Scrape Elkayam website (elkayam.co.il) for product images.
Saves originals to public/catalog/elkayam/<category>/original/
Updates public/catalog/manifest.json
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from html.parser import HTMLParser
sys.path.insert(0, os.path.dirname(__file__))
from catalog_utils import load_manifest, save_manifest, add_manifest_entry, now_iso, slugify

BASE_URL = "https://elkayam.co.il"
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')
CATALOG_DIR = os.path.join(PUBLIC_DIR, 'catalog', 'elkayam')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
}

# Category slug → folder name mapping
CATEGORY_FOLDERS = {
    'road-marking':          'road-marking',
    'signage':               'signage',
    'traffic-arrangements':  'traffic-arrangements',
    'barriers':              'barriers',
    'safety-accessories':    'safety-accessories',
}

# Known Elkayam product pages to check for images
PRODUCT_PAGES = [
    f"{BASE_URL}/",
    f"{BASE_URL}/about/",
    f"{BASE_URL}/products/",
    f"{BASE_URL}/services/",
]


class ImageLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'img':
            src = attrs.get('src', '') or attrs.get('data-src', '')
            alt = attrs.get('alt', '')
            if src and not src.startswith('data:'):
                self.images.append({'src': src, 'alt': alt})
        elif tag == 'a':
            href = attrs.get('href', '')
            if href:
                self.links.append(href)


def fetch_html(url, retries=2):
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                content_type = resp.headers.get('Content-Type', '')
                if 'text/html' not in content_type and 'text/' not in content_type:
                    print(f"  [skip] non-HTML: {content_type} — {url}")
                    return None
                return resp.read().decode('utf-8', errors='replace')
        except Exception as e:
            if attempt == retries:
                print(f"  [fail] {url}: {e}")
                return None
            time.sleep(1)


def download_image(url, dest_path):
    if os.path.exists(dest_path):
        print(f"  [skip] exists: {dest_path}")
        return True
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            content_type = resp.headers.get('Content-Type', '')
            if 'image' not in content_type and 'webp' not in content_type:
                return False
            data = resp.read()
            if len(data) < 1000:  # skip tiny images/icons
                return False
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'wb') as f:
                f.write(data)
            print(f"  [ok] {dest_path}")
            return True
    except Exception as e:
        print(f"  [fail] {url}: {e}")
        return False


def abs_url(base, href):
    if not href:
        return None
    if href.startswith('http'):
        return href
    if href.startswith('//'):
        return 'https:' + href
    if href.startswith('/'):
        return BASE_URL + href
    return None


def is_product_image(src, alt):
    """Rough filter: skip logos, icons, backgrounds."""
    skip_patterns = ['logo', 'icon', 'favicon', 'bg-', 'background', 'arrow', 'button',
                     'banner', 'header', 'footer', 'menu', 'nav', 'social', 'whatsapp']
    src_lower = src.lower()
    return not any(p in src_lower for p in skip_patterns) and (
        src_lower.endswith(('.jpg', '.jpeg', '.png', '.webp')) or
        'upload' in src_lower or 'product' in src_lower or 'catalog' in src_lower
    )


def guess_category(alt, src):
    src_low = (alt + ' ' + src).lower()
    if any(k in src_low for k in ['tamrur', 'sign', 'shilut', 'שלט', 'תמרור']):
        return 'signage'
    if any(k in src_low for k in ['barrier', 'maake', 'maakeh', 'מעקה', 'מחסום']):
        return 'barriers'
    if any(k in src_low for k in ['cone', 'konos', 'קונוס', 'safety', 'bitahon', 'בטיחות']):
        return 'safety-accessories'
    if any(k in src_low for k in ['traffic', 'hasdara', 'הסדר', 'arrow', 'hets', 'חץ']):
        return 'traffic-arrangements'
    return 'road-marking'  # default


def main():
    manifest = load_manifest()
    found = 0
    visited = set()

    pages_to_visit = list(PRODUCT_PAGES)

    # Also try to find more pages from the homepage
    home_html = fetch_html(BASE_URL + '/')
    if home_html:
        parser = ImageLinkParser()
        parser.feed(home_html)
        for href in parser.links:
            abs = abs_url(BASE_URL, href)
            if abs and BASE_URL in abs and abs not in visited:
                if any(k in abs for k in ['/product', '/service', '/catalog', '/about', '/gallery']):
                    pages_to_visit.append(abs)

    for page_url in pages_to_visit[:20]:  # cap at 20 pages
        if page_url in visited:
            continue
        visited.add(page_url)
        print(f"\n[page] {page_url}")
        html = fetch_html(page_url)
        if not html:
            continue

        parser = ImageLinkParser()
        parser.feed(html)

        for img in parser.images:
            src = img['src']
            alt = img['alt']
            abs_src = abs_url(page_url, src)
            if not abs_src:
                continue
            if not is_product_image(src, alt):
                continue

            category = guess_category(alt, src)
            alt_slug = slugify(alt) if alt else 'product'
            filename = f"elkayam-{alt_slug}-source.jpg"
            dest = os.path.join(CATALOG_DIR, category, 'original', filename)

            ok = download_image(abs_src, dest)
            if ok:
                found += 1
                rel_path = '/catalog/elkayam/' + category + '/original/' + filename
                entry = {
                    'item_id': f'elkayam-{alt_slug}',
                    'file_type': 'original',
                    'source': 'elkayam_website',
                    'category': category,
                    'source_url': abs_src,
                    'source_page': page_url,
                    'local_path': rel_path,
                    'crop_status': 'pending',
                    'review_state': 'ok',
                    'imported_at': now_iso(),
                }
                add_manifest_entry(manifest, entry)

        time.sleep(0.5)

    save_manifest(manifest)
    print(f"\n✓ Elkayam scrape done. {found} images downloaded.")
    print(f"  Visited {len(visited)} pages.")


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run the Elkayam scraper**

```bash
cd /Users/eliozedri/Desktop/eliozelk
python3 scripts/scrape-elkayam.py
```

Expected: Downloads images to `public/catalog/elkayam/*/original/`. May download 0–30+ images depending on site structure. Missing or failed images are noted in output, not fatal.

- [ ] **Step 3: Commit**

```bash
git add scripts/scrape-elkayam.py public/catalog/manifest.json
git add public/catalog/elkayam/ 2>/dev/null || true
git commit -m "feat(catalog/phase-a): elkayam website image scraper + initial downloads"
```

---

## Task 3 — Asclean Supplier Catalog Scraper

**Files:**
- Create: `scripts/scrape-asclean.py`
- Create: `public/catalog/supplier/asclean/scraped-products.json` (output)

- [ ] **Step 1: Write the Asclean scraper**

Create `scripts/scrape-asclean.py`:

```python
#!/usr/bin/env python3
"""
Scrape Asclean supplier catalog (asclean.co.il/catalog-safety-equipment/).
Extracts product names, images, and descriptions.
Saves originals to public/catalog/supplier/asclean/<category>/original/
Writes scraped-products.json for Phase B import.
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from html.parser import HTMLParser
sys.path.insert(0, os.path.dirname(__file__))
from catalog_utils import load_manifest, save_manifest, add_manifest_entry, now_iso, slugify

BASE_URL = "https://www.asclean.co.il"
CATALOG_URL = f"{BASE_URL}/catalog-safety-equipment/"
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')
ASCLEAN_DIR = os.path.join(PUBLIC_DIR, 'catalog', 'supplier', 'asclean')
OUTPUT_JSON = os.path.join(ASCLEAN_DIR, 'scraped-products.json')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    'Referer': BASE_URL,
}

# Known category slugs (Hebrew → English folder name)
CATEGORY_MAP = {
    'פסי-האטה': 'speed-bumps',
    'מראות-פנורמיות': 'convex-mirrors',
    'מעצורי-חניה': 'parking-stops',
    'עמודים-גמישים': 'flexible-posts',
    'עמודי-חסימה': 'barriers',
    'קונוסים': 'cones',
    'מפרידי-נתיבים': 'flexible-posts',
    'נצנץ-סולארי': 'solar-blinkers',
    'מניעת-החלקה': 'anti-slip',
    'מעברי-כבל': 'cable-covers',
    'שילוט-ותמרור': 'signage',
    'מחסומים-ניידים': 'barriers',
    'הגנות-ומיגונים': 'other-safety-equipment',
    'נגישות-לעיוורים': 'other-safety-equipment',
}

# Our catalog category mapping for Phase B
CATALOG_CATEGORY_MAP = {
    'speed-bumps':           'אביזרי כבישים',
    'convex-mirrors':        'אביזרי חנייה',
    'parking-stops':         'אביזרי חנייה',
    'flexible-posts':        'אביזרי בטיחות — מפרדים ועמודים גמישים',
    'barriers':              'מעקות ומחסומים',
    'cones':                 'אביזרי בטיחות — קונוסים ואביזריהם',
    'solar-blinkers':        'אביזרי כבישים',
    'anti-slip':             'אביזרי כבישים',
    'cable-covers':          'גובים ותעלות',
    'signage':               'שלטים ושילוט',
    'other-safety-equipment': 'אביזרי בטיחות — כללי',
}


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.images = []
        self.texts = []
        self._in_body = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            href = attrs.get('href', '')
            text = ''
            self.links.append({'href': href, 'text': text})
        elif tag == 'img':
            src = attrs.get('src', '') or attrs.get('data-src', '') or attrs.get('data-lazy-src', '')
            alt = attrs.get('alt', '')
            if src:
                self.images.append({'src': src, 'alt': alt})

    def handle_data(self, data):
        d = data.strip()
        if d:
            self.texts.append(d)


def fetch_html(url, retries=2):
    encoded = urllib.parse.quote(url, safe=':/?=&%#@!$\'()*+,;')
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(encoded, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as resp:
                ct = resp.headers.get('Content-Type', '')
                if 'text/html' not in ct and 'text/' not in ct:
                    return None
                charset = 'utf-8'
                if 'charset=' in ct:
                    charset = ct.split('charset=')[-1].strip()
                return resp.read().decode(charset, errors='replace')
        except Exception as e:
            if attempt == retries:
                print(f"  [fail] {url}: {e}")
                return None
            time.sleep(1)


def download_image(url, dest_path):
    if os.path.exists(dest_path):
        return True
    try:
        encoded = urllib.parse.quote(url, safe=':/?=&%#@!$\'()*+,;')
        req = urllib.request.Request(encoded, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20) as resp:
            ct = resp.headers.get('Content-Type', '')
            if 'image' not in ct and 'webp' not in ct:
                return False
            data = resp.read()
            if len(data) < 500:
                return False
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, 'wb') as f:
                f.write(data)
            return True
    except Exception as e:
        print(f"  [img fail] {url}: {e}")
        return False


def abs_url(base, href):
    if not href:
        return None
    if href.startswith('http'):
        return href
    if href.startswith('//'):
        return 'https:' + href
    if href.startswith('/'):
        return BASE_URL + href
    return None


def main():
    manifest = load_manifest()
    all_products = []

    # Step 1: Get main catalog page and find category links
    print(f"[main] Fetching {CATALOG_URL}")
    html = fetch_html(CATALOG_URL)
    if not html:
        print("[warn] Could not fetch main catalog page — trying known categories directly")
        category_urls = {
            slug: f"{CATALOG_URL}{slug}/"
            for slug in CATEGORY_MAP
        }
    else:
        # Extract category links
        parser = LinkParser()
        parser.feed(html)
        category_urls = {}
        for link in parser.links:
            href = link['href']
            abs = abs_url(CATALOG_URL, href)
            if abs and 'catalog-safety-equipment' in abs:
                # Extract slug from URL
                slug_match = re.search(r'catalog-safety-equipment/([^/]+)/?', abs)
                if slug_match:
                    cat_slug = slug_match.group(1)
                    folder = CATEGORY_MAP.get(cat_slug, 'other-safety-equipment')
                    category_urls[cat_slug] = abs
        print(f"  Found {len(category_urls)} category links")

    # Step 2: Visit each category page
    for cat_slug, cat_url in list(category_urls.items())[:30]:
        folder = CATEGORY_MAP.get(cat_slug, 'other-safety-equipment')
        catalog_cat = CATALOG_CATEGORY_MAP.get(folder, 'אביזרי בטיחות — כללי')
        print(f"\n[cat] {cat_slug} → {folder}")

        html = fetch_html(cat_url)
        if not html:
            print(f"  [blocked] {cat_url}")
            all_products.append({
                'id': f"ext-asc-{folder}-placeholder",
                'name_he': cat_slug.replace('-', ' '),
                'category_folder': folder,
                'catalog_category': catalog_cat,
                'source_url': cat_url,
                'image_url_remote': None,
                'local_original': None,
                'local_thumb': None,
                'local_processed': None,
                'description': '',
                'scrape_status': 'blocked',
                'imported_at': now_iso(),
            })
            continue

        parser = LinkParser()
        parser.feed(html)

        # Extract product images from page
        product_imgs = []
        for img in parser.images:
            src = img['src']
            alt = img['alt']
            abs_src = abs_url(cat_url, src)
            if not abs_src:
                continue
            skip = ['logo', 'icon', 'favicon', 'banner', 'header', 'footer', 'nav',
                    'arrow', 'bg', 'social', 'whatsapp', 'phone']
            if any(s in src.lower() for s in skip):
                continue
            if src.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')):
                product_imgs.append({'src': abs_src, 'alt': alt})

        # Create a product entry per image found
        for idx, img_info in enumerate(product_imgs[:10], 1):
            name_he = img_info['alt'] or cat_slug.replace('-', ' ')
            slug = slugify(name_he) or f"{folder}-{idx:03d}"
            item_id = f"ext-asc-{folder}-{idx:03d}"
            filename_orig = f"{item_id}-{slug}-source.jpg"
            dest_original = os.path.join(ASCLEAN_DIR, folder, 'original', filename_orig)

            ok = download_image(img_info['src'], dest_original)
            local_orig = f'/catalog/supplier/asclean/{folder}/original/{filename_orig}' if ok else None

            entry = {
                'item_id': item_id,
                'name_he': name_he,
                'category_folder': folder,
                'catalog_category': catalog_cat,
                'source_url': cat_url,
                'image_url_remote': img_info['src'],
                'local_original': local_orig,
                'local_thumb': None,    # filled by crop script
                'local_processed': None,
                'description': '',
                'scrape_status': 'ok' if ok else 'image_download_failed',
                'crop_status': 'pending' if ok else 'download_failed',
                'review_state': 'needs_review',
                'imported_at': now_iso(),
            }
            all_products.append(entry)

            if ok:
                manifest_entry = {
                    'item_id': item_id,
                    'file_type': 'original',
                    'source': 'external_supplier_reference',
                    'category': folder,
                    'source_url': img_info['src'],
                    'source_page': cat_url,
                    'local_path': local_orig,
                    'crop_status': 'pending',
                    'review_state': 'needs_review',
                    'imported_at': now_iso(),
                }
                add_manifest_entry(manifest, manifest_entry)

        if not product_imgs:
            # Create placeholder entry so Phase B still imports the category
            all_products.append({
                'item_id': f"ext-asc-{folder}-001",
                'name_he': cat_slug.replace('-', ' '),
                'category_folder': folder,
                'catalog_category': catalog_cat,
                'source_url': cat_url,
                'image_url_remote': None,
                'local_original': None,
                'local_thumb': None,
                'local_processed': None,
                'description': '',
                'scrape_status': 'no_images_found',
                'crop_status': 'download_failed',
                'review_state': 'needs_review',
                'imported_at': now_iso(),
            })

        time.sleep(0.8)

    # Save scraped products JSON
    os.makedirs(ASCLEAN_DIR, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump({'products': all_products}, f, ensure_ascii=False, indent=2)

    save_manifest(manifest)
    print(f"\n✓ Asclean scrape done. {len(all_products)} products logged.")
    print(f"  Output: {OUTPUT_JSON}")


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run the scraper**

```bash
cd /Users/eliozedri/Desktop/eliozelk
python3 scripts/scrape-asclean.py
```

Expected output: prints each category visited, image downloads, and final count. Blocked pages are noted with `[blocked]` and get placeholder entries in the JSON so Phase B can still import category-level products.

- [ ] **Step 3: Inspect output**

```bash
cat public/catalog/supplier/asclean/scraped-products.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
total=len(d['products'])
ok=sum(1 for p in d['products'] if p.get('scrape_status')=='ok')
blocked=sum(1 for p in d['products'] if p.get('scrape_status')=='blocked')
print(f'Total: {total}, OK: {ok}, Blocked/no-images: {blocked}')
"
ls public/catalog/supplier/asclean/*/original/ 2>/dev/null | head -20
```

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape-asclean.py public/catalog/supplier/ public/catalog/manifest.json
git commit -m "feat(catalog/phase-a): asclean supplier catalog scraper + product JSON"
```

---

## Task 4 — Image Crop Pipeline

**Files:**
- Create: `scripts/crop-catalog-images.py`

- [ ] **Step 1: Write the crop script**

Create `scripts/crop-catalog-images.py`:

```python
#!/usr/bin/env python3
"""
Crop and convert catalog images to thumb (400x400) and processed (800x800) webp.
Reads all original/ images, generates thumbs/ and processed/ siblings.
Uses Pillow. Updates manifest with crop_status.

Smart crop: detects and removes solid-color margins, then pads and resizes.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
from catalog_utils import load_manifest, save_manifest, now_iso

try:
    from PIL import Image, ImageOps
except ImportError:
    print("ERROR: Pillow not installed. Run: pip3 install Pillow")
    sys.exit(1)

PUBLIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')
CATALOG_DIR = os.path.join(PUBLIC_DIR, 'catalog')

THUMB_SIZE = (400, 400)
FULL_SIZE  = (800, 800)

SKIP_DIRS = {'safety'}  # deprecated dir


def is_solid_color(row_or_col, tolerance=15):
    """Check if a row/column of pixels is a near-solid color (background)."""
    if not row_or_col:
        return True
    r0, g0, b0 = row_or_col[0][:3]
    return all(
        abs(r - r0) <= tolerance and abs(g - g0) <= tolerance and abs(b - b0) <= tolerance
        for r, g, b, *_ in row_or_col
    )


def smart_crop(img):
    """
    Detect and remove solid-color (white/gray) margins.
    Returns cropped image. Falls back to original if crop is too aggressive.
    """
    rgb = img.convert('RGB')
    w, h = rgb.size
    pixels = rgb.load()

    # Sample border pixels to detect background color
    top_row    = [pixels[x, 0]   for x in range(w)]
    bottom_row = [pixels[x, h-1] for x in range(w)]
    left_col   = [pixels[0, y]   for y in range(h)]
    right_col  = [pixels[w-1, y] for y in range(h)]

    # Only apply smart crop if borders look solid
    if not (is_solid_color(top_row) and is_solid_color(bottom_row)):
        return img, 'conservative'

    # Find content bounding box
    # Top
    top = 0
    for y in range(h):
        row = [pixels[x, y] for x in range(w)]
        if not is_solid_color(row):
            top = y
            break

    # Bottom
    bottom = h - 1
    for y in range(h - 1, -1, -1):
        row = [pixels[x, y] for x in range(w)]
        if not is_solid_color(row):
            bottom = y
            break

    # Left
    left = 0
    for x in range(w):
        col = [pixels[x, y] for y in range(h)]
        if not is_solid_color(col):
            left = x
            break

    # Right
    right = w - 1
    for x in range(w - 1, -1, -1):
        col = [pixels[x, y] for y in range(h)]
        if not is_solid_color(col):
            right = x
            break

    content_w = right - left
    content_h = bottom - top

    # Sanity: content must be at least 20% of image
    if content_w < w * 0.1 or content_h < h * 0.1:
        return img, 'needs_review'

    # Add 5% padding
    pad_x = max(5, int(content_w * 0.05))
    pad_y = max(5, int(content_h * 0.05))
    crop_box = (
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(w, right + pad_x),
        min(h, bottom + pad_y),
    )

    cropped = img.crop(crop_box)
    crop_area_ratio = (content_w * content_h) / (w * h)
    status = 'ok' if crop_area_ratio > 0.15 else 'needs_review'
    return cropped, status


def make_square(img, target_size, bg=(255, 255, 255)):
    """Resize image to fit inside target_size, pad to square with bg color."""
    img = img.convert('RGBA')
    img.thumbnail(target_size, Image.LANCZOS)
    square = Image.new('RGBA', target_size, bg + (255,))
    offset = ((target_size[0] - img.width) // 2, (target_size[1] - img.height) // 2)
    square.paste(img, offset, img)
    return square.convert('RGB')


def process_image(original_path, thumb_path, processed_path):
    """Process one image: smart crop, then generate thumb and processed."""
    try:
        with Image.open(original_path) as img:
            cropped, crop_status = smart_crop(img)

            # Generate thumbnail
            os.makedirs(os.path.dirname(thumb_path), exist_ok=True)
            thumb = make_square(cropped, THUMB_SIZE)
            thumb.save(thumb_path, 'WEBP', quality=85, method=6)

            # Generate processed (full display)
            os.makedirs(os.path.dirname(processed_path), exist_ok=True)
            full = make_square(cropped, FULL_SIZE)
            full.save(processed_path, 'WEBP', quality=88, method=6)

            return crop_status

    except Exception as e:
        print(f"  [error] {original_path}: {e}")
        return 'error'


def find_originals(catalog_dir):
    """Walk catalog dir, find all original/ files to process."""
    results = []
    for root, dirs, files in os.walk(catalog_dir):
        # Skip deprecated safety dir
        parts = root.replace(catalog_dir, '').split(os.sep)
        if any(p in SKIP_DIRS for p in parts):
            continue
        if os.path.basename(root) == 'original':
            parent = os.path.dirname(root)
            for fname in files:
                if fname.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')):
                    orig_path = os.path.join(root, fname)
                    stem = os.path.splitext(fname)[0]
                    # Replace -source suffix with -thumb / (nothing) for processed
                    clean_stem = stem.replace('-source', '')
                    thumb_fname = clean_stem + '-thumb.webp'
                    proc_fname  = clean_stem + '.webp'
                    thumb_path = os.path.join(parent, 'thumbs', thumb_fname)
                    proc_path  = os.path.join(parent, 'processed', proc_fname)
                    results.append((orig_path, thumb_path, proc_path))
    return results


def main():
    manifest = load_manifest()
    entries_by_path = {e.get('local_path', ''): e for e in manifest['entries']}

    originals = find_originals(CATALOG_DIR)
    print(f"Found {len(originals)} original images to process.")

    ok_count = 0
    review_count = 0
    error_count = 0

    for orig_path, thumb_path, proc_path in originals:
        rel_orig = orig_path.replace(os.path.join(os.path.dirname(__file__), '..', 'public'), '')
        rel_thumb = thumb_path.replace(os.path.join(os.path.dirname(__file__), '..', 'public'), '')
        rel_proc  = proc_path.replace(os.path.join(os.path.dirname(__file__), '..', 'public'), '')

        print(f"  crop: {rel_orig}")
        status = process_image(orig_path, thumb_path, proc_path)

        if status == 'ok':
            ok_count += 1
        elif status == 'needs_review':
            review_count += 1
        else:
            error_count += 1

        print(f"    → {status}")

        # Update manifest entry
        entry = entries_by_path.get(rel_orig)
        if entry:
            entry['crop_status'] = status
            entry['local_thumb'] = rel_thumb
            entry['local_processed'] = rel_proc
            entry['cropped_at'] = now_iso()

    save_manifest(manifest)
    print(f"\n✓ Crop done. OK: {ok_count}, Needs review: {review_count}, Errors: {error_count}")


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run the crop script**

```bash
cd /Users/eliozedri/Desktop/eliozelk
python3 scripts/crop-catalog-images.py
```

Expected: prints each image path and crop status. Generates `thumbs/` and `processed/` next to each `original/` dir.

- [ ] **Step 3: Verify output**

```bash
find public/catalog -name "*-thumb.webp" | head -10
find public/catalog -name "*.webp" | wc -l
python3 -c "
import json
m = json.load(open('public/catalog/manifest.json'))
statuses = [e.get('crop_status') for e in m['entries']]
from collections import Counter
print(Counter(statuses))
"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/crop-catalog-images.py public/catalog/manifest.json
git add public/catalog/elkayam/ public/catalog/supplier/ 2>/dev/null || true
git commit -m "feat(catalog/phase-a): image crop pipeline — thumb + processed webp generation"
```

---

## Task 5 — DB Image Metadata Attachment

**Files:**
- Create: `scripts/attach-catalog-images.ts`

- [ ] **Step 1: Write the DB attachment script**

Create `scripts/attach-catalog-images.ts`:

```typescript
/**
 * Phase A — Attach new image metadata to catalog_items in Supabase.
 * Reads public/catalog/manifest.json and the asclean scraped-products.json.
 * For Elkayam items: matches by known IDs from safetyAccessoryImages.ts pattern.
 * For all items with images: upserts metadata.images.thumb/full/original_url/crop_status.
 * Also marks legacy images.product references as image_needs_replacement.
 *
 * Run: npx tsx scripts/attach-catalog-images.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'catalog', 'manifest.json');
const ASCLEAN_PATH  = path.join(__dirname, '..', 'public', 'catalog', 'supplier', 'asclean', 'scraped-products.json');

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
  const grouped: Record<string, Partial<ManifestEntry>> = {};
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
    // Only attach if we have at least a thumb
    if (!info.local_thumb) continue;

    // Try to find the catalog item by id (exact match for Elkayam IDs like sa-001)
    const { data: existing } = await supabase
      .from('catalog_items')
      .select('id, metadata')
      .eq('id', itemId)
      .maybeSingle();

    if (!existing) {
      // Not an exact ID match — this image may not have a DB item yet (supplier items come in Phase B)
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
```

- [ ] **Step 2: Run the script**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsx scripts/attach-catalog-images.ts
```

Expected output:
```
=== Phase A: Attach catalog image metadata ===
[step] Marking legacy safety images for replacement...
  Marked N items as image_needs_replacement.
[step] Reading manifest...
  Found N unique items in manifest.
  [ok] sa-001 → /catalog/elkayam/...
  ...
✓ Done.
```

- [ ] **Step 3: Verify in Supabase**

```bash
npx tsx -e "
import {createClient} from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({path:'.env.local'});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('catalog_items').select('id,metadata').not('metadata->images->thumb','is',null).then(({data})=>{
  console.log('Items with thumb:', data?.length ?? 0);
  if(data?.[0]) console.log('Sample:', JSON.stringify(data[0].metadata?.images, null, 2));
});
"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/attach-catalog-images.ts
git commit -m "feat(catalog/phase-a): DB image metadata attachment script"
```

---

## Task 6 — Supplier Product Import (Phase B)

**Files:**
- Create: `scripts/import-supplier-catalog.ts`
- Create: `supabase/migrations/20260521100000_supplier_catalog_import.sql`

- [ ] **Step 1: Write the import script**

Create `scripts/import-supplier-catalog.ts`:

```typescript
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
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

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
    console.error('scraped-products.json not found — run scrape-asclean.py first.');
    process.exit(1);
  }

  const scraped: { products: ScrapedProduct[] } = JSON.parse(
    fs.readFileSync(ASCLEAN_PATH, 'utf-8')
  );

  // Load all existing active Elkayam items for dedup check
  const { data: existingItems } = await supabase
    .from('catalog_items')
    .select('id, name, is_active')
    .eq('is_active', true);

  const activeNames = new Set((existingItems ?? []).map(i => normalize(i.name)));
  console.log(`Loaded ${activeNames.size} active Elkayam items for dedup check.`);

  // Deduplicate scraped products by item_id (keep first of duplicates)
  const seen = new Set<string>();
  const unique = scraped.products.filter(p => {
    if (seen.has(p.item_id)) return false;
    seen.add(p.item_id);
    return true;
  });

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of unique) {
    const nameNorm = normalize(product.name_he);

    // Dedup: skip if active Elkayam item already covers this
    if (activeNames.has(nameNorm)) {
      console.log(`  [skip] "${product.name_he}" — already active in Elkayam catalog`);
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
      id:               product.item_id,
      name:             product.name_he,
      type:             'product' as const,
      category:         product.catalog_category,
      unit_of_measure:  'יחידה',
      default_price:    null,
      cost_price:       null,
      description:      product.description || `מוצר ייחוס מספק חיצוני — ${product.catalog_category}`,
      is_active:        false,   // HARD RULE — never true for supplier imports
      current_quantity: 0,
      minimum_quantity: 0,
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
```

- [ ] **Step 2: Run the import**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsx scripts/import-supplier-catalog.ts
```

Expected: prints each product action. All supplier items land in DB as `is_active=false`.

- [ ] **Step 3: Verify in Supabase**

```bash
npx tsx -e "
import {createClient} from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({path:'.env.local'});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('catalog_items').select('id,name,is_active,metadata').like('id','ext-asc-%').then(({data,error})=>{
  console.log('Supplier items in DB:', data?.length ?? 0);
  const active = data?.filter(d=>d.is_active).length ?? 0;
  console.log('Active (must be 0):', active);
  if(data?.[0]) console.log('Sample:', data[0].id, data[0].name, data[0].is_active);
});
"
```

**This check must pass:** `Active (must be 0): 0`

- [ ] **Step 4: Write SQL migration (idempotent backup)**

Create `supabase/migrations/20260521100000_supplier_catalog_import.sql`:

```sql
-- Phase B: Mark all ext-asc-* items as inactive if somehow activated.
-- Safety net — idempotent, safe to re-run.
-- All external_supplier_reference items MUST remain is_active = false.

UPDATE catalog_items
SET
  is_active  = false,
  updated_at = now()
WHERE
  id LIKE 'ext-asc-%'
  AND is_active = true;

-- Add index for fast supplier-only queries
CREATE INDEX IF NOT EXISTS idx_catalog_items_source_type
  ON catalog_items ((metadata->>'sources'));

-- Verify: this count must be 0 after migration
DO $$
DECLARE cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM catalog_items
  WHERE id LIKE 'ext-asc-%' AND is_active = true;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'CONSTRAINT VIOLATION: % supplier items are marked active', cnt;
  END IF;
END $$;
```

- [ ] **Step 5: Commit**

```bash
git add scripts/import-supplier-catalog.ts supabase/migrations/20260521100000_supplier_catalog_import.sql
git commit -m "feat(catalog/phase-b): supplier catalog import — INACTIVE items with image metadata"
```

---

## Task 7 — Shared Badge + Category Utilities

**Files:**
- Create: `src/components/CatalogShowcase/constants.ts`

This file is shared between Phase C (ItemCard badges) and Phase D (Showcase components).

- [ ] **Step 1: Create constants.ts**

Create `src/components/CatalogShowcase/constants.ts`:

```typescript
// Shared badge helpers and category config for /catalog and /catalog-showcase

export interface ShowcaseCategory {
  key: string;          // exact value of catalog_items.category
  label: string;        // display label (Hebrew)
  icon: string;         // emoji icon
  folder?: string;      // optional English folder slug
}

export const SHOWCASE_CATEGORIES: ShowcaseCategory[] = [
  { key: "אביזרי בטיחות — קונוסים ואביזריהם",        label: "קונוסים ואביזריהם",    icon: "🦺", folder: "cones" },
  { key: "אביזרי בטיחות — מפרדים ועמודים גמישים",   label: "עמודים גמישים",         icon: "🪧", folder: "flexible-posts" },
  { key: "אביזרי בטיחות — עמודי מחסום ועמודי חסימה", label: "עמודי מחסום",           icon: "🛑", folder: "barriers" },
  { key: "אביזרי כבישים",                             label: "אביזרי כבישים",          icon: "🚧", folder: "speed-bumps" },
  { key: "אביזרי חנייה",                              label: "אביזרי חנייה",           icon: "🛞", folder: "parking-stops" },
  { key: "מעקות ומחסומים",                            label: "מעקות ומחסומים",         icon: "🚧", folder: "barriers" },
  { key: "גדרות ותיחום",                              label: "גדרות ותיחום",           icon: "⛽", folder: "other-safety-equipment" },
  { key: "שלטים ושילוט",                              label: "שלטים ושילוט",           icon: "🚦", folder: "signage" },
  { key: "הסדרי תנועה",                               label: "הסדרי תנועה",            icon: "🚐", folder: "other-safety-equipment" },
  { key: "עבודות סימון וצביעה",                       label: "סימון וצביעה",           icon: "🖌️", folder: "road-marking" },
  { key: "הסרת סימון",                                label: "הסרת סימון",             icon: "💧", folder: "road-marking" },
  { key: "גובים ותעלות",                              label: "גובים ותעלות",           icon: "🔌", folder: "cable-covers" },
  { key: "אביזרי בטיחות — נגישות",                   label: "נגישות",                 icon: "♿", folder: "other-safety-equipment" },
  { key: "אביזרי בטיחות — כללי",                     label: "אביזרי בטיחות כלליים",  icon: "🛡️", folder: "other-safety-equipment" },
];

// Fallback icon per category key substring
export function getCategoryIcon(category: string): string {
  const found = SHOWCASE_CATEGORIES.find(c => c.key === category);
  if (found) return found.icon;
  if (category.includes("קונוס")) return "🦺";
  if (category.includes("עמוד")) return "🪧";
  if (category.includes("מחסום") || category.includes("מעקה")) return "🛑";
  if (category.includes("שלט") || category.includes("תמרור")) return "🚦";
  if (category.includes("חניה") || category.includes("חנייה")) return "🛞";
  if (category.includes("כביש") || category.includes("האטה")) return "🚧";
  if (category.includes("סימון")) return "🖌️";
  if (category.includes("גדר")) return "⛽";
  if (category.includes("תנועה")) return "🚐";
  return "🛡️";
}

// Source badge config
export type SourceType = "elkayam" | "external" | "manual" | "unknown";

export function getSourceType(metadata?: Record<string, unknown>): SourceType {
  const sources = metadata?.sources as Array<{ type: string }> | undefined;
  const type = sources?.[0]?.type ?? "";
  if (["website", "company_profile", "seed", "existing_catalog"].includes(type)) return "elkayam";
  if (type === "external_supplier_reference") return "external";
  if (type === "manual") return "manual";
  return "unknown";
}

export interface BadgeConfig {
  label: string;
  className: string;
}

export const SOURCE_BADGE: Record<SourceType, BadgeConfig | null> = {
  elkayam:  { label: "אלקיים",       className: "bg-blue-100 text-blue-700 border border-blue-200" },
  external: { label: "מקור חיצוני",  className: "bg-amber-100 text-amber-700 border border-amber-200" },
  manual:   { label: "ידני",          className: "bg-gray-100 text-gray-500 border border-gray-200" },
  unknown:  null,
};

export const STATUS_BADGE: Record<"active" | "inactive", BadgeConfig> = {
  active:   { label: "● פעיל",    className: "bg-green-100 text-green-700" },
  inactive: { label: "○ לא פעיל", className: "bg-gray-100 text-gray-500" },
};

export const REVIEW_BADGE: Record<string, BadgeConfig> = {
  needs_review:           { label: "דורש בדיקה",       className: "bg-red-100 text-red-600 border border-red-200" },
  missing_image:          { label: "חסרת תמונה",       className: "bg-orange-100 text-orange-600 border border-orange-200" },
  image_needs_replacement:{ label: "תמונה לעדכון",     className: "bg-orange-100 text-orange-600 border border-orange-200" },
};

// Image resolution: prefer new fields, fall back to legacy
export function resolveProductImage(metadata?: Record<string, unknown>): string | null {
  const images = metadata?.images as Record<string, unknown> | undefined;
  const thumb = images?.thumb as string | undefined;
  const full  = images?.full  as string | undefined;
  // Do NOT fall back to images.product (legacy deprecated path)
  return thumb ?? full ?? null;
}

export function resolveDetailImage(metadata?: Record<string, unknown>): string | null {
  const images = metadata?.images as Record<string, unknown> | undefined;
  const full  = images?.full  as string | undefined;
  const thumb = images?.thumb as string | undefined;
  return full ?? thumb ?? null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors from this new file.

- [ ] **Step 3: Commit**

```bash
git add src/components/CatalogShowcase/constants.ts
git commit -m "feat(catalog): shared badge + category + image utilities for catalog UI"
```

---

## Task 8 — Upgrade ItemCard in /catalog (Phase C)

**Files:**
- Modify: `src/components/Catalog/index.tsx` — `ItemCard` function (~line 249) and `CatalogItemDetailPanel` (~line 79)

- [ ] **Step 1: Read current ItemCard signature and imports**

The `ItemCard` function starts around line 249 in `src/components/Catalog/index.tsx`. Its current props are `{ item, onEdit, onToggle, onDelete }` and the card `div` has no `onClick`.

Add this import at the top of the file (after existing imports):

```typescript
import { getSourceType, SOURCE_BADGE, REVIEW_BADGE, resolveProductImage, getCategoryIcon } from "@/components/CatalogShowcase/constants";
```

- [ ] **Step 2: Replace the ItemCard function**

Find the existing `ItemCard` function (lines ~249–348) and replace with:

```typescript
function ItemCard({ item, onEdit, onToggle, onDelete }: {
  item: CatalogItem;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const specs = item.metadata?.specs as Record<string, unknown> | undefined;
  const isSolar = specs?.is_solar as boolean | undefined;
  const isElectric = specs?.is_electric as boolean | undefined;
  const isReflective = specs?.is_reflective as boolean | undefined;
  const specDimensions = specs?.dimensions as string | undefined;
  const safetyRefId = item.metadata?.safety_ref_id as string | undefined;

  const imgUrl = resolveProductImage(item.metadata);
  const sourceType = getSourceType(item.metadata);
  const sourceBadge = SOURCE_BADGE[sourceType];
  const reviewState = item.metadata?.review_state as string | undefined;
  const reviewBadge = reviewState ? REVIEW_BADGE[reviewState] : null;
  const categoryIcon = getCategoryIcon(item.category);

  function handleCardClick() {
    onEdit(item.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit(item.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={`bg-white border rounded-xl overflow-hidden flex flex-col hover:shadow-md hover:border-blue-300 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${
        !item.isActive ? "opacity-55 border-gray-100" : "border-gray-200"
      }`}
    >
      {/* ── Product image ── */}
      <div className="h-32 bg-gray-50 flex items-center justify-center border-b border-gray-100 relative overflow-hidden">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = "none";
              const parent = el.parentElement;
              if (parent) {
                const span = document.createElement("span");
                span.className = "text-4xl";
                span.textContent = categoryIcon;
                parent.appendChild(span);
              }
            }}
          />
        ) : (
          <span className="text-4xl">{categoryIcon}</span>
        )}
      </div>

      {/* ── Content ── */}
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        {/* Name + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.category || "ללא קטגוריה"}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0 -mt-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(item.id); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="ערוך"
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="מחק"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${TYPE_COLORS[item.type]}`}>
            {TYPE_LABELS[item.type]}
          </span>
          {sourceBadge && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${sourceBadge.className}`}>
              {sourceBadge.label}
            </span>
          )}
          {isSolar && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">☀ סולארי</span>
          )}
          {isElectric && !isSolar && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">⚡ חשמלי</span>
          )}
          {isReflective && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">◈ רפלקטיבי</span>
          )}
          {safetyRefId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">🛡 בטיחות</span>
          )}
          {reviewBadge && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${reviewBadge.className}`}>
              {reviewBadge.label}
            </span>
          )}
          {(item.linkedProducts?.length ?? 0) > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              {item.linkedProducts!.length} נלווים
            </span>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{item.description}</p>
        )}

        {/* Dims from specs */}
        {specDimensions && (
          <p className="text-[11px] text-gray-400 font-mono" dir="ltr">{specDimensions}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
          <div dir="ltr" className="text-sm font-semibold text-gray-700">
            {item.defaultPrice !== null
              ? <>₪{item.defaultPrice.toLocaleString()} <span className="text-xs font-normal text-gray-400">/ {item.unitOfMeasure}</span></>
              : <span className="text-gray-300 font-normal text-xs">ללא מחיר</span>
            }
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(item.id); }}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              item.isActive ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {item.isActive ? "פעיל" : "לא פעיל"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update CatalogItemDetailPanel image resolution**

Find this line in `CatalogItemDetailPanel` (~line 85):
```typescript
const images  = item.metadata?.images  as { product?: string; page?: string } | undefined;
```

Replace with:
```typescript
const images  = item.metadata?.images  as Record<string, string | undefined> | undefined;
```

Find this block (around line 113–121):
```typescript
{/* Thumbnail */}
{images?.product && (
  <div className="shrink-0">
    <img
      src={images.product}
      alt={item.name}
      className="w-20 h-20 object-cover rounded-lg border border-gray-200 bg-white shadow-sm"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  </div>
)}
```

Replace with:
```typescript
{/* Thumbnail — prefer new thumb, fall back to full, suppress legacy product path */}
{(() => {
  const imgUrl = images?.thumb ?? images?.full ?? null;
  const cropStatus = images?.crop_status;
  return imgUrl ? (
    <div className="shrink-0 space-y-1">
      <img
        src={imgUrl}
        alt={item.name}
        className="w-20 h-20 object-cover rounded-lg border border-gray-200 bg-white shadow-sm"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      {cropStatus === "needs_review" && (
        <p className="text-[9px] text-orange-500 italic text-center">תמונה לבדיקה</p>
      )}
    </div>
  ) : null;
})()}
```

Also add, below the existing badges in the detail panel, right after `{sourceLabel && ...}`:
```typescript
{(() => {
  const reviewState = item.metadata?.review_state as string | undefined;
  const rb = reviewState ? REVIEW_BADGE[reviewState] : null;
  return rb ? (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${rb.className}`}>
      {rb.label}
    </span>
  ) : null;
})()}
```

And add the import for `REVIEW_BADGE` (already added in Step 1 of this task).

- [ ] **Step 4: Check TypeScript**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1 | head -40
```

Fix any type errors before committing.

- [ ] **Step 5: Commit**

```bash
git add src/components/Catalog/index.tsx
git commit -m "feat(catalog/phase-c): ItemCard — image thumbnail, source badge, click-to-edit"
```

---

## Task 9 — CatalogShowcase Components (Phase D)

**Files:**
- Create: `src/components/CatalogShowcase/CategoryCard.tsx`
- Create: `src/components/CatalogShowcase/ProductCard.tsx`
- Create: `src/components/CatalogShowcase/ProductModal.tsx`

- [ ] **Step 1: Create CategoryCard.tsx**

```typescript
// src/components/CatalogShowcase/CategoryCard.tsx
"use client";

import type { ShowcaseCategory } from "./constants";

interface Props {
  category: ShowcaseCategory;
  count: number;
  selected: boolean;
  onClick: () => void;
}

export function CategoryCard({ category, count, selected, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center text-center p-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        selected
          ? "bg-blue-900/30 border-blue-500 text-blue-300"
          : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20"
      }`}
    >
      <span className="text-2xl mb-1.5">{category.icon}</span>
      <span className="text-[11px] font-semibold leading-tight">{category.label}</span>
      <span className={`text-[9px] mt-1 ${selected ? "text-blue-400" : "text-white/30"}`}>
        {count} {count === 1 ? "מוצר" : "מוצרים"}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Create ProductCard.tsx**

```typescript
// src/components/CatalogShowcase/ProductCard.tsx
"use client";

import type { CatalogItem } from "@/types/catalog";
import { getSourceType, SOURCE_BADGE, STATUS_BADGE, REVIEW_BADGE, resolveProductImage, getCategoryIcon } from "./constants";

interface Props {
  item: CatalogItem;
  onClick: (item: CatalogItem) => void;
}

export function ProductCard({ item, onClick }: Props) {
  const imgUrl = resolveProductImage(item.metadata);
  const sourceType = getSourceType(item.metadata);
  const sourceBadge = SOURCE_BADGE[sourceType];
  const statusBadge = STATUS_BADGE[item.isActive ? "active" : "inactive"];
  const reviewState = item.metadata?.review_state as string | undefined;
  const reviewBadge = reviewState ? REVIEW_BADGE[reviewState] : null;
  const categoryIcon = getCategoryIcon(item.category);
  const specs = item.metadata?.specs as Record<string, unknown> | undefined;
  const dimensions = specs?.dimensions as string | undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(item)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(item); } }}
      className={`rounded-xl border overflow-hidden flex flex-col cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-400
        ${item.isActive
          ? "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
          : "bg-white/2 border-white/5 opacity-55"
        }`}
    >
      {/* Image */}
      <div className="h-28 bg-white/5 flex items-center justify-center border-b border-white/5 relative overflow-hidden">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = "none";
              const parent = el.parentElement;
              if (parent) {
                const span = document.createElement("span");
                span.className = "text-3xl opacity-50";
                span.textContent = categoryIcon;
                parent.appendChild(span);
              }
            }}
          />
        ) : (
          <span className="text-3xl opacity-50">{categoryIcon}</span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <p className="text-sm font-bold text-white/90 leading-snug line-clamp-2">{item.name}</p>
          {dimensions && (
            <p className="text-[10px] text-white/35 font-mono mt-0.5" dir="ltr">{dimensions}</p>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
          {sourceBadge && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${sourceBadge.className}`}>
              {sourceBadge.label}
            </span>
          )}
          {reviewBadge && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${reviewBadge.className}`}>
              {reviewBadge.label}
            </span>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-[10px] text-white/45 line-clamp-2 leading-relaxed flex-1">
            {item.description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto">
          <span className="text-[10px] text-white/25">{item.unitOfMeasure}</span>
          <span className="text-[10px] text-blue-400 font-semibold">פרטים ←</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ProductModal.tsx**

```typescript
// src/components/CatalogShowcase/ProductModal.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CatalogItem } from "@/types/catalog";
import { TYPE_LABELS } from "@/types/catalog";
import {
  getSourceType, SOURCE_BADGE, STATUS_BADGE, REVIEW_BADGE,
  resolveDetailImage, getCategoryIcon
} from "./constants";

interface Props {
  item: CatalogItem;
  onClose: () => void;
}

export function ProductModal({ item, onClose }: Props) {
  const router = useRouter();
  const imgUrl = resolveDetailImage(item.metadata);
  const sourceType = getSourceType(item.metadata);
  const sourceBadge = SOURCE_BADGE[sourceType];
  const statusBadge = STATUS_BADGE[item.isActive ? "active" : "inactive"];
  const reviewState = item.metadata?.review_state as string | undefined;
  const reviewBadge = reviewState ? REVIEW_BADGE[reviewState] : null;
  const categoryIcon = getCategoryIcon(item.category);
  const specs = item.metadata?.specs as Record<string, string | boolean | number | undefined> | undefined;
  const sources = item.metadata?.sources as Array<{ type: string; note?: string; url?: string }> | undefined;
  const cropStatus = (item.metadata?.images as Record<string, string> | undefined)?.crop_status;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative bg-[#1a2d4a] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg overflow-hidden shadow-2xl">
        {/* Image */}
        <div className="h-48 sm:h-56 bg-white/5 flex items-center justify-center relative overflow-hidden border-b border-white/7">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = "none";
                const parent = el.parentElement;
                if (parent) {
                  const span = document.createElement("span");
                  span.className = "text-6xl opacity-40";
                  span.textContent = categoryIcon;
                  parent.appendChild(span);
                }
              }}
            />
          ) : (
            <span className="text-6xl opacity-40">{categoryIcon}</span>
          )}
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/40 text-white/70 hover:text-white flex items-center justify-center text-lg leading-none transition-colors"
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[60vh] sm:max-h-none">
          <h2 className="text-lg font-bold text-white">{item.name}</h2>
          <p className="text-xs text-white/40 mt-0.5 mb-3">{item.category}</p>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusBadge.className}`}>
              {statusBadge.label}
            </span>
            {sourceBadge && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sourceBadge.className}`}>
                {sourceBadge.label}
              </span>
            )}
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10">
              {TYPE_LABELS[item.type]}
            </span>
            {reviewBadge && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${reviewBadge.className}`}>
                {reviewBadge.label}
              </span>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <p className="text-sm text-white/60 leading-relaxed mb-4">{item.description}</p>
          )}

          {/* Specs */}
          {specs && Object.keys(specs).length > 0 && (
            <div className="bg-white/4 rounded-lg p-3 mb-4">
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">מפרט טכני</p>
              <div className="space-y-1">
                {specs.dimensions && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">מידות</span>
                    <span className="text-white/70">{String(specs.dimensions)}</span>
                  </div>
                )}
                {specs.material && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">חומר</span>
                    <span className="text-white/70">{String(specs.material)}</span>
                  </div>
                )}
                {specs.is_solar && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">הזנה</span>
                    <span className="text-amber-400">☀ סולארי</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Source info */}
          <div className="bg-white/4 rounded-lg p-3 mb-5">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-2">מקור</p>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">יחידה</span>
              <span className="text-white/70">{item.unitOfMeasure}</span>
            </div>
            {sources?.[0]?.note && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-white/40">מקור</span>
                <span className="text-white/70">{sources[0].note}</span>
              </div>
            )}
            {cropStatus === "needs_review" && (
              <p className="text-[10px] text-orange-400 mt-2 italic">תמונה דורשת בדיקת חיתוך</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/7 text-white/60 border border-white/10 text-sm hover:bg-white/12 transition-colors"
            >
              סגור
            </button>
            <button
              type="button"
              onClick={() => { onClose(); router.push("/catalog"); }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              ✏ ערוך מוצר
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Check TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```bash
git add src/components/CatalogShowcase/
git commit -m "feat(catalog/phase-d): CategoryCard, ProductCard, ProductModal components"
```

---

## Task 10 — CatalogShowcase Main Page (Phase D)

**Files:**
- Create: `src/components/CatalogShowcase/index.tsx`

- [ ] **Step 1: Create the main showcase page component**

Create `src/components/CatalogShowcase/index.tsx`:

```typescript
"use client";

import { useState, useMemo } from "react";
import { useCatalogContext } from "@/context/CatalogContext";
import type { CatalogItem } from "@/types/catalog";
import { CategoryCard } from "./CategoryCard";
import { ProductCard } from "./ProductCard";
import { ProductModal } from "./ProductModal";
import { SHOWCASE_CATEGORIES, getCategoryIcon, getSourceType } from "./constants";

const ALL_KEY = "__all__";

// Catch-all for "אביזרי בטיחות — X" subcategories not in the main list
const SAFETY_CATCHALL = { key: "__safety_misc__", label: "אביזרי בטיחות נוספים", icon: "🛡️" };

type FilterStatus = "all" | "active" | "inactive";
type FilterSource = "all" | "elkayam" | "external";

function getDisplayCategories(items: CatalogItem[]) {
  const allCats = new Set(items.map(i => i.category));
  const result: Array<{ key: string; label: string; icon: string }> = [
    { key: ALL_KEY, label: "הכל", icon: "📦" },
  ];

  for (const cat of SHOWCASE_CATEGORIES) {
    if (allCats.has(cat.key)) {
      result.push({ key: cat.key, label: cat.label, icon: cat.icon });
    }
  }

  // Catch-all for remaining אביזרי בטיחות — subcategories
  const knownKeys = new Set(SHOWCASE_CATEGORIES.map(c => c.key));
  const miscSafety = [...allCats].filter(
    c => c.startsWith("אביזרי בטיחות") && !knownKeys.has(c)
  );
  if (miscSafety.length > 0) {
    result.push(SAFETY_CATCHALL);
  }

  // Any remaining categories not in SHOWCASE_CATEGORIES at all
  const coveredKeys = new Set([...SHOWCASE_CATEGORIES.map(c => c.key), ...miscSafety]);
  for (const cat of allCats) {
    if (!coveredKeys.has(cat)) {
      result.push({ key: cat, label: cat, icon: getCategoryIcon(cat) });
    }
  }

  return result;
}

function filterItems(
  items: CatalogItem[],
  selectedCat: string,
  status: FilterStatus,
  source: FilterSource,
  hideInactive: boolean,
  search: string,
): CatalogItem[] {
  return items.filter(item => {
    // Category filter
    if (selectedCat !== ALL_KEY) {
      if (selectedCat === SAFETY_CATCHALL.key) {
        const knownKeys = new Set(SHOWCASE_CATEGORIES.map(c => c.key));
        if (!item.category.startsWith("אביזרי בטיחות") || knownKeys.has(item.category)) return false;
      } else {
        if (item.category !== selectedCat) return false;
      }
    }
    // Status filter
    if (status === "active" && !item.isActive) return false;
    if (status === "inactive" && item.isActive) return false;
    // Hide inactive toggle
    if (hideInactive && !item.isActive) return false;
    // Source filter
    if (source !== "all") {
      const st = getSourceType(item.metadata);
      if (source === "elkayam" && st !== "elkayam") return false;
      if (source === "external" && st !== "external") return false;
    }
    // Search
    if (search) {
      const q = search.toLowerCase();
      if (
        !item.name.toLowerCase().includes(q) &&
        !item.category.toLowerCase().includes(q) &&
        !(item.description ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
}

export function CatalogShowcasePage() {
  const { items } = useCatalogContext();

  const [selectedCat, setSelectedCat]   = useState(ALL_KEY);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterSource, setFilterSource] = useState<FilterSource>("all");
  const [hideInactive, setHideInactive] = useState(false);
  const [search, setSearch]             = useState("");
  const [activeModal, setActiveModal]   = useState<CatalogItem | null>(null);

  const displayCategories = useMemo(() => getDisplayCategories(items), [items]);

  const countPerCat = useMemo(() => {
    const counts: Record<string, number> = { [ALL_KEY]: items.length };
    const knownKeys = new Set(SHOWCASE_CATEGORIES.map(c => c.key));
    for (const item of items) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      if (item.category.startsWith("אביזרי בטיחות") && !knownKeys.has(item.category)) {
        counts[SAFETY_CATCHALL.key] = (counts[SAFETY_CATCHALL.key] ?? 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const filtered = useMemo(() =>
    filterItems(items, selectedCat, filterStatus, filterSource, hideInactive, search),
    [items, selectedCat, filterStatus, filterSource, hideInactive, search]
  );

  const stats = useMemo(() => ({
    total:    items.length,
    active:   items.filter(i => i.isActive).length,
    withImg:  items.filter(i => !!(item => {
      const imgs = i.metadata?.images as Record<string, unknown> | undefined;
      return imgs?.thumb || imgs?.full;
    })(i)).length,
    categories: displayCategories.length - 1, // exclude "הכל"
  }), [items, displayCategories]);

  const selectedLabel = displayCategories.find(c => c.key === selectedCat)?.label ?? "הכל";

  return (
    <div className="min-h-screen" style={{ background: "#0d1b2e" }} dir="rtl">

      {/* ── Hero ── */}
      <div
        className="px-6 sm:px-8 lg:px-12 pt-8 pb-7 border-b"
        style={{ background: "linear-gradient(135deg,#1a2d4a,#0d1b2e)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div
            className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest px-3 py-1 rounded-full mb-3"
            style={{ background: "rgba(29,111,216,0.15)", border: "1px solid rgba(29,111,216,0.3)", color: "#60a5fa" }}
          >
            🚧 ELKAYAM CATALOG
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
            קטלוג מוצרי{" "}
            <span style={{ color: "#f59e0b" }}>בטיחות ותנועה</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.45)" }}>
            פתרונות הסדרי תנועה, סימון כבישים, שילוט, אביזרי בטיחות ואביזרי דרך
          </p>

          {/* Search + filters */}
          <div className="flex flex-wrap gap-2 mt-5 items-center">
            <div
              className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm px-3 py-2 rounded-lg"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש מוצר, קטגוריה..."
                className="bg-transparent border-none outline-none text-sm flex-1 text-white placeholder-white/30"
              />
            </div>

            {/* Status pills */}
            {(["all", "active", "inactive"] as FilterStatus[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filterStatus === s
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-transparent text-white/50 border-white/15 hover:border-white/30"
                }`}
              >
                {s === "all" ? "הכל" : s === "active" ? "● פעיל" : "○ לא פעיל"}
              </button>
            ))}

            {/* Source pills */}
            {(["all", "elkayam", "external"] as FilterSource[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterSource(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filterSource === s
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-transparent text-white/50 border-white/15 hover:border-white/30"
                }`}
              >
                {s === "all" ? "כל המקורות" : s === "elkayam" ? "אלקיים" : "מקור חיצוני"}
              </button>
            ))}

            {/* Hide inactive toggle */}
            <button
              type="button"
              onClick={() => setHideInactive(v => !v)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                hideInactive
                  ? "bg-gray-600 border-gray-500 text-white"
                  : "bg-transparent text-white/50 border-white/15 hover:border-white/30"
              }`}
            >
              {hideInactive ? "✓ מסתיר לא פעיל" : "הסתר לא פעיל"}
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-5 mt-4">
            {[
              { val: stats.total, label: "מוצרים" },
              { val: stats.active, label: "פעילים" },
              { val: stats.categories, label: "קטגוריות" },
              { val: stats.withImg, label: "עם תמונה" },
            ].map(s => (
              <div key={s.label}>
                <p className="text-base font-black text-white/70">{s.val}</p>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12">

        {/* ── Category grid ── */}
        <p className="text-[10px] font-bold tracking-widest mt-7 mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
          קטגוריות מוצרים
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2 mb-8">
          {displayCategories.map(cat => (
            <CategoryCard
              key={cat.key}
              category={cat}
              count={countPerCat[cat.key] ?? 0}
              selected={selectedCat === cat.key}
              onClick={() => setSelectedCat(cat.key)}
            />
          ))}
        </div>

        {/* ── Product grid header ── */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>
            {selectedLabel}
          </h2>
          <span
            className="text-xs px-2.5 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)" }}
          >
            {filtered.length} מוצרים
          </span>
        </div>

        {/* ── Product grid ── */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm">לא נמצאו מוצרים בקטגוריה זו</p>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.15)" }}>נסה לשנות את הסינון</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-12">
            {filtered.map(item => (
              <ProductCard key={item.id} item={item} onClick={setActiveModal} />
            ))}
          </div>
        )}

      </div>

      {/* ── Modal ── */}
      {activeModal && (
        <ProductModal item={activeModal} onClose={() => setActiveModal(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CatalogShowcase/index.tsx
git commit -m "feat(catalog/phase-d): CatalogShowcasePage — hero, category grid, product grid, modal"
```

---

## Task 11 — Route + Sidebar (Phase D)

**Files:**
- Create: `src/app/catalog-showcase/page.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Create route page**

Create `src/app/catalog-showcase/page.tsx`:

```typescript
import { CatalogShowcasePage } from "@/components/CatalogShowcase";

export default function Page() {
  return <CatalogShowcasePage />;
}
```

- [ ] **Step 2: Update Sidebar.tsx**

In `src/components/Sidebar.tsx`, add `LayoutGrid` to the lucide-react import:

```typescript
import {
  FileText, Table2, LayoutDashboard, Users, Palette, Wrench,
  Database, ShieldCheck, Warehouse, DollarSign, Map, Calendar,
  UsersRound, BookOpen, TrendingUp, Bot, Settings, ShieldPlus,
  LogOut, X, Cable, ScanLine, ScanText, LayoutGrid,
} from "lucide-react";
```

Find the "בנוסף" section (currently):
```typescript
{
  label: "בנוסף",
  items: [
    { tabId: "catalog", href: "/catalog", label: "קטלוג מוצרים ופריטים", icon: <Database className={ICON_CLS} />, matchFn: (p) => p.startsWith("/catalog") },
  ],
},
```

Replace with:
```typescript
{
  label: "בנוסף",
  items: [
    {
      tabId: "catalog",
      href: "/catalog",
      label: "קטלוג מוצרים ופריטים",
      icon: <Database className={ICON_CLS} />,
      matchFn: (p) => p === "/catalog" || (p.startsWith("/catalog") && !p.startsWith("/catalog-showcase")),
    },
    {
      tabId: "catalog",
      href: "/catalog-showcase",
      label: "קטלוג חזותי",
      icon: <LayoutGrid className={ICON_CLS} />,
      matchFn: (p) => p.startsWith("/catalog-showcase"),
      noBadge: true,
    },
  ],
},
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add src/app/catalog-showcase/page.tsx src/components/Sidebar.tsx
git commit -m "feat(catalog/phase-d): /catalog-showcase route + sidebar nav entry"
```

---

## Task 12 — Final QA + Structured Report

**Files:** None created; verification only.

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/eliozedri/Desktop/eliozelk
npx tsc --noEmit 2>&1
```

Expected: zero errors. Fix any type issues before proceeding.

- [ ] **Step 2: Verify dev server**

```bash
lsof -ti :3000 | head -5
```

If not running:
```bash
npm run dev &
sleep 8
```

- [ ] **Step 3: Check routes**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/catalog
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/catalog-showcase
```

Expected: both return `200`.

- [ ] **Step 4: Verify supplier items are inactive**

```bash
npx tsx -e "
import {createClient} from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({path:'.env.local'});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
Promise.all([
  sb.from('catalog_items').select('id').like('id','ext-asc-%').eq('is_active',true),
  sb.from('catalog_items').select('id').like('id','ext-asc-%'),
]).then(([active, all]) => {
  console.log('Total supplier items:', all.data?.length ?? 0);
  console.log('Active supplier items (must be 0):', active.data?.length ?? 0);
});
"
```

Expected: `Active supplier items (must be 0): 0`

- [ ] **Step 5: Verify new image fields exist on items**

```bash
npx tsx -e "
import {createClient} from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({path:'.env.local'});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('catalog_items').select('id,metadata').not('metadata->images->thumb','is',null).then(({data})=>{
  console.log('Items with metadata.images.thumb:', data?.length ?? 0);
});
"
```

- [ ] **Step 6: Verify legacy images deprecated**

```bash
npx tsx -e "
import {createClient} from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({path:'.env.local'});
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('catalog_items').select('id,metadata').not('metadata->images->_legacy_product','is',null).then(({data})=>{
  console.log('Items with legacy images marked for replacement:', data?.length ?? 0);
});
"
```

- [ ] **Step 7: Check image asset files**

```bash
find public/catalog/elkayam -name "*-thumb.webp" | wc -l
find public/catalog/supplier -name "*-thumb.webp" | wc -l
find public/catalog -name "manifest.json" -exec python3 -c "
import json,sys
m=json.load(open('public/catalog/manifest.json'))
e=m['entries']
from collections import Counter
print('Crop statuses:', Counter(x.get('crop_status') for x in e))
" \;
```

- [ ] **Step 8: Final commit + push**

```bash
cd /Users/eliozedri/Desktop/eliozelk
git log --oneline -10
git push origin main
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Phase A — image pipeline: Tasks 1–5
- [x] Phase B — supplier import: Task 6
- [x] Phase C — /catalog UI upgrade: Tasks 7–8
- [x] Phase D — /catalog-showcase page: Tasks 7–11
- [x] Folder structure convention: Task 1 + enforced throughout
- [x] Manifest.json: Task 1 + updated in Tasks 2–5
- [x] English slugs, no Hebrew filenames: enforced in slugify()
- [x] original / thumbs / processed separation: enforced in all scripts
- [x] Active/inactive rule (supplier never active): Task 6 script + SQL migration
- [x] Deduplication by name: Task 6 script
- [x] click-to-edit + stopPropagation: Task 8
- [x] Modal closes on Escape + backdrop: Task 9 ProductModal
- [x] "הסתר לא פעיל" toggle: Task 10 index.tsx
- [x] Sidebar matchFn fix: Task 11
- [x] TypeScript checks: Tasks 7, 8, 9, 10, 11, 12

**Type consistency:**
- `resolveProductImage()` used in ItemCard (Task 8) and ProductCard (Task 9) — ✓ same function from constants.ts
- `resolveDetailImage()` used in ProductModal (Task 9) — ✓ defined in constants.ts Task 7
- `getSourceType()`, `SOURCE_BADGE`, `STATUS_BADGE`, `REVIEW_BADGE` — all defined in Task 7, used consistently in Tasks 8–10
- `CatalogItem` type used throughout — from `@/types/catalog`, unchanged
- `metadata.images.thumb` new field — set by Task 5, read by Tasks 8–10

**Placeholder scan:** None found. All code blocks are complete.
