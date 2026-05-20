#!/usr/bin/env python3
"""
18_element_decomposition.py
POC E (Stage K) — Interactive Plan Decomposition and Element Filtering

Groups ALL PDF vector paths by color signature and classifies each group:
  include  — execution-relevant (signs, poles, guardrails, markings, …)
  ignore   — background/noise (white fills, black fills, title block)
  review   — uncertain; needs human classification

Outputs (all research-only, approved_for_boq: false):
  outputs/element_groups.json
  outputs/element_groups_report.md
  outputs/element_groups_report.html
  outputs/element_decomposition/overlay_classified.png
"""
from __future__ import annotations
import argparse, json, time, math
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import pdfplumber

from plan_run_context import PlanRunContext

# ── Config ────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
PDF_PATH   = Path('/Users/eliozedri/Downloads/50-448-02-400.pdf')
PAGE_IDX   = 0
OUT_DIR    = SCRIPT_DIR / 'outputs' / 'element_decomposition'
OUT_JSON   = SCRIPT_DIR / 'outputs' / 'element_groups.json'
OUT_MD     = SCRIPT_DIR / 'outputs' / 'element_groups_report.md'
OUT_HTML   = SCRIPT_DIR / 'outputs' / 'element_groups_report.html'

DRAW_X_MAX  = 3900.0     # x >= this → title block zone
COLOR_TOL   = 0.015      # taxonomy matching tolerance
SIGN_GRAY   = 0.572549   # gray channel of sign-code glyphs
SIGN_GRAY_T = 0.025      # tolerance around sign gray
WHITE_FLOOR = 0.94       # all channels >= this → background white
BLACK_CEIL  = 0.06       # all channels <= this → road background / text
TOP_SAMPLES = 6          # bbox samples per group stored in JSON

# ── Color taxonomy (mirrors 15_scale_measurement.py) ─────────────────────
_TAX: Dict[Tuple, Dict] = {
    (1.0,   1.0,   0.0  ): {'type': 'guardrail',        'he': 'מעקה',               'boq': 'guardrail', 'conf': 'high'},
    (1.0,   0.702, 0.6  ): {'type': 'barrier_pink',     'he': 'גדר/מחסום ורוד',    'boq': 'barrier',   'conf': 'high'},
    (0.0,   0.0,   1.0  ): {'type': 'road_marking',     'he': 'סימון כביש כחול',   'boq': 'marking',   'conf': 'high'},
    (0.498, 1.0,   0.498): {'type': 'fence_green',      'he': 'גדר ירוקה',          'boq': 'fence',     'conf': 'high'},
    (1.0,   0.6,   0.2  ): {'type': 'marking_orange',   'he': 'סימון כתום',         'boq': 'marking',   'conf': 'medium'},
    (0.0,   0.498, 1.0  ): {'type': 'marking_mid_blue', 'he': 'סימון כחול בינוני',  'boq': 'marking',   'conf': 'high'},
    (0.8,   0.6,   1.0  ): {'type': 'marking_purple',   'he': 'סימון סגול',         'boq': 'other',     'conf': 'medium'},
    (1.0,   0.749, 0.0  ): {'type': 'marking_amber',    'he': 'סימון ענבר',         'boq': 'marking',   'conf': 'medium'},
    (0.0,   0.216, 0.867): {'type': 'marking_royal',    'he': 'סימון כחול כהה',    'boq': 'marking',   'conf': 'medium'},
    (1.0,   0.0,   0.0  ): {'type': 'red_element',      'he': 'סימון אדום',         'boq': 'marking',   'conf': 'medium'},
    (1.0,   0.247, 0.0  ): {'type': 'marking_vermilion','he': 'סימון ורמיליון',     'boq': 'marking',   'conf': 'high'},
}

def _match_tax(rgb: Tuple) -> Optional[Dict]:
    best_d, best = COLOR_TOL, None
    for ref, info in _TAX.items():
        d = max(abs(rgb[i] - ref[i]) for i in range(3))
        if d < best_d:
            best_d, best = d, info
    return best

# ── Path helpers ───────────────────────────────────────────────────────────

def _nc(v) -> float:
    return max(0.0, min(1.0, float(v)))

