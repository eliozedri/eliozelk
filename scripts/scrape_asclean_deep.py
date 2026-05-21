#!/usr/bin/env python3
"""
Deep recursive scraper for asclean.co.il/catalog-safety-equipment/
Crawls 4-level hierarchy: main → category → subcategory → product page.
Extracts full product specs, images, PDF files.
Saves to public/catalog/supplier/asclean/<cat>/<subcat>/<product>/original|thumbs|processed|specs/
Writes scraped-products-deep.json for Phase B DB import.

Usage:
  python3 scrape_asclean_deep.py               # full crawl
  python3 scrape_asclean_deep.py --sample URL  # single product page
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import collections
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(__file__))
from catalog_utils import load_manifest, save_manifest, add_manifest_entry, now_iso, slugify

BASE_URL   = "https://www.asclean.co.il"
CATALOG_URL = f"{BASE_URL}/catalog-safety-equipment/"
PUBLIC_DIR  = os.path.join(os.path.dirname(__file__), '..', 'public')
ASCLEAN_DIR = os.path.join(PUBLIC_DIR, 'catalog', 'supplier', 'asclean')
OUTPUT_JSON = os.path.join(ASCLEAN_DIR, 'scraped-products-deep.json')
FAILED_LOG  = os.path.join(ASCLEAN_DIR, 'failed-urls.json')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
}

# Map top-level English category slug → Elkayam catalog category (Hebrew)
CATEGORY_MAP = {
    'speed-bumps':                        'אביזרי כבישים',
    'conus':                              'אביזרי בטיחות — קונוסים ואביזריהם',
    'flexible-delineator-posts':          'אביזרי בטיחות — מפרדים ועמודים גמישים',
    'barrier-post':                       'מעקות ומחסומים',
    'panoramic-mirrors':                  'אביזרי חנייה',
    'park-stopper':                       'אביזרי חנייה',
    'parking-guard':                      'אביזרי חנייה',
    'bicycle-parking-facilities':         'אביזרי חנייה',
    'bicycle-parking-facility':           'אביזרי חנייה',
    'plastic-fence-and-new-jersey-fence': 'מעקות ומחסומים',
    'signage-and-signpost':               'שלטים ושילוט',
    'marking-and-non-slip':               'אביזרי כבישים',
    'marking-poles':                      'הסדרי תנועה',
    'blinker':                            'אביזרי כבישים',
    'traffic-separator':                  'הסדרי תנועה',
    'spikes-barier':                      'אביזרי חנייה',
    'defenses-and-defenders':             'אביזרי בטיחות — כללי',
    'accessibility-in-public-places':     'אביזרי בטיחות — נגישות',
    'additional-products':                'אביזרי בטיחות — כללי',
    'spray-paint-marking':                'עבודות סימון וצביעה',
    'wet-room-products':                  'אביזרי בטיחות — כללי',
}

SKIP_URL_FRAGMENTS = {'feed/', 'installation-instructions/', '#', 'mailto:', 'tel:', '?', 'wp-admin', 'wp-login'}


# ── HTML Parsers ──────────────────────────────────────────────────────────────

class FullPageParser(HTMLParser):
    """Extracts links, images, breadcrumbs, and text from an HTML page."""
    def __init__(self):
        super().__init__()
        self.links = []
        self.images = []       # (src, alt)
        self.og_image = None
        self.twitter_image = None
        self.title = ""
        self.h1 = ""
        self.meta_desc = ""
        self._in_title = False
        self._in_h1 = False
        self._in_h2 = False
        self.h2s = []
        self.breadcrumb_texts = []
        self._in_breadcrumb = False
        self._depth = 0

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag == 'title':
            self._in_title = True
        elif tag in ('h1',):
            self._in_h1 = True
        elif tag in ('h2',):
            self._in_h2 = True
        elif tag == 'a':
            href = attrs_d.get('href', '')
            if href:
                self.links.append(href)
        elif tag == 'img':
            src = (attrs_d.get('src', '') or attrs_d.get('data-src', '') or
                   attrs_d.get('data-lazy-src', '') or attrs_d.get('data-original', ''))
            alt = attrs_d.get('alt', '')
            if src and not src.startswith('data:'):
                self.images.append((src, alt))
            # Also check srcset
            srcset = attrs_d.get('srcset', '') or attrs_d.get('data-srcset', '')
            if srcset:
                # Pick largest image from srcset
                parts = [p.strip().split() for p in srcset.split(',')]
                for part in parts:
                    if part and part[0].startswith('http'):
                        self.images.append((part[0], alt))
        elif tag == 'meta':
            prop = attrs_d.get('property', '') or attrs_d.get('name', '')
            content = attrs_d.get('content', '')
            if prop == 'og:image' and content:
                self.og_image = content
            elif prop in ('twitter:image', 'twitter:image:src') and content:
                self.twitter_image = content
            elif prop in ('description', 'og:description') and content and not self.meta_desc:
                self.meta_desc = content

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False
        elif tag == 'h1':
            self._in_h1 = False
        elif tag == 'h2':
            self._in_h2 = False

    def handle_data(self, data):
        text = data.strip()
        if self._in_title and text:
            self.title = text
        if self._in_h1 and text:
            self.h1 += text
        if self._in_h2 and text:
            self.h2s.append(text)


# ── Fetching ──────────────────────────────────────────────────────────────────

RETRY_DELAY = 5      # seconds between retries
MAX_RETRIES = 3      # attempts per URL before marking failed

def fetch_html(url, retries=MAX_RETRIES):
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as resp:
                ct = resp.headers.get('Content-Type', '')
                if 'text/html' not in ct and 'text/' not in ct:
                    return None, f"non-HTML content-type: {ct}"
                charset = 'utf-8'
                if 'charset=' in ct:
                    charset = ct.split('charset=')[-1].strip().split(';')[0].strip()
                return resp.read().decode(charset, errors='replace'), None
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
            if attempt < retries:
                print(f"    [retry {attempt+1}/{retries}] {url} — {last_err}, waiting {RETRY_DELAY}s")
                time.sleep(RETRY_DELAY)
        except Exception as e:
            last_err = str(e)
            if attempt < retries:
                print(f"    [retry {attempt+1}/{retries}] {url} — {last_err}, waiting {RETRY_DELAY}s")
                time.sleep(RETRY_DELAY)
    return None, last_err


def download_binary(url, dest_path, min_bytes=500, retries=MAX_RETRIES):
    if os.path.exists(dest_path):
        return True, "already_exists"
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = resp.read()
                if len(data) < min_bytes:
                    return False, f"too_small ({len(data)} bytes)"
                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                with open(dest_path, 'wb') as f:
                    f.write(data)
                return True, "downloaded"
        except Exception as e:
            last_err = str(e)
            if attempt < retries:
                time.sleep(RETRY_DELAY)
    return False, last_err


# ── Product Data Extraction ───────────────────────────────────────────────────

def extract_specs_from_html(html):
    """
    Extract Elementor price-list spec tables.
    Pattern: elementor-price-list-title → key, elementor-price-list-price → value.
    Returns list of spec dicts (one per spec group / variant section).
    """
    # Find all spec list items
    items = re.findall(
        r'<span class="elementor-price-list-title">\s*(.*?)\s*</span>.*?'
        r'<span class="elementor-price-list-price">\s*(.*?)\s*</span>',
        html, re.S
    )

    if not items:
        return []

    # Group into variants by detecting repeated 'מק"ט' entries
    variants = []
    current = {}
    for raw_key, raw_val in items:
        key = re.sub(r'<[^>]+>', '', raw_key).strip()
        val = re.sub(r'<[^>]+>', '', raw_val).strip()
        if not key or not val:
            continue
        # Normalize key
        key_norm = key.replace('"', '"').replace("'", "'")
        if key_norm in ('מק"ט', 'מק״ט', 'sku', 'SKU') and current:
            variants.append(current)
            current = {}
        current[key] = val

    if current:
        variants.append(current)

    return variants


def extract_product_title(html, page_url):
    """Extract product title: prefer H1, fall back to OG title, then URL slug."""
    # OG title
    og = re.search(r'<meta property="og:title" content="([^"]+)"', html)
    if og:
        title = og.group(1).strip()
        # Remove site name suffix
        title = re.sub(r'\s*[-|]\s*.*?(אסקלין|asclean).*', '', title, flags=re.I).strip()
        if title:
            return title

    # H1
    h1 = re.search(r'<h1[^>]*>\s*(.*?)\s*</h1>', html, re.S | re.I)
    if h1:
        text = re.sub(r'<[^>]+>', '', h1.group(1)).strip()
        if text:
            return text

    # Fall back to URL slug
    slug = page_url.rstrip('/').split('/')[-1]
    return slug.replace('-', ' ')


def extract_description(html):
    """Extract product description text."""
    # Meta description
    meta = re.search(r'<meta name="description" content="([^"]+)"', html)
    if meta:
        desc = meta.group(1).strip()
        # Unescape HTML entities
        desc = desc.replace('&quot;', '"').replace('&amp;', '&').replace('&#8220;', '"').replace('&#8221;', '"')
        return desc

    # Look for elementor-text-editor content
    text_editors = re.findall(r'<div class="elementor-text-editor[^"]*">(.*?)</div>', html, re.S)
    for te in text_editors:
        text = re.sub(r'<[^>]+>', ' ', te).strip()
        text = re.sub(r'\s+', ' ', text).strip()
        if len(text) > 30 and re.search(r'[֐-׿]', text):
            return text[:500]
    return ''


def extract_feature_list(html):
    """Extract bullet points / feature lists."""
    features = []
    # Look for elementor-icon-list items
    items = re.findall(r'<span class="elementor-icon-list-text">(.*?)</span>', html, re.S)
    for item in items:
        text = re.sub(r'<[^>]+>', '', item).strip()
        if text and len(text) > 2:
            features.append(text)

    # Also look for regular li items with Hebrew text
    li_items = re.findall(r'<li[^>]*>\s*(?:<[^>]+>)?\s*([^<]{5,})\s*(?:</[^>]+>)?\s*</li>', html)
    for item in li_items:
        item = item.strip()
        if re.search(r'[֐-׿]', item) and item not in features:
            features.append(item)

    return features[:20]


def extract_images(html, base_url):
    """Extract product images: OG first, then wp-content/uploads, deduped."""
    seen = set()
    images = []

    skip_patterns = ['logo', 'icon', 'favicon', 'placeholder', 'אייקון', 'loader',
                     'arrow', 'banner', 'background', 'footer', 'header', 'nav',
                     'social', 'whatsapp', 'phone', 'search', 'star', 'rating',
                     'badge', 'flag', 'cart', 'close', 'menu']

    # OG image first (usually the primary product image)
    og = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    if og:
        url = og.group(1)
        if 'wp-content/uploads' in url and url not in seen:
            if not any(p in url.lower() for p in skip_patterns):
                images.append({'url': url, 'type': 'og'})
                seen.add(url)

    # All wp-content/uploads images
    all_imgs = re.findall(
        r'(?:src|data-src|data-lazy-src|data-original)=["\']'
        r'(https?://[^"\']+wp-content/uploads/[^"\']+\.(jpg|jpeg|png|webp)(?:\?[^"\']*)?)'
        r'["\']',
        html, re.I
    )

    for url, _ in all_imgs:
        # Normalize: remove query strings
        url_clean = url.split('?')[0]
        # Skip thumbnails with WP size suffixes (prefer full size)
        if re.search(r'-\d+x\d+\.(jpg|jpeg|png|webp)$', url_clean, re.I):
            # Keep only if no full-size version already added
            base_name = re.sub(r'-\d+x\d+(\.(jpg|jpeg|png|webp))$', r'\1', url_clean)
            if base_name in seen:
                continue
            # Add as fallback
            url_clean = base_name
        if url_clean in seen:
            continue
        if any(p in url_clean.lower() for p in skip_patterns):
            continue
        seen.add(url_clean)
        images.append({'url': url_clean, 'type': 'product'})

    # Also srcset
    srcsets = re.findall(r'srcset="([^"]+)"', html)
    for srcset in srcsets:
        for part in srcset.split(','):
            part = part.strip().split()
            if part and part[0].startswith('http') and 'wp-content/uploads' in part[0]:
                url_clean = part[0].split('?')[0]
                if re.search(r'-\d+x\d+\.(jpg|jpeg|png|webp)$', url_clean, re.I):
                    continue
                if url_clean not in seen:
                    if not any(p in url_clean.lower() for p in skip_patterns):
                        seen.add(url_clean)
                        images.append({'url': url_clean, 'type': 'srcset'})

    return images


def extract_pdfs(html):
    """Extract downloadable PDF/spec file links."""
    pdfs = re.findall(
        r'href=["\']([^"\']*wp-content/uploads/[^"\']*\.pdf)["\']',
        html, re.I
    )
    return list(set(pdfs))


def extract_breadcrumb(html):
    """Extract breadcrumb text list."""
    # Look for structured breadcrumb elements
    bc = re.findall(r'class="[^"]*breadcrumb[^"]*"[^>]*>(.*?)</(?:nav|div|ol|ul)', html, re.S | re.I)
    if bc:
        items = re.findall(r'>([^<]{2,50})<', bc[0])
        items = [i.strip() for i in items if i.strip() and i.strip() not in ('/', '>', '»', '›')]
        if items:
            return items

    # Yoast SEO JSON-LD breadcrumb
    json_ld = re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S)
    for jld in json_ld:
        try:
            data = json.loads(jld)
            if isinstance(data, dict) and data.get('@type') == 'BreadcrumbList':
                items = data.get('itemListElement', [])
                return [it.get('name', '') for it in items if it.get('name')]
        except Exception:
            pass

    return []


# ── URL Classification ────────────────────────────────────────────────────────

def is_product_page(html, url):
    """
    Product pages have the elementor-price-list-title spec widget,
    OR are at depth >= 3 (3+ segments after catalog-safety-equipment/).
    """
    if 'elementor-price-list-title' in html:
        return True
    # Also count as product if deep URL (level 4+)
    rel = url.replace(CATALOG_URL, '').rstrip('/')
    depth = len([x for x in rel.split('/') if x])
    return depth >= 3


def url_to_folder_path(url):
    """Convert product URL to local folder path segments."""
    rel = url.replace(CATALOG_URL, '').rstrip('/')
    parts = [p for p in rel.split('/') if p]
    if not parts:
        return ['other']
    return parts


def get_catalog_category(url_parts):
    """Map first URL segment to Elkayam catalog category."""
    if not url_parts:
        return 'אביזרי בטיחות — כללי'
    return CATEGORY_MAP.get(url_parts[0], 'אביזרי בטיחות — כללי')


# ── Main Scraper ──────────────────────────────────────────────────────────────

def scrape_product_page(url, url_parts, manifest):
    """Scrape a single product page and return product dict."""
    html, err = fetch_html(url)
    if not html:
        return None, f"fetch_failed: {err}"

    title = extract_product_title(html, url)
    description = extract_description(html)
    spec_variants = extract_specs_from_html(html)
    features = extract_feature_list(html)
    images = extract_images(html, url)
    pdfs = extract_pdfs(html)
    breadcrumb = extract_breadcrumb(html)
    catalog_cat = get_catalog_category(url_parts)

    # Build folder path
    folder_rel = '/'.join(url_parts)
    folder_abs = os.path.join(ASCLEAN_DIR, *url_parts)
    product_slug = url_parts[-1] if url_parts else 'unknown'

    # Generate item_id from URL path (stable, idempotent)
    item_id = 'ext-asc-' + '-'.join(url_parts).replace('/', '-')[:80]

    # Download primary image
    local_original = None
    local_thumb = None
    local_processed = None
    primary_img_url = None
    downloaded_images = []

    for i, img in enumerate(images[:5]):
        ext = os.path.splitext(img['url'].split('?')[0])[-1].lower()
        if ext not in ('.jpg', '.jpeg', '.png', '.webp', '.gif'):
            ext = '.jpg'
        # Clean stable filename: product-slug-source.ext for primary, -2/-3 for extras
        suffix = '' if i == 0 else f'-{i+1}'
        fname = f"{product_slug}-source{suffix}{ext}"
        dest = os.path.join(folder_abs, 'original', fname)
        ok, reason = download_binary(img['url'], dest)
        if ok:
            rel_path = f"/catalog/supplier/asclean/{folder_rel}/original/{fname}"
            downloaded_images.append({'local': rel_path, 'remote': img['url'], 'status': reason})
            if local_original is None:
                local_original = rel_path
                primary_img_url = img['url']
        else:
            downloaded_images.append({'local': None, 'remote': img['url'], 'status': f"fail: {reason}"})

    # Download PDF spec files
    local_spec_paths = []
    for i, pdf_url in enumerate(pdfs[:3]):
        suffix = '' if i == 0 else f'-{i+1}'
        fname = f"{product_slug}-technical-spec{suffix}.pdf"
        dest = os.path.join(folder_abs, 'specs', fname)
        ok, reason = download_binary(pdf_url, dest)
        if ok:
            local_spec_paths.append(f"/catalog/supplier/asclean/{folder_rel}/specs/{fname}")

    # Add to manifest
    if local_original:
        manifest_entry = {
            'item_id': item_id,
            'file_type': 'original',
            'source': 'external_supplier_reference',
            'category': url_parts[0] if url_parts else 'other',
            'source_url': primary_img_url or '',
            'source_page': url,
            'local_path': local_original,
            'crop_status': 'pending',
            'review_state': 'needs_review',
            'imported_at': now_iso(),
        }
        add_manifest_entry(manifest, manifest_entry)

    product = {
        'item_id': item_id,
        'product_slug': product_slug,
        'product_name': title,
        'category_path': url_parts,
        'catalog_category': catalog_cat,
        'breadcrumb': breadcrumb,
        'source_url': url,
        'description_short': description[:200] if description else '',
        'description_long': description,
        'features': features,
        'spec_variants': spec_variants,
        'technical_specs': spec_variants[0] if spec_variants else {},
        'image_urls_found': [img['url'] for img in images],
        'images_downloaded': downloaded_images,
        'local_original': local_original,
        'local_thumb': None,        # filled by crop script
        'local_processed': None,
        'specs_downloaded': local_spec_paths,
        'pdf_urls': pdfs,
        'extraction_status': 'ok',
        'image_status': 'ok' if local_original else 'no_image',
        'crop_status': 'pending' if local_original else 'no_source',
        'db_status': 'pending',
        'review_state': 'needs_review',
        'failure_reason': None,
        'imported_at': now_iso(),
    }
    return product, None


def discover_and_crawl(start_url=CATALOG_URL, max_pages=300):
    """BFS crawl to discover all product pages."""
    visited = set()
    to_visit = collections.deque([start_url])
    product_urls = []
    category_urls = []
    failed = {}

    while to_visit and len(visited) < max_pages:
        url = to_visit.popleft()
        if url in visited:
            continue
        if any(s in url for s in SKIP_URL_FRAGMENTS):
            continue
        visited.add(url)

        html, err = fetch_html(url)
        if not html:
            failed[url] = err or 'unknown'
            continue

        if is_product_page(html, url):
            product_urls.append(url)
        else:
            category_urls.append(url)

        # Find more internal links
        links = re.findall(
            r'href=["\']('
            r'https?://www\.asclean\.co\.il/catalog-safety-equipment/[^"\'#\s]*'
            r')["\']',
            html
        )
        for link in links:
            link = link.rstrip('/')  + '/'
            if link not in visited and not any(s in link for s in SKIP_URL_FRAGMENTS):
                to_visit.appendleft(link)

        time.sleep(0.4)

    return product_urls, category_urls, visited, failed


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample', metavar='URL', help='Test a single product URL')
    parser.add_argument('--resume', action='store_true', help='Skip already-scraped item_ids from existing output')
    args = parser.parse_args()

    manifest = load_manifest()
    all_products = []
    already_scraped_ids = set()

    # Resume: load existing output and skip already-done items
    if args.resume and os.path.exists(OUTPUT_JSON):
        with open(OUTPUT_JSON, 'r', encoding='utf-8') as f:
            existing = json.load(f)
        all_products = existing.get('products', [])
        already_scraped_ids = {p['item_id'] for p in all_products}
        print(f"[resume] Found {len(all_products)} existing products — will skip these item_ids")

    report = {
        'run_at': now_iso(),
        'pages_visited': 0,
        'category_pages': 0,
        'product_pages': 0,
        'products_extracted': 0,
        'images_downloaded': 0,
        'specs_downloaded': 0,
        'failures': [],
    }

    if args.sample:
        # Test mode: scrape a single URL
        url = args.sample.rstrip('/') + '/'
        url_parts = url_to_folder_path(url)
        print(f"\n[SAMPLE MODE] Scraping: {url}")
        print(f"  URL parts: {url_parts}")
        product, err = scrape_product_page(url, url_parts, manifest)
        if err:
            print(f"  ERROR: {err}")
            sys.exit(1)
        print(f"\n  Title: {product['product_name']}")
        print(f"  Category: {product['catalog_category']}")
        print(f"  Specs ({len(product['spec_variants'])} variants):")
        for i, sv in enumerate(product['spec_variants']):
            print(f"    Variant {i+1}:")
            for k, v in sv.items():
                print(f"      {k}: {v}")
        print(f"  Images found: {len(product['image_urls_found'])}")
        print(f"  Images downloaded: {sum(1 for d in product['images_downloaded'] if d['local'])}")
        print(f"  PDFs: {product['pdf_urls']}")
        print(f"  Local original: {product['local_original']}")
        print(f"  Features: {product['features'][:3]}")
        # Save sample output
        sample_out = os.path.join(ASCLEAN_DIR, 'sample-extraction.json')
        os.makedirs(ASCLEAN_DIR, exist_ok=True)
        with open(sample_out, 'w', encoding='utf-8') as f:
            json.dump(product, f, ensure_ascii=False, indent=2)
        print(f"\n  Full extraction saved to: {sample_out}")
        save_manifest(manifest)
        return

    # Full crawl
    print(f"[crawl] Starting from {CATALOG_URL}")
    product_urls, category_urls, visited, failed = discover_and_crawl()
    print(f"  Visited: {len(visited)}, Categories: {len(category_urls)}, Products: {len(product_urls)}")
    print(f"  Failed: {len(failed)}")

    report['pages_visited'] = len(visited)
    report['category_pages'] = len(category_urls)
    report['product_pages'] = len(product_urls)

    # Scrape each product page
    print(f"\n[extract] Scraping {len(product_urls)} product pages...")
    for i, url in enumerate(product_urls):
        url_parts = url_to_folder_path(url)
        item_id = 'ext-asc-' + '-'.join(url_parts).replace('/', '-')[:80]
        if item_id in already_scraped_ids:
            print(f"  [{i+1}/{len(product_urls)}] [skip] {url}")
            continue
        print(f"  [{i+1}/{len(product_urls)}] {url}")
        product, err = scrape_product_page(url, url_parts, manifest)
        if err:
            print(f"    ERROR: {err}")
            failed[url] = err
            report['failures'].append({'url': url, 'reason': err})
        else:
            img_count = sum(1 for d in product['images_downloaded'] if d['local'])
            spec_count = len(product['specs_downloaded'])
            print(f"    OK: {product['product_name'][:50]} | imgs={img_count} | specs={spec_count} | variants={len(product['spec_variants'])}")
            all_products.append(product)
            report['images_downloaded'] += img_count
            report['specs_downloaded'] += spec_count
        time.sleep(0.3)

    report['products_extracted'] = len(all_products)

    # Save output
    os.makedirs(ASCLEAN_DIR, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump({'products': all_products, 'report': report}, f, ensure_ascii=False, indent=2)

    with open(FAILED_LOG, 'w', encoding='utf-8') as f:
        json.dump(failed, f, ensure_ascii=False, indent=2)

    save_manifest(manifest)

    print(f"\n{'='*60}")
    print(f"✓ Asclean deep scrape complete")
    print(f"  Pages visited:      {report['pages_visited']}")
    print(f"  Category pages:     {report['category_pages']}")
    print(f"  Product pages:      {report['product_pages']}")
    print(f"  Products extracted: {report['products_extracted']}")
    print(f"  Images downloaded:  {report['images_downloaded']}")
    print(f"  Specs downloaded:   {report['specs_downloaded']}")
    print(f"  Failures:           {len(failed)}")
    print(f"  Output: {OUTPUT_JSON}")


if __name__ == '__main__':
    main()
