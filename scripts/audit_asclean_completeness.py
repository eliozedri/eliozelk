#!/usr/bin/env python3
"""
Reverse-audit Asclean scrape completeness.
Compares:
  - post-sitemap.xml + page-sitemap.xml + category-sitemap.xml URLs
  - already-imported URLs in scraped-products-deep.json
  - WordPress REST API pages list (catch posts that aren't in sitemaps)
Reports newly-found, missing, and overlap.

Reads the Vercel proxy URL/secret from env or /tmp/scrape_secret.txt.
"""
import json, os, re, sys, urllib.request, urllib.parse
from collections import defaultdict

PROXY_URL = os.environ.get('SCRAPER_PROXY_URL', 'https://eliozelk.vercel.app/api/scrape-fetch')
SECRET    = os.environ.get('SCRAPER_PROXY_SECRET') or open('/tmp/scrape_secret.txt').read().strip()

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEEP_JSON    = os.path.join(PROJECT_ROOT, 'public', 'catalog', 'supplier', 'asclean', 'scraped-products-deep.json')
REPORT_JSON  = os.path.join(PROJECT_ROOT, 'public', 'catalog', 'supplier', 'asclean', 'completeness-audit.json')
REPORT_MD    = os.path.join(PROJECT_ROOT, 'public', 'catalog', 'supplier', 'asclean', 'completeness-audit.md')

CATALOG_PREFIX = 'https://www.asclean.co.il/catalog-safety-equipment/'


def fetch(url, binary=False):
    body = json.dumps({'secret': SECRET, 'url': url, 'binary': binary}).encode()
    req = urllib.request.Request(PROXY_URL, data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read())


def parse_sitemap_urls(xml_text):
    """Extract <loc> URLs from any sitemap (sub-sitemaps OR url lists)."""
    return re.findall(r'<loc[^>]*>\s*([^<\s]+)\s*</loc>', xml_text)


def fetch_sitemap_all():
    """Return list of all catalog-safety-equipment URLs across all sub-sitemaps."""
    all_urls = set()
    sitemap_breakdown = {}

    index = fetch('https://www.asclean.co.il/sitemap_index.xml')
    if index.get('status') != 200:
        print(f"  sitemap index failed: {index}", file=sys.stderr)
        return all_urls, sitemap_breakdown

    sub_sitemaps = parse_sitemap_urls(index.get('html', ''))
    print(f"  sub-sitemaps found: {len(sub_sitemaps)}")
    for sm_url in sub_sitemaps:
        print(f"  fetching {sm_url} ...")
        d = fetch(sm_url)
        if d.get('status') != 200:
            print(f"    failed: status={d.get('status')}")
            continue
        urls = parse_sitemap_urls(d.get('html', ''))
        cat_urls = [u for u in urls if CATALOG_PREFIX in u]
        sitemap_breakdown[sm_url] = {
            'total': len(urls),
            'catalog': len(cat_urls),
            'sample': cat_urls[:5],
        }
        for u in cat_urls:
            all_urls.add(u.rstrip('/') + '/')
        print(f"    {len(urls)} urls, {len(cat_urls)} in catalog-safety-equipment")

    return all_urls, sitemap_breakdown


def fetch_wp_pages(per_page=100, max_pages=20):
    """Page through /wp-json/wp/v2/pages and collect catalog-safety-equipment links."""
    all_urls = set()
    page = 1
    while page <= max_pages:
        url = f'https://www.asclean.co.il/wp-json/wp/v2/pages?per_page={per_page}&page={page}'
        d = fetch(url)
        if d.get('status') == 400 and page > 1:
            break  # WP returns 400 when page exceeds total
        if d.get('status') != 200:
            print(f"    wp-json page {page} failed: status={d.get('status')}")
            break
        try:
            pages = json.loads(d.get('html', '[]'))
        except json.JSONDecodeError:
            break
        if not pages:
            break
        for p in pages:
            link = p.get('link', '')
            if CATALOG_PREFIX in link:
                all_urls.add(link.rstrip('/') + '/')
        print(f"    page {page}: {len(pages)} pages → catalog hits cumulative: {len(all_urls)}")
        if len(pages) < per_page:
            break
        page += 1
    return all_urls


