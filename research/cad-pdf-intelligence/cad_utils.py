"""
Shared utilities for the CAD PDF Intelligence pipeline.
Color bucketing, semantic hints, SVG color mapping.
"""

import json
from pathlib import Path


# ── Color bucketing ────────────────────────────────────────────────────────────

def bucket_color(rgb_float):
    """Map a float RGB tuple (0.0–1.0 each) to a semantic color bucket name."""
    if rgb_float is None:
        return "none"
    r, g, b = rgb_float
    r8 = int(r * 255)
    g8 = int(g * 255)
    b8 = int(b * 255)

    chroma = max(r8, g8, b8) - min(r8, g8, b8)
    brightness = max(r8, g8, b8)

    # Grayscale family (low chroma)
    if chroma < 25:
        if brightness < 30:
            return "black"
        elif brightness < 100:
            return "gray_dark"
        elif brightness < 175:
            return "gray_mid"
        else:
            return "gray_light"

    # Red / crimson
    if r8 > 180 and g8 < 100 and b8 < 120:
        return "red"

    # Orange: high R, medium G, low B
    if r8 > 200 and 70 < g8 < 190 and b8 < 70:
        return "orange"

    # Yellow: high R and G, low B
    if r8 > 180 and g8 > 180 and b8 < 90:
        return "yellow"

    # Pure / dark blue: B dominant, low R+G
    if b8 > 150 and r8 < 80 and g8 < 80:
        return "blue"

    # Light blue / blue+cyan: B dominant with moderate G
    if b8 > 150 and g8 >= 80 and r8 < 60:
        return "blue_light"

    # Purple / violet
    if r8 > 80 and b8 > 150 and g8 < 100:
        return "purple"

    # Green
    if g8 > 150 and r8 < 100 and b8 < 100:
        return "green"

    return "other"


# ── Semantic hints per color bucket ───────────────────────────────────────────

SEMANTIC_HINT = {
    "black":      "structure_outline",
    "gray_dark":  "road_fill_or_structure",
    "gray_mid":   "road_fill",
    "gray_light": "background_fill",
    "red":        "warning_or_prohibition_sign",
    "orange":     "work_zone_element",
    "yellow":     "road_marking",
    "blue":       "direction_or_mandatory_sign",
    "blue_light": "road_marking_arrow",
    "purple":     "stage_boundary_or_zone",
    "green":      "vegetation_or_park",
    "none":       "no_fill",
    "other":      "unclassified",
}

# ── SVG stroke colors for overlay visualization ────────────────────────────────
# Use visually distinct colors so clusters stand out against the gray plan background.

SVG_STROKE = {
    "black":      "#00cc44",   # green — stands out from black background
    "gray_dark":  "#999999",
    "gray_mid":   "#bbbbbb",
    "gray_light": "#dddddd",
    "red":        "#ff2020",
    "orange":     "#ff8800",
    "yellow":     "#ccaa00",   # darker yellow for visibility
    "blue":       "#2266ff",
    "blue_light": "#00aaff",
    "purple":     "#aa00dd",
    "green":      "#00dd66",
    "none":       "#666666",
    "other":      "#00cccc",
}


# ── Output helpers ─────────────────────────────────────────────────────────────

import os as _os
_env_out = _os.environ.get("CAD_PLAN_OUTPUTS_DIR")
OUTPUTS = Path(_env_out) if _env_out else Path(__file__).parent / "outputs"

def output_path(filename: str) -> Path:
    OUTPUTS.mkdir(exist_ok=True)
    return OUTPUTS / filename

def save_json(data, filename: str, indent: int = 2) -> Path:
    path = output_path(filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=indent, ensure_ascii=False)
    return path

def load_json(filename: str):
    path = output_path(filename)
    with open(path, encoding="utf-8") as f:
        return json.load(f)
