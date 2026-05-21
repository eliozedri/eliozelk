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
    from PIL import Image
except ImportError:
    print("ERROR: Pillow not installed. Run: pip3 install Pillow")
    sys.exit(1)

PUBLIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')
CATALOG_DIR = os.path.join(PUBLIC_DIR, 'catalog')

THUMB_SIZE = (400, 400)
FULL_SIZE  = (800, 800)

SKIP_DIRS = {'safety', 'safety 2'}


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
    Returns (cropped_image, status).
    """
    rgb = img.convert('RGB')
    w, h = rgb.size
    pixels = rgb.load()

    top_row    = [pixels[x, 0]   for x in range(w)]
    bottom_row = [pixels[x, h-1] for x in range(w)]

    if not (is_solid_color(top_row) and is_solid_color(bottom_row)):
        return img, 'conservative'

    top = 0
    for y in range(h):
        row = [pixels[x, y] for x in range(w)]
        if not is_solid_color(row):
            top = y
            break

    bottom = h - 1
    for y in range(h - 1, -1, -1):
        row = [pixels[x, y] for x in range(w)]
        if not is_solid_color(row):
            bottom = y
            break

    left = 0
    for x in range(w):
        col = [pixels[x, y] for y in range(h)]
        if not is_solid_color(col):
            left = x
            break

    right = w - 1
    for x in range(w - 1, -1, -1):
        col = [pixels[x, y] for y in range(h)]
        if not is_solid_color(col):
            right = x
            break

    content_w = right - left
    content_h = bottom - top

    if content_w < w * 0.1 or content_h < h * 0.1:
        return img, 'needs_review'

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

            os.makedirs(os.path.dirname(thumb_path), exist_ok=True)
            thumb = make_square(cropped, THUMB_SIZE)
            thumb.save(thumb_path, 'WEBP', quality=85, method=6)

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
        parts = root.replace(catalog_dir, '').split(os.sep)
        if any(p in SKIP_DIRS for p in parts):
            continue
        if os.path.basename(root) == 'original':
            parent = os.path.dirname(root)
            for fname in files:
                if fname.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')):
                    orig_path = os.path.join(root, fname)
                    stem = os.path.splitext(fname)[0]
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

    public_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'public'))

    for orig_path, thumb_path, proc_path in originals:
        rel_orig  = os.path.normpath(orig_path).replace(public_dir, '')
        rel_thumb = os.path.normpath(thumb_path).replace(public_dir, '')
        rel_proc  = os.path.normpath(proc_path).replace(public_dir, '')

        print(f"  crop: {rel_orig}")
        status = process_image(orig_path, thumb_path, proc_path)

        if status in ('ok', 'conservative'):
            ok_count += 1
        elif status == 'needs_review':
            review_count += 1
        else:
            error_count += 1

        print(f"    → {status}")

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