def load_already_imported():
    if not os.path.exists(DEEP_JSON):
        return set(), []
    with open(DEEP_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    products = data.get('products', [])
    urls = {p['source_url'].rstrip('/') + '/' for p in products if p.get('source_url')}
    return urls, products


def main():
    print("Phase 1: Sitemap recon ...")
    sitemap_urls, sitemap_breakdown = fetch_sitemap_all()
    print(f"  → {len(sitemap_urls)} unique catalog URLs from sitemaps\n")

    print("Phase 2: WP REST API pages enumeration ...")
    wp_urls = fetch_wp_pages()
    print(f"  → {len(wp_urls)} unique catalog URLs from WP REST\n")

    print("Phase 3: Loading already-imported URLs ...")
    imported_urls, products = load_already_imported()
    print(f"  → {len(imported_urls)} already imported (from {len(products)} extracted products)\n")

    all_discovered = sitemap_urls | wp_urls
    missing = sorted(all_discovered - imported_urls)
    only_in_imported = sorted(imported_urls - all_discovered)
    overlap = sorted(all_discovered & imported_urls)

    print("=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"Sitemap URLs (catalog-safety-equipment/*):  {len(sitemap_urls)}")
    print(f"WP REST URLs (catalog-safety-equipment/*):  {len(wp_urls)}")
    print(f"Union (independent discovery):              {len(all_discovered)}")
    print(f"Already imported:                           {len(imported_urls)}")
    print(f"Overlap (imported & discovered):            {len(overlap)}")
    print(f"NEWLY DISCOVERED (not imported):            {len(missing)}")
    print(f"In imported but not in discovery:           {len(only_in_imported)}")

    if missing:
        print(f"\n--- Newly discovered URLs (first 30 of {len(missing)}) ---")
        for u in missing[:30]:
            print(f"  {u}")
        if len(missing) > 30:
            print(f"  ... and {len(missing) - 30} more")

    if only_in_imported:
        print(f"\n--- URLs we imported but NOT in any sitemap/WP feed (first 10) ---")
        for u in only_in_imported[:10]:
            print(f"  {u}")

    # Category-level analysis
    cat_count = defaultdict(int)
    cat_imported = defaultdict(int)
    for u in all_discovered:
        rel = u[len(CATALOG_PREFIX):].rstrip('/').split('/')
        if rel and rel[0]:
            cat_count[rel[0]] += 1
    for u in imported_urls:
        rel = u[len(CATALOG_PREFIX):].rstrip('/').split('/')
        if rel and rel[0]:
            cat_imported[rel[0]] += 1
    cats = sorted(cat_count.keys())
    print(f"\n--- Per top-category coverage ({len(cats)} categories) ---")
    for cat in cats:
        marker = '✓' if cat_imported[cat] == cat_count[cat] else '⚠'
        print(f"  {marker} {cat_imported[cat]:3d} / {cat_count[cat]:3d}  {cat}")

    # Save reports
    report = {
        'run_at': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'counts': {
            'sitemap_urls':       len(sitemap_urls),
            'wp_rest_urls':       len(wp_urls),
            'all_discovered':     len(all_discovered),
            'already_imported':   len(imported_urls),
            'overlap':            len(overlap),
            'newly_discovered':   len(missing),
            'only_in_imported':   len(only_in_imported),
        },
        'sitemap_breakdown':   sitemap_breakdown,
        'newly_discovered':    missing,
        'only_in_imported':    only_in_imported,
        'per_category':        {c: {'discovered': cat_count[c], 'imported': cat_imported[c]} for c in cats},
    }
    os.makedirs(os.path.dirname(REPORT_JSON), exist_ok=True)
    with open(REPORT_JSON, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Report saved to: {REPORT_JSON}")

    # Markdown summary
    md = ["# Asclean Completeness Audit", ""]
    md.append(f"_Generated {report['run_at']}_")
    md.append("")
    md.append("## Counts")
    for k, v in report['counts'].items():
        md.append(f"- **{k}**: {v}")
    md.append("\n## Per-category coverage")
    md.append("| Category | Imported | Discovered | Gap |")
    md.append("|---|---|---|---|")
    for cat in cats:
        gap = cat_count[cat] - cat_imported[cat]
        flag = '⚠ MISSING' if gap > 0 else '✓'
        md.append(f"| {cat} | {cat_imported[cat]} | {cat_count[cat]} | {gap} {flag} |")
    if missing:
        md.append(f"\n## Newly discovered URLs ({len(missing)})")
        for u in missing:
            md.append(f"- {u}")
    with open(REPORT_MD, 'w', encoding='utf-8') as f:
        f.write('\n'.join(md))
    print(f"✓ Markdown saved to: {REPORT_MD}")


if __name__ == '__main__':
    main()
