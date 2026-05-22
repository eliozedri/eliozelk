#!/usr/bin/env python3
"""
Targeted re-extraction of Asclean URLs missed by the first deep crawl.
Reads completeness-audit.json, filters out non-product URLs, scrapes the rest,
and merges the new products into scraped-products-deep.json.

Skips:
  - installation-instructions/* (how-to, not products)
  - feed/, /catalog-safety-equipment/ (root)
  - URLs with no elementor-price-list-title (not actual product pages)

Idempotent: products with item_id already in the deep JSON are skipped.

Run:
  SCRAPER_PROXY_URL=...  SCRAPER_PROXY_SECRET=... \
  python3 scripts/scrape_asclean_targeted.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))

# Import the deep scraper's helpers (re-uses fetch_html, scrape_product_page, etc.)
import scrape_asclean_deep as base  # noqa: E402

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASCLEAN_DIR  = os.path.join(PROJECT_ROOT, 'public', 'catalog', 'supplier', 'asclean')
AUDIT_JSON   = os.path.join(ASCLEAN_DIR, 'completeness-audit.json')
DEEP_JSON    = os.path.join(ASCLEAN_DIR, 'scraped-products-deep.json')

SKIP_PATTERNS = (
    '/installation-instructions/',
    '/feed/',
    '/catalog-safety-equipment/?$',  # root
)


def is_skip(url):
    if url.rstrip('/').endswith('/catalog-safety-equipment'):
        return True
    if '/installation-instructions/' in url:
        return True
    if url.endswith('/feed/') or url.endswith('/feed'):
        return True
    return False


def main():
    if not os.path.exists(AUDIT_JSON):
        print(f"❌ audit report not found: {AUDIT_JSON}")
        print("  Run scripts/audit_asclean_completeness.py first.")
        sys.exit(1)

    with open(AUDIT_JSON, 'r', encoding='utf-8') as f:
        audit = json.load(f)
    candidates = audit.get('newly_discovered', [])
    print(f"Audit reports {len(candidates)} newly-discovered URLs.")

    # Filter to likely-product URLs
    targets = [u for u in candidates if not is_skip(u)]
    print(f"After skip filter: {len(targets)} targets to probe.\n")

    # Load existing products + dedup ids
    with open(DEEP_JSON, 'r', encoding='utf-8') as f:
        deep = json.load(f)
    existing_ids = {p['item_id'] for p in deep['products']}
    manifest     = base.load_manifest()

    new_products       = []
    skipped_not_prod   = []
    skipped_already    = []
    failed             = []

    for i, url in enumerate(targets, 1):
        url_norm = url.rstrip('/') + '/'
        url_parts = base.url_to_folder_path(url_norm)
        item_id   = 'ext-asc-' + '-'.join(url_parts).replace('/', '-')[:80]

        if item_id in existing_ids:
            skipped_already.append(url)
            print(f"  [{i}/{len(targets)}] [done] {url}")
            continue

        print(f"  [{i}/{len(targets)}] probing {url}")

        # First fetch to check if it's actually a product page
        html, err = base.fetch_html(url_norm)
        if not html:
            failed.append({'url': url, 'err': err})
            print(f"    FAIL: {err}")
            continue

        if not base.is_product_page(html, url_norm):
            skipped_not_prod.append(url)
            print(f"    [skip] not a product page (no spec widget)")
            continue

        # Extract the product
        product, err = base.scrape_product_page(url_norm, url_parts, manifest)
        if err or not product:
            failed.append({'url': url, 'err': err or 'no product'})
            print(f"    FAIL: {err}")
            continue

        new_products.append(product)
        existing_ids.add(item_id)
        imgs_ok = sum(1 for d in product.get('images_downloaded', []) if d.get('local'))
        print(f"    OK: {product['product_name'][:50]} | imgs={imgs_ok} | variants={len(product.get('spec_variants', []))}")

    print()
    print("=" * 60)
    print("TARGETED RE-EXTRACTION RESULTS")
    print("=" * 60)
    print(f"  New products extracted:    {len(new_products)}")
    print(f"  Already in deep JSON:      {len(skipped_already)}")
    print(f"  URLs that aren't products: {len(skipped_not_prod)}")
    print(f"  Failed:                    {len(failed)}")

    if new_products:
        # Append to deep JSON
        deep['products'].extend(new_products)
        # Update report
        rpt = deep.get('report', {})
        rpt['products_extracted'] = len(deep['products'])
        rpt['second_pass_at']     = __import__('datetime').datetime.utcnow().isoformat() + 'Z'
        rpt['second_pass_added']  = len(new_products)
        deep['report'] = rpt
        with open(DEEP_JSON, 'w', encoding='utf-8') as f:
            json.dump(deep, f, ensure_ascii=False, indent=2)
        print(f"\n✓ Appended {len(new_products)} products to {DEEP_JSON}")
        print(f"  Total products now: {len(deep['products'])}")

    if skipped_not_prod:
        print(f"\nNon-product URLs (saved for reference):")
        for u in skipped_not_prod[:20]:
            print(f"  {u}")

    if failed:
        print(f"\nFailures:")
        for f_ in failed:
            print(f"  {f_['url']} — {f_['err']}")

    base.save_manifest(manifest)


if __name__ == '__main__':
    main()
