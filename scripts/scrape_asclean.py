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

CATALOG_CATEGORY_MAP = {
    'speed-bumps':            'אביזרי כבישים',
    'convex-mirrors':         'אביזרי חנייה',
    'parking-stops':          'אביזרי חנייה',
    'flexible-posts':         'אביזרי בטיחות — מפרדים ועמודים גמישים',
    'barriers':               'מעקות ומחסומים',
    'cones':                  'אביזרי בטיחות — קונוסים ואביזריהם',
    'solar-blinkers':         'אביזרי כבישים',
    'anti-slip':              'אביזרי כבישים',
    'cable-covers':           'גובים ותעלות',
    'signage':                'שלטים ושילוט',
    'other-safety-equipment': 'אביזרי בטיחות — כללי',
}


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.images = []
        self.texts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a':
            href = attrs.get('href', '')
            self.links.append({'href': href})
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

    print(f"[main] Fetching {CATALOG_URL}")
    html = fetch_html(CATALOG_URL)
    if not html:
        print("[warn] Could not fetch main catalog page — trying known categories directly")
        category_urls = {
            slug: f"{CATALOG_URL}{slug}/"
            for slug in CATEGORY_MAP
        }
    else:
        parser = LinkParser()
        parser.feed(html)
        category_urls = {}
        for link in parser.links:
            href = link['href']
            abs = abs_url(CATALOG_URL, href)
            if abs and 'catalog-safety-equipment' in abs:
                slug_match = re.search(r'catalog-safety-equipment/([^/]+)/?$', abs)
                if slug_match:
                    cat_slug = urllib.parse.unquote(slug_match.group(1))
                    folder = CATEGORY_MAP.get(cat_slug, None)
                    if folder:
                        category_urls[cat_slug] = abs
        if not category_urls:
            print("  No category links found from main page, using hardcoded list")
            category_urls = {slug: f"{CATALOG_URL}{slug}/" for slug in CATEGORY_MAP}
        print(f"  Found {len(category_urls)} category links")

    for cat_slug, cat_url in list(category_urls.items())[:30]:
        folder = CATEGORY_MAP.get(cat_slug, 'other-safety-equipment')
        catalog_cat = CATALOG_CATEGORY_MAP.get(folder, 'אביזרי בטיחות — כללי')
        print(f"\n[cat] {cat_slug} → {folder}")

        html = fetch_html(cat_url)
        if not html:
            print(f"  [blocked] {cat_url}")
            all_products.append({
                'item_id': f"ext-asc-{folder}-placeholder",
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
                'crop_status': 'download_failed',
                'review_state': 'needs_review',
                'imported_at': now_iso(),
            })
            continue

        parser = LinkParser()
        parser.feed(html)

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
            if re.search(r'\.(jpg|jpeg|png|webp|gif)(\?|$)', src.lower()):
                product_imgs.append({'src': abs_src, 'alt': alt})

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
                'local_thumb': None,
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

    os.makedirs(ASCLEAN_DIR, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump({'products': all_products}, f, ensure_ascii=False, indent=2)

    save_manifest(manifest)
    print(f"\n✓ Asclean scrape done. {len(all_products)} products logged.")
    print(f"  Output: {OUTPUT_JSON}")


if __name__ == '__main__':
    main()