def get_rgb(obj) -> Optional[Tuple]:
    """Extract dominant RGB from pdfplumber object. Stroking preferred."""
    for field in ('stroking_color', 'non_stroking_color'):
        c = obj.get(field)
        if c is None:
            continue
        try:
            if isinstance(c, (int, float)):
                v = _nc(c); return (v, v, v)
            if len(c) == 1:
                v = _nc(c[0]); return (v, v, v)
            if len(c) == 3:
                return (_nc(c[0]), _nc(c[1]), _nc(c[2]))
            if len(c) == 4:  # CMYK
                C, M, Y, K = (_nc(x) for x in c)
                return ((1-C)*(1-K), (1-M)*(1-K), (1-Y)*(1-K))
        except (TypeError, IndexError):
            continue
    return None

def get_bbox(obj) -> Tuple[float,float,float,float]:
    """Return (x0, top, x1, bottom) in pdfplumber coords (y=0 at top)."""
    otype = obj.get('object_type', '')
    if otype == 'curve':
        pts = obj.get('pts', [])
        if pts:
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            return (min(xs), min(ys), max(xs), max(ys))
    x0  = obj.get('x0', 0.0)
    top = obj.get('top', obj.get('y0', 0.0))
    x1  = obj.get('x1', x0)
    bot = obj.get('bottom', obj.get('y1', top))
    return (x0, top, x1, bot)

def get_len(obj) -> float:
    """Approximate path length in PDF points."""
    otype = obj.get('object_type', '')
    if otype == 'curve':
        pts = obj.get('pts', [])
        s = 0.0
        for i in range(1, len(pts)):
            dx = pts[i][0]-pts[i-1][0]; dy = pts[i][1]-pts[i-1][1]
            s += math.sqrt(dx*dx + dy*dy)
        return max(s, 1.0)
    x0, top, x1, bot = get_bbox(obj)
    dx, dy = abs(x1-x0), abs(bot-top)
    if otype == 'rect':
        return 2*(dx+dy)
    return math.sqrt(dx*dx+dy*dy) or 1.0

def color_key(rgb: Tuple) -> str:
    """Return stable group key: taxonomy type name or rounded-rgb string."""
    tax = _match_tax(rgb)
    if tax:
        return tax['type']
    return f"{rgb[0]:.2f},{rgb[1]:.2f},{rgb[2]:.2f}"

def is_sign_gray(rgb: Tuple) -> bool:
    return all(abs(v - SIGN_GRAY) < SIGN_GRAY_T for v in rgb)

def is_white(rgb: Tuple) -> bool:
    return all(v >= WHITE_FLOOR for v in rgb)

def is_black(rgb: Tuple) -> bool:
    return all(v <= BLACK_CEIL for v in rgb)

def is_near_gray(rgb: Tuple, max_spread: float = 0.05) -> bool:
    r, g, b = rgb
    return max(abs(r-g), abs(g-b), abs(r-b)) < max_spread

# ── Extraction ─────────────────────────────────────────────────────────────

def extract_groups(page) -> Dict[str, Dict]:
    """Extract all vector paths, group by color key."""
    groups: Dict[str, Dict] = {}
    objs = list(page.curves) + list(page.lines) + list(page.rects)
    print(f"  Total objects: {len(objs):,}")

    for obj in objs:
        rgb = get_rgb(obj)
        if rgb is None:
            continue
        key = color_key(rgb)
        x0, top, x1, bot = get_bbox(obj)
        zone = 'title_block' if x0 >= DRAW_X_MAX else 'drawing_area'
        is_fill = bool(obj.get('fill', 0))
        length  = get_len(obj)

        if key not in groups:
            groups[key] = {'rgb': rgb, 'paths': [], 'n_fill': 0}
        groups[key]['paths'].append({
            'x0': round(x0, 1), 'top': round(top, 1),
            'x1': round(x1, 1), 'bot': round(bot, 1),
            'len': round(length, 1),
            'zone': zone, 'fill': is_fill,
        })
        if is_fill:
            groups[key]['n_fill'] += 1

    print(f"  Distinct color groups: {len(groups)}")
    return groups

