#!/usr/bin/env python3
"""
Scrape elkayam.co.il for product/service pages, extract images, and save a
manifest the name-matcher can use to enrich active catalog_items rows.

Output: public/catalog/elkayam/scraped-pages.json
"""
import base64, json, os, re, sys, time, urllib.request

PROXY_URL = os.environ.get('SCRAPER_PROXY_URL', 'https://eliozelk.vercel.app/api/scrape-fetch')
SECRET    = os.environ.get('SCRAPER_PROXY_SECRET') or open('/tmp/scrape_secret.txt').read().strip()

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ELK_DIR      = os.path.join(PROJECT_ROOT, 'public', 'catalog', 'elkayam')
OUT_JSON     = os.path.join(ELK_DIR, 'scraped-pages.json')

SITE = 'https://elkayam.co.il'


def fetch(url, binary=False, retries=2):
    body = json.dumps({'secret': SECRET, 'url': url, 'binary': binary}).encode()
    for _ in range(retries + 1):
        try:
            req = urllib.request.Request(PROXY_URL, data=body, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read())
        except Exception as e:
            err = e
            time.sleep(2)
    return {'error': str(err)}


def parse_sitemap_locs(xml_text):
    return re.findall(r'<loc[^>]*>\s*([^<\s]+)\s*</loc>', xml_text)


def slugify(s):
    s = re.sub(r'[^\w\-]+', '-', s.lower().strip())
    return re.sub(r'-+', '-', s).strip('-')[:60]


def collect_sitemap_urls():
    print('Fetching sitemap_index ...')
    idx = fetch(f'{SITE}/sitemap_index.xml')
    if idx.get('status') != 200:
        print(f'  index failed: {idx}')
        return []
    sub_sitemaps = parse_sitemap_locs(idx.get('html', ''))
    all_urls = set()
    for sm in sub_sitemaps:
        print(f'  fetching {sm}')
        d = fetch(sm)
        if d.get('status') == 200:
            for u in parse_sitemap_locs(d.get('html', '')):
                if SITE in u and not u.endswith('.xml'):
                    all_urls.add(u.rstrip('/') + '/')
    return sorted(all_urls)


def extract_page_info(html, url):
    # Title from H1 or OG
    h1 = re.search(r'<h1[^>]*>\s*(.*?)\s*</h1>', html, re.S | re.I)
    title = ''
    if h1:
        title = re.sub(r'<[^>]+>', '', h1.group(1)).strip()
    if not title:
        og = re.search(r'<meta property="og:title" content="([^"]+)"', html)
        if og:
            title = og.group(1).strip()
    # Strip Elkayam suffix
    title = re.sub(r'\s*[-|]\s*אלקיים.*$', '', title)
    title = re.sub(r'\s*[-|]\s*Elkayam.*$', '', title, flags=re.I)

    # Description from meta
    desc = ''
    m = re.search(r'<meta name="description" content="([^"]+)"', html)
    if m:
        desc = m.group(1).strip()

    # H2 sections as topic hints
    h2s = [re.sub(r'<[^>]+>', '', h).strip() for h in re.findall(r'<h2[^>]*>(.*?)</h2>', html, re.S | re.I)]
    h2s = [h for h in h2s if h]

    # Images — exclude common chrome
    skip = ['logo', 'icon', 'favicon', 'placeholder', 'banner', 'header', 'footer',
            'whatsapp', 'phone', 'arrow', 'social', 'mailto', 'kefir', 'menu']
    imgs = set()
    for u in re.findall(r'(?:src|data-src|data-lazy-src)=["\']([^"\']*wp-content/uploads/[^"\']+\.(?:jpg|jpeg|png|webp))', html, re.I):
        u = u.split('?')[0]
        # Drop WP size suffix to prefer full
        u = re.sub(r'-\d+x\d+(\.[^.]+)$', r'\1', u)
        if any(p in u.lower() for p in skip):
            continue
        imgs.add(u)
    # OG image is usually the headline image — keep it ordered first
    og_img = None
    m = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    if m:
        og_img = m.group(1).split('?')[0]
        imgs.discard(og_img)

    image_list = ([og_img] if og_img else []) + sorted(imgs)
    return {
        'url': url,
        'title': title,
        'description': desc,
        'h2_sections': h2s[:10],
        'images': image_list[:8],
    }


def download_image(url, dest):
    if os.path.exists(dest):
        return True
    d = fetch(url, binary=True)
    if d.get('error') or d.get('status', 0) >= 400:
        return False
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'wb') as f:
            f.write(base64.b64decode(d.get('data_b64', '')))
        return True
    except Exception as e:
        print(f'    save fail: {e}')
        return False


def main():
    urls = collect_sitemap_urls()
    print(f'\nFound {len(urls)} sitemap URLs total.')

    # Keep only HTML pages (skip uploads, feeds, etc.)
    keep = []
    for u in urls:
        low = u.lower()
        if any(x in low for x in ['/feed/', '/wp-json/', '/wp-content/', '/?', '/page/2']):
            continue
        keep.append(u)
    print(f'After filter: {len(keep)} candidate HTML pages.\n')

    out_pages = []
    images_dl = 0
    for i, u in enumerate(keep, 1):
        print(f'  [{i}/{len(keep)}] {u}')
        d = fetch(u)
        if d.get('status') != 200:
            print(f'    skip: status={d.get("status")}')
            continue
        info = extract_page_info(d.get('html', ''), u)
        if not info['title']:
            continue

        # Download first 3 images
        slug = slugify(info['title']) or slugify(u.rstrip('/').split('/')[-1] or 'page')
        downloaded = []
        for idx, img_url in enumerate(info['images'][:3]):
            ext = (os.path.splitext(img_url)[-1] or '.jpg').lower()
            if ext not in ('.jpg', '.jpeg', '.png', '.webp'):
                ext = '.jpg'
            suffix = '' if idx == 0 else f'-{idx+1}'
            dest = os.path.join(ELK_DIR, 'website', 'original', f'{slug}{suffix}{ext}')
            ok = download_image(img_url, dest)
            if ok:
                rel = f'/catalog/elkayam/website/original/{slug}{suffix}{ext}'
                downloaded.append({'remote': img_url, 'local': rel})
                images_dl += 1

        info['local_images'] = downloaded
        info['slug'] = slug
        out_pages.append(info)

    os.makedirs(ELK_DIR, exist_ok=True)
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump({'pages': out_pages, 'count': len(out_pages), 'images_downloaded': images_dl}, f, ensure_ascii=False, indent=2)

    print(f'\n✓ Done. {len(out_pages)} pages with content, {images_dl} images downloaded.')
    print(f'  → {OUT_JSON}')


if __name__ == '__main__':
    main()
