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
            if len(data) < 1000:
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
    return 'road-marking'


def main():
    manifest = load_manifest()
    found = 0
    visited = set()

    pages_to_visit = list(PRODUCT_PAGES)

    home_html = fetch_html(BASE_URL + '/')
    if home_html:
        parser = ImageLinkParser()
        parser.feed(home_html)
        for href in parser.links:
            abs = abs_url(BASE_URL, href)
            if abs and BASE_URL in abs and abs not in visited:
                if any(k in abs for k in ['/product', '/service', '/catalog', '/about', '/gallery']):
                    pages_to_visit.append(abs)

    for page_url in pages_to_visit[:20]:
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