# ── Classification ──────────────────────────────────────────────────────────

def classify(key: str, rgb: Tuple, n_paths: int, n_fill: int) -> Dict:
    """Return classification record for a color group."""
    tax = _match_tax(rgb)
    if tax:
        return {
            'cls': 'include', 'src': 'color_taxonomy',
            'etype': tax['type'],
            'he': tax['he'], 'en': tax['type'].replace('_', ' '),
            'boq': tax['boq'], 'conf': tax['conf'],
            'note': f"Matched color taxonomy (tol={COLOR_TOL}); confirmed in scale measurement pipeline",
        }
    if is_sign_gray(rgb):
        return {
            'cls': 'include', 'src': 'gray_hairline_rule',
            'etype': 'sign_glyph',
            'he': 'קוד תמרור — נתיב אפור', 'en': 'Sign code glyph (gray vector path)',
            'boq': 'sign_code', 'conf': 'high',
            'note': "Gray in sign-glyph range (POC 3 confirmed 165 digit paths in this color)",
        }
    if is_white(rgb):
        return {
            'cls': 'ignore', 'src': 'white_fill_rule',
            'etype': 'background_white',
            'he': 'מילוי לבן — רקע', 'en': 'White background fill',
            'boq': None, 'conf': 'high',
            'note': "Background fill; no BOQ relevance",
        }
    if is_black(rgb):
        fill_r = n_fill / max(n_paths, 1)
        if fill_r > 0.6:
            return {
                'cls': 'ignore', 'src': 'black_fill_rule',
                'etype': 'road_background',
                'he': 'גיאומטריה שחורה — רקע', 'en': 'Black fill — road geometry / background',
                'boq': None, 'conf': 'medium',
                'note': f"Mostly fills ({fill_r:.0%}); likely road background or text labels",
            }
        return {
            'cls': 'review', 'src': 'black_stroke_heuristic',
            'etype': 'black_stroke_unknown',
            'he': 'קווי שחור — זיהוי נדרש', 'en': 'Black stroke — identity unknown',
            'boq': None, 'conf': 'low',
            'note': f"Mixed fills ({fill_r:.0%}); may be road outlines, construction marks, or arrows",
        }
    if is_near_gray(rgb):
        return {
            'cls': 'review', 'src': 'near_gray_unmatched',
            'etype': 'gray_unknown',
            'he': 'אפור לא מזוהה', 'en': 'Near-gray — unmatched',
            'boq': None, 'conf': 'low',
            'note': "Gray tone outside sign-glyph range; not in taxonomy; needs human review",
        }
    return {
        'cls': 'review', 'src': 'unmatched_color',
        'etype': 'unknown_color',
        'he': 'צבע לא מזוהה', 'en': 'Unidentified color',
        'boq': None, 'conf': 'low',
        'note': f"Color not in taxonomy or heuristics (key={key}); human classification needed",
    }

# ── Build records ──────────────────────────────────────────────────────────

def build_records(groups: Dict[str, Dict]) -> List[Dict]:
    records = []
    sorted_groups = sorted(groups.items(), key=lambda kv: -len(kv[1]['paths']))

    for idx, (key, gd) in enumerate(sorted_groups):
        paths  = gd['paths']
        n      = len(paths)
        n_fill = gd['n_fill']
        rgb    = gd['rgb']

        n_draw  = sum(1 for p in paths if p['zone'] == 'drawing_area')
        n_title = sum(1 for p in paths if p['zone'] == 'title_block')
        total_len = sum(p['len'] for p in paths)
        draw_len  = sum(p['len'] for p in paths if p['zone'] == 'drawing_area')

        cls = classify(key, rgb, n, n_fill)

        # Override: majority in title block → ignore/title_block
        if n > 0 and n_title / n >= 0.8:
            cls.update({
                'cls': 'ignore', 'src': 'title_block_zone',
                'etype': 'title_block',
                'he': 'אלמנט כותרת תכנית', 'en': 'Title block element',
                'boq': None, 'conf': 'high',
                'note': f"≥80% of paths in title block zone (x≥{DRAW_X_MAX})",
            })

        records.append({
            'group_id':               f'G-{idx+1:03d}',
            'color_key':              key,
            'color_rgb_float':        [round(v, 4) for v in rgb],
            'color_rgb8':             [min(255, round(v*255)) for v in rgb],
            'n_paths':                n,
            'n_fill':                 n_fill,
            'n_stroke':               n - n_fill,
            'total_length_pt':        round(total_len, 1),
            'drawing_area_paths':     n_draw,
            'drawing_area_length_pt': round(draw_len, 1),
            'title_block_paths':      n_title,
            'zone_breakdown':         {'drawing_area': n_draw, 'title_block': n_title},
            'classification':         cls['cls'],
            'classification_source':  cls['src'],
            'element_type':           cls['etype'],
            'description_he':         cls['he'],
            'description_en':         cls['en'],
            'boq_category':           cls['boq'],
            'confidence':             cls['conf'],
            'requires_review':        cls['cls'] == 'review',
            'approved_for_boq':       False,
            'notes':                  cls['note'],
            'sample_bboxes':          [
                {'x0': p['x0'], 'top': p['top'], 'x1': p['x1'], 'bot': p['bot']}
                for p in paths[:TOP_SAMPLES]
            ],
        })

    return records

# ── Totals ─────────────────────────────────────────────────────────────────

def compute_totals(records: List[Dict]) -> Dict:
    inc = [r for r in records if r['classification'] == 'include']
    rev = [r for r in records if r['classification'] == 'review']
    ign = [r for r in records if r['classification'] == 'ignore']
    return {
        'total_groups':     len(records),
        'n_include_groups': len(inc),
        'n_review_groups':  len(rev),
        'n_ignore_groups':  len(ign),
        'total_paths':      sum(r['n_paths'] for r in records),
        'include_paths':    sum(r['n_paths'] for r in inc),
        'review_paths':     sum(r['n_paths'] for r in rev),
        'ignore_paths':     sum(r['n_paths'] for r in ign),
        'include_types':    [r['element_type'] for r in inc],
        'review_types':     [r['element_type'] for r in rev],
        'include_drawing_paths': sum(r['drawing_area_paths'] for r in inc),
        'review_drawing_paths':  sum(r['drawing_area_paths'] for r in rev),
    }

# ── Visual overlay ──────────────────────────────────────────────────────────

def render_overlay(groups: Dict[str, Dict], records: List[Dict],
                   pw: float, ph: float) -> Optional[Path]:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("  [Overlay] PIL not available — skipping")
        return None

    key_to_rec = {r['color_key']: r for r in records}
    SCALE = 0.20
    W, H = max(1, int(pw * SCALE)), max(1, int(ph * SCALE))
    img = Image.new('RGB', (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img, 'RGBA')

    # RGBA colors per classification
    FILL = {
        'include': (34,  197,  94,  210),   # green
        'review':  (251, 146,  60,  210),   # orange
        'ignore':  (200, 200, 200,   60),   # pale gray
    }
    SKIP_TYPES = {'background_white'}

    for layer in ('ignore', 'review', 'include'):
        fc = FILL[layer]
        for key, gd in groups.items():
            rec = key_to_rec.get(key)
            if rec is None or rec['classification'] != layer:
                continue
            if rec['element_type'] in SKIP_TYPES:
                continue
            for p in gd['paths']:
                x0 = int(p['x0'] * SCALE); y0 = int(p['top'] * SCALE)
                x1 = max(x0+1, int(p['x1'] * SCALE))
                y1 = max(y0+1, int(p['bot'] * SCALE))
                draw.rectangle([x0, y0, x1, y1], fill=fc)

    # Legend (top-left)
    lx, ly = 8, 8
    for label, (r, g, b, _) in FILL.items():
        draw.rectangle([lx, ly, lx+14, ly+12], fill=(r, g, b, 255), outline=(0,0,0,255))
        draw.text((lx+18, ly), label, fill=(0, 0, 0))
        ly += 16

    # Title block separator
    tx = int(DRAW_X_MAX * SCALE)
    draw.line([(tx, 0), (tx, H)], fill=(180, 0, 0), width=1)

    out = OUT_DIR / 'overlay_classified.png'
    img.save(str(out))
    print(f"  [Overlay] {out.name}  ({W}×{H}px)")
    return out

# ── HTML report ────────────────────────────────────────────────────────────

def _swatch(rgb8: List[int]) -> str:
    r, g, b = rgb8
    return (f'<span style="display:inline-block;width:16px;height:16px;'
            f'background:rgb({r},{g},{b});border:1px solid #aaa;'
            f'vertical-align:middle;margin-right:4px"></span>')

def _badge(cls: str) -> str:
    BG = {'include': '#15803d', 'review': '#b45309', 'ignore': '#6b7280'}
    c = BG.get(cls, '#999')
    return (f'<span style="background:{c};color:#fff;padding:1px 7px;'
            f'border-radius:3px;font-size:11px">{cls.upper()}</span>')

def _table_rows(recs: List[Dict]) -> str:
    out = ''
    for r in recs:
        rr = '⚠' if r['requires_review'] else '✓'
        note_esc = r['notes'].replace('"', '&quot;')
        out += (
            f'<tr>'
            f'<td>{r["group_id"]}</td>'
            f'<td>{_swatch(r["color_rgb8"])}</td>'
            f'<td><strong>{r["description_he"]}</strong></td>'
            f'<td>{r["description_en"]}</td>'
            f'<td><code>{r["element_type"]}</code></td>'
            f'<td>{_badge(r["classification"])}</td>'
            f'<td>{r["drawing_area_paths"]:,}</td>'
            f'<td>{r["drawing_area_length_pt"]:,.0f}</td>'
            f'<td>{r["confidence"]}</td>'
            f'<td title="{note_esc}">{rr}</td>'
            f'</tr>\n'
        )
    return out

def _section(title: str, recs: List[Dict], color: str) -> str:
    if not recs:
        return ''
    thead = ('<thead><tr>'
             '<th>ID</th><th>Color</th><th>Hebrew</th><th>English</th>'
             '<th>Type</th><th>Class</th><th>Drawing paths</th>'
             '<th>Length (pt)</th><th>Conf</th><th>Review</th>'
             '</tr></thead>')
    return (f'<h2 style="color:{color};margin-top:28px">'
            f'{title} ({len(recs)} groups)</h2>\n'
            f'<table>{thead}<tbody>{_table_rows(recs)}</tbody></table>\n')

def build_html(records: List[Dict], totals: Dict) -> str:
    inc = [r for r in records if r['classification'] == 'include']
    rev = [r for r in records if r['classification'] == 'review']
    ign = [r for r in records if r['classification'] == 'ignore']

    cards = (
        f'<div class="card"><div class="num" style="color:#1e3a5f">{totals["total_groups"]}</div>Groups total</div>'
        f'<div class="card"><div class="num" style="color:#15803d">{totals["n_include_groups"]}</div>Include</div>'
        f'<div class="card"><div class="num" style="color:#b45309">{totals["n_review_groups"]}</div>Review</div>'
        f'<div class="card"><div class="num" style="color:#6b7280">{totals["n_ignore_groups"]}</div>Ignore</div>'
        f'<div class="card"><div class="num">{totals["total_paths"]:,}</div>Total paths</div>'
        f'<div class="card"><div class="num" style="color:#15803d">{totals["include_paths"]:,}</div>Include paths</div>'
        f'<div class="card"><div class="num" style="color:#b45309">{totals["review_paths"]:,}</div>Review paths</div>'
    )

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Element Decomposition — {PDF_PATH.stem}</title>
<style>
  body {{font-family: system-ui, sans-serif; margin: 20px; background: #f9fafb;}}
  h1 {{color: #1e3a5f;}}
  table {{border-collapse: collapse; width: 100%; background: #fff; margin-top: 8px; font-size: 13px;}}
  th, td {{border: 1px solid #e5e7eb; padding: 5px 10px;}}
  th {{background: #f1f5f9; font-weight: 600; text-align: left;}}
  tr:hover {{background: #f0f9ff;}}
  .card {{display: inline-block; background: #fff; border: 2px solid #e5e7eb;
           border-radius: 8px; padding: 10px 18px; margin: 4px; text-align: center;}}
  .num {{font-size: 26px; font-weight: bold;}}
  img {{max-width: 100%; border: 1px solid #e5e7eb; margin-top: 10px; border-radius: 4px;}}
  code {{background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 12px;}}
  em {{color: #dc2626;}}
</style>
</head>
<body>
<h1>Element Decomposition — {PDF_PATH.stem}</h1>
<p>POC E / Stage K &nbsp;|&nbsp; Interactive Plan Decomposition and Element Filtering<br>
<em>Research-only. Not approved BOQ data. All classifications provisional.</em></p>

<div style="margin: 16px 0">{cards}</div>

<h2>Classified Overlay</h2>
<p style="color:#555;font-size:13px">
  <span style="color:#22c55e">&#9632;</span> Green = include &nbsp;|&nbsp;
  <span style="color:#f97316">&#9632;</span> Orange = review &nbsp;|&nbsp;
  <span style="color:#c8c8c8">&#9632;</span> Gray = ignore &nbsp;|&nbsp;
  White fills hidden for clarity &nbsp;|&nbsp;
  Red vertical line = title block boundary (x={DRAW_X_MAX:.0f}pt)
</p>
<img src="element_decomposition/overlay_classified.png" alt="Classified overlay">

{_section("✅ Include — Execution-Relevant", inc, "#15803d")}
{_section("⚠ Review — Needs Human Classification", rev, "#b45309")}
{_section("✗ Ignore — Background / Title Block", ign, "#6b7280")}

<hr style="margin-top:32px">
<p style="color:#9ca3af;font-size:11px">
  Generated by 18_element_decomposition.py &nbsp;|&nbsp;
  Pipeline: research/cad-pdf-intelligence/ &nbsp;|&nbsp;
  REMINDER: approved_for_boq=false on all groups. Requires human validation.
</p>
</body></html>'''

# ── Markdown report ────────────────────────────────────────────────────────

def build_md(records: List[Dict], totals: Dict) -> str:
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    lines = [
        f"# Element Decomposition Report — {PDF_PATH.stem}",
        f"POC E / Stage K — {ts}",
        "",
        "**Research-only. Not approved BOQ data.**",
        "",
        "## Summary",
        "| Metric | Value |",
        "|---|---|",
        f"| Total color groups | {totals['total_groups']} |",
        f"| Include groups | {totals['n_include_groups']} |",
        f"| Review groups | {totals['n_review_groups']} |",
        f"| Ignore groups | {totals['n_ignore_groups']} |",
        f"| Total paths | {totals['total_paths']:,} |",
        f"| Include paths (drawing area) | {totals['include_drawing_paths']:,} |",
        f"| Review paths (drawing area) | {totals['review_drawing_paths']:,} |",
        "",
        "## All Groups",
        "",
        "| ID | Type | Description (HE) | Class | Drawing paths | Length (pt) | Conf |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in records:
        lines.append(
            f"| {r['group_id']} | `{r['element_type']}` | {r['description_he']} | "
            f"**{r['classification'].upper()}** | {r['drawing_area_paths']:,} | "
            f"{r['drawing_area_length_pt']:,.0f} | {r['confidence']} |"
        )
    lines += [
        "",
        "## Include Types",
        ", ".join(totals['include_types']),
        "",
        "## Review Types",
        ", ".join(totals['review_types']),
        "",
        "## System Flags",
        "- Scale unverified — all lengths in PDF points (not meters)",
        "- `approved_for_boq: false` on every group",
        "- Classification heuristics require human validation",
        "- White background fills excluded from overlay for clarity",
        "",
        "## Outputs",
        f"- `{OUT_JSON}`",
        f"- `{OUT_MD}`",
        f"- `{OUT_HTML}`",
        f"- `{OUT_DIR}/overlay_classified.png`",
    ]
    return "\n".join(lines)

# ── Main ───────────────────────────────────────────────────────────────────

def main():
    t0 = time.time()
    print("=" * 60)
    print("POC E (Stage K) — Interactive Plan Decomposition")
    print("18_element_decomposition.py")
    print("=" * 60)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n[Load] {PDF_PATH.name}")
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        page = pdf.pages[PAGE_IDX]
        pw, ph = page.width, page.height
        print(f"  Page: {pw:.0f} × {ph:.0f} pt")

        print("\n[Extract] Grouping all vector paths by color ...")
        t_ext = time.time()
        groups = extract_groups(page)
        print(f"  Extraction: {time.time() - t_ext:.1f}s")

    print("\n[Classify] Building group records ...")
    records = build_records(groups)
    totals  = compute_totals(records)

    print(f"  Groups: {totals['total_groups']}  "
          f"include={totals['n_include_groups']}  "
          f"review={totals['n_review_groups']}  "
          f"ignore={totals['n_ignore_groups']}")
    print(f"  Include types: {', '.join(totals['include_types'])}")
    print(f"  Review types:  {', '.join(totals['review_types'])}")

    print("\n[Overlay] Rendering classification overlay ...")
    render_overlay(groups, records, pw, ph)

    print("\n[JSON] Writing element_groups.json ...")
    OUT_JSON.write_text(json.dumps({
        'metadata': {
            'source':       str(PDF_PATH),
            'generated':    time.strftime('%Y-%m-%dT%H:%M:%S'),
            'script':       '18_element_decomposition.py',
            'poc':          'E — Stage K',
            'approved_for_boq': False,
            'note':         'Research-only. All classifications provisional.',
            'classification_rules': {
                'include': 'color_taxonomy match OR gray-hairline sign-glyph',
                'ignore':  'white fill OR black fill (>60% fill ratio) OR title block zone',
                'review':  'black stroke, near-gray unmatched, or unknown color',
            },
        },
        'totals':  totals,
        'groups':  records,
    }, ensure_ascii=False, indent=2))
    print(f"  → {OUT_JSON}")

    print("\n[Report] Writing reports ...")
    OUT_MD.write_text(build_md(records, totals))
    OUT_HTML.write_text(build_html(records, totals))
    print(f"  → {OUT_MD}")
    print(f"  → {OUT_HTML}")

    elapsed = time.time() - t0

    print(f"""
{'=' * 60}
POC E COMPLETE — Plan Decomposition
{'=' * 60}
  Total paths        : {totals['total_paths']:,}
  Color groups       : {totals['total_groups']}
    Include          : {totals['n_include_groups']}
    Review           : {totals['n_review_groups']}
    Ignore           : {totals['n_ignore_groups']}
  Include paths      : {totals['include_paths']:,}  (drawing: {totals['include_drawing_paths']:,})
  Review paths       : {totals['review_paths']:,}  (drawing: {totals['review_drawing_paths']:,})
  Elapsed            : {elapsed:.1f}s

  Include: {', '.join(totals['include_types'])}
  Review:  {', '.join(totals['review_types'])}

  → {OUT_JSON}
  → {OUT_MD}
  → {OUT_HTML}
  → {OUT_DIR}/overlay_classified.png
  open {OUT_HTML}

  REMINDER: All classifications provisional.
  approved_for_boq: false on all groups.
  Requires human validation before operational use.
{'=' * 60}
""")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Element Decomposition — POC E (Stage K)')
    parser.add_argument(
        '--plan-run-dir', default=None, metavar='DIR',
        help='Path to an isolated plan run directory (runs/<plan_slug>/). '
             'When supplied, all I/O is scoped to that run. '
             'Omit to use the legacy global outputs/ directory.')
    _args = parser.parse_args()
    _ctx  = PlanRunContext.from_args(_args, script_dir=SCRIPT_DIR)

    if _ctx.is_plan_scoped:
        PDF_PATH = _ctx.source_pdf_path
        OUT_DIR  = _ctx.outputs_dir / 'element_decomposition'
        OUT_JSON = _ctx.outputs_dir / 'element_groups.json'
        OUT_MD   = _ctx.outputs_dir / 'element_groups_report.md'
        OUT_HTML = _ctx.outputs_dir / 'element_groups_report.html'

        if not PDF_PATH.exists():
            print(f'[WARN] Plan-scoped mode: source PDF not found: {PDF_PATH}')
            print('  Run 31_upload_intake_wrapper.py first to register the source PDF.')
        _ctx.ensure_dirs()
        print(_ctx.describe())

    main()
