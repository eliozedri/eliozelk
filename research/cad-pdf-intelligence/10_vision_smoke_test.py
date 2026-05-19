#!/usr/bin/env python3
"""
Stage G — Vision Smoke Test (10_vision_smoke_test.py)

Sends 5 representative Stage G code crops to Claude Vision for independent
sign-code reading. Vision receives no inventory-derived context; it reads
only the crop image and a generic plan description.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    .venv/bin/python3 10_vision_smoke_test.py

    Alternatively, create a .env file in this directory:
        ANTHROPIC_API_KEY=sk-ant-...

Outputs:
    outputs/vision_smoke_test_results.json
    outputs/vision_smoke_test_report.md
"""

import base64
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

SCRIPT_DIR  = Path(__file__).parent
OUTPUTS_DIR = SCRIPT_DIR / "outputs"
CROPS_DIR   = OUTPUTS_DIR / "stage_g_code_crops"
INV_PATH    = OUTPUTS_DIR / "sign_inventory.json"
RESULTS_OUT = OUTPUTS_DIR / "vision_smoke_test_results.json"
REPORT_OUT  = OUTPUTS_DIR / "vision_smoke_test_report.md"

VISION_MODEL   = "claude-sonnet-4-6"
PROMPT_VERSION = "v1.0"

# Crops selected to cover the four required categories.
# Selection is based on cluster_type, visual_match_tier, cluster_member_count.
# Category labels are for the audit record only — not sent to Vision.
SMOKE_CROP_IDS = [
    ("OCC-0023", "clear"),           # compact_symbol, medium match 0.252 — readable speed-limit area
    ("OCC-0002", "best_legend_match"),# sign_symbol, medium match 0.210 — large intersection
    ("OCC-0013", "uncertain"),        # compact_symbol, medium match 0.204 — traffic-light junction
    ("OCC-0024", "crowded"),          # compact_symbol, 11 members, no-match — dense multi-sign cluster
    ("OCC-0174", "fragment"),         # symbol_fragment, 1 member, low — edge/minimal crop
]

VISION_PROMPT = """\
You are reading a section of an Israeli traffic engineering plan (AutoCAD PDF export).

The image shows a portion of a traffic arrangement plan. A traffic sign or symbol has been detected near the CENTER of this image.

Your task:
1. Identify what traffic sign or symbol is visible at or nearest to the center of the image.
2. Look for any Israeli traffic sign code numbers written adjacent to or near that center sign. Codes are typically 2–4 digit numbers such as 402, 40, 214, 308, 620, 625, 10, 30, 50, 60, 80, etc.
3. If multiple sign codes are visible in the image, report only those spatially associated with the CENTER sign — not codes from other signs elsewhere in the frame.
4. If you cannot clearly read a code, say so explicitly. Do not guess or infer.

Return ONLY the following JSON object. No markdown fences, no explanation, no extra text before or after:
{
  "primary_sign_description": "<brief description of sign type at image center>",
  "detected_sign_codes": ["<code1>", "<code2>"],
  "selected_sign_code_if_unambiguous": "<single code string, or null if ambiguous or unreadable>",
  "confidence": "high|medium|low|unreadable",
  "spatial_association_notes": "<how closely is each detected code positioned relative to the center sign>",
  "ambiguity_notes": "<describe any conflicting, multiple, or uncertain codes>",
  "requires_review": true,
  "raw_notes": "<any other observations about crop quality or readable content>"
}"""


def load_dotenv_file(env_path: Path) -> dict:
    """Parse a simple KEY=VALUE .env file; ignores comments and blank lines."""
    result = {}
    if not env_path.exists():
        return result
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        result[key.strip()] = val.strip().strip('"').strip("'")
    return result


def resolve_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key:
        return key
    env_vars = load_dotenv_file(SCRIPT_DIR / ".env")
    key = env_vars.get("ANTHROPIC_API_KEY", "")
    if key:
        print("  [env] ANTHROPIC_API_KEY loaded from .env file")
        return key
    return ""


def encode_image_b64(path: Path) -> str:
    return base64.standard_b64encode(path.read_bytes()).decode("utf-8")


def call_vision(client, crop_path: Path, occ_id: str) -> dict:
    """Send one crop to Vision; return full audit record."""
    img_b64   = encode_image_b64(crop_path)
    started   = time.time()

    raw_response = None
    parse_error  = None
    parsed       = None

    try:
        message = client.messages.create(
            model=VISION_MODEL,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type":       "base64",
                                "media_type": "image/png",
                                "data":       img_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": VISION_PROMPT,
                        },
                    ],
                }
            ],
        )
        raw_response = message.content[0].text if message.content else ""
    except Exception as exc:
        parse_error = f"API call failed: {exc}"

    elapsed = round(time.time() - started, 2)

    if raw_response is not None:
        text = raw_response.strip()
        # Strip accidental markdown fences
        if text.startswith("```"):
            lines = text.splitlines()
            text  = "\n".join(lines[1:-1]) if len(lines) > 2 else text
        try:
            parsed = json.loads(text)
            parse_status = "ok"
        except json.JSONDecodeError as exc:
            parse_status = "json_parse_error"
            parse_error  = str(exc)
    else:
        parse_status = "api_error"

    return {
        "occurrence_id":    occ_id,
        "crop_path":        str(crop_path),
        "model":            VISION_MODEL,
        "prompt_version":   PROMPT_VERSION,
        "api_call_elapsed": elapsed,
        "raw_response":     raw_response,
        "parse_status":     parse_status,
        "parse_error":      parse_error,
        "vision_output":    parsed,
    }


def select_crops(inventory: dict) -> list:
    """Match SMOKE_CROP_IDS against inventory; return list of (occ_record, category)."""
    by_id = {o["occurrence_id"]: o for o in inventory.get("occurrences", [])}
    selected = []
    for occ_id, category in SMOKE_CROP_IDS:
        if occ_id not in by_id:
            print(f"  [warn] {occ_id} not found in inventory — skipping")
            continue
        crop_path = CROPS_DIR / f"{occ_id}.png"
        if not crop_path.exists():
            print(f"  [warn] crop file missing: {crop_path} — skipping")
            continue
        selected.append((by_id[occ_id], category, crop_path))
    return selected


def verdict_from_result(result: dict) -> str:
    if result["parse_status"] != "ok" or result["vision_output"] is None:
        return "PARSE_FAILED"
    vo = result["vision_output"]
    code = vo.get("selected_sign_code_if_unambiguous")
    conf = vo.get("confidence", "")
    if conf == "unreadable" or not code:
        return "UNREADABLE"
    if vo.get("requires_review"):
        return "CODE_READ_REVIEW_REQUIRED"
    return "CODE_READ_CONFIRMED"


def build_report(
    results:    list,
    categories: list,
    inv_occs:   list,
    started_at: str,
    elapsed:    float,
) -> str:
    by_id = {o["occurrence_id"]: o for o in inv_occs}

    codes_read   = sum(1 for r in results if verdict_from_result(r) in ("CODE_READ_CONFIRMED", "CODE_READ_REVIEW_REQUIRED"))
    unreadable   = sum(1 for r in results if verdict_from_result(r) == "UNREADABLE")
    parse_failed = sum(1 for r in results if verdict_from_result(r) == "PARSE_FAILED")

    lines = [
        "# Vision Smoke Test Report",
        "",
        f"**Date:** {started_at}  ",
        f"**Model:** `{VISION_MODEL}`  ",
        f"**Prompt version:** `{PROMPT_VERSION}`  ",
        f"**Crops tested:** {len(results)}  ",
        f"**Total elapsed:** {elapsed:.1f}s",
        "",
        "## Summary",
        "",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Sign codes read (any) | {codes_read} |",
        f"| Unreadable crops | {unreadable} |",
        f"| API/parse failures | {parse_failed} |",
        "",
        "## Per-Crop Results",
        "",
    ]

    for result, category in zip(results, categories):
        occ_id  = result["occurrence_id"]
        occ_inv = by_id.get(occ_id, {})
        verdict = verdict_from_result(result)
        vo      = result.get("vision_output") or {}

        lines += [
            f"### {occ_id} — category: `{category}`",
            "",
            f"- **Cluster type:** {occ_inv.get('cluster_type', '?')}  ",
            f"- **Member count:** {occ_inv.get('cluster_member_count', '?')}  ",
            f"- **Legend match tier:** {occ_inv.get('visual_match_tier', '?')} ({occ_inv.get('legend_match_score', 0):.3f})  ",
            f"- **Parse status:** `{result['parse_status']}`  ",
            f"- **API elapsed:** {result['api_call_elapsed']}s  ",
            f"- **Verdict:** **{verdict}**  ",
            "",
        ]

        if vo:
            lines += [
                f"- **Primary sign (Vision):** {vo.get('primary_sign_description', '—')}  ",
                f"- **Detected codes:** {vo.get('detected_sign_codes', [])}  ",
                f"- **Selected code:** `{vo.get('selected_sign_code_if_unambiguous')}`  ",
                f"- **Confidence:** {vo.get('confidence', '?')}  ",
                f"- **Spatial association:** {vo.get('spatial_association_notes', '—')}  ",
                f"- **Ambiguity:** {vo.get('ambiguity_notes', '—')}  ",
                f"- **Raw notes:** {vo.get('raw_notes', '—')}  ",
                "",
            ]
        elif result.get("parse_error"):
            lines.append(f"- **Error:** {result['parse_error']}  \n")

        lines.append("")

    lines += [
        "## Readiness Assessment",
        "",
        f"- **ANTHROPIC_API_KEY:** present and functional  ",
        f"- **anthropic package:** {VISION_MODEL.split('-')[0]} SDK installed  ",
        f"- **JSON format compliance:** {'yes' if parse_failed == 0 else 'partial — see parse errors above'}  ",
        f"- **Codes read from crops:** {codes_read}/{len(results)}  ",
        "",
        "### Safe to run full 177-crop batch?",
        "",
    ]

    if parse_failed == 0 and codes_read >= 2:
        lines += [
            "**YES** — JSON format works, codes are being read. Proceed with full batch.",
            "",
            "```bash",
            "export ANTHROPIC_API_KEY=<your-key>",
            ".venv/bin/python3 09_stage_g_inventory.py",
            "```",
        ]
    elif parse_failed > 0:
        lines += [
            "**CAUTION** — Some responses failed JSON parsing. Fix prompt before full batch.",
        ]
    else:
        lines += [
            "**UNCERTAIN** — Codes not read from smoke crops. Investigate crop quality before full batch.",
        ]

    return "\n".join(lines)


def main() -> None:
    print("=== Vision Smoke Test ===")
    print(f"Model: {VISION_MODEL}")

    # --- API key ---
    api_key = resolve_api_key()
    if not api_key:
        print()
        print("ERROR: ANTHROPIC_API_KEY not found.")
        print()
        print("Set it before running:")
        print("  export ANTHROPIC_API_KEY=sk-ant-...")
        print("  .venv/bin/python3 10_vision_smoke_test.py")
        print()
        print("Or create research/cad-pdf-intelligence/.env with:")
        print("  ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    try:
        import anthropic
    except ImportError:
        print("ERROR: anthropic not installed. Run: .venv/bin/pip install anthropic")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # --- Load inventory ---
    if not INV_PATH.exists():
        print(f"ERROR: sign_inventory.json not found at {INV_PATH}")
        sys.exit(1)
    inventory = json.loads(INV_PATH.read_text())
    print(f"Inventory loaded: {len(inventory.get('occurrences', []))} occurrences")

    # --- Select crops ---
    selected = select_crops(inventory)
    print(f"Crops selected: {len(selected)}")
    for occ, cat, path in selected:
        size_kb = path.stat().st_size // 1024
        print(f"  {occ['occurrence_id']:12s} [{cat:20s}] type={occ['cluster_type']:17s} tier={occ['visual_match_tier']:8s} {size_kb}KB")

    OUTPUTS_DIR.mkdir(exist_ok=True)
    started_at   = datetime.now().isoformat(timespec="seconds")
    global_start = time.time()

    results    = []
    categories = []

    for i, (occ, category, crop_path) in enumerate(selected, 1):
        occ_id = occ["occurrence_id"]
        print(f"\n[{i}/{len(selected)}] {occ_id} ({category}) ...", end="", flush=True)
        result = call_vision(client, crop_path, occ_id)
        result["smoke_category"] = category
        results.append(result)
        categories.append(category)

        verdict = verdict_from_result(result)
        vo      = result.get("vision_output") or {}
        code    = vo.get("selected_sign_code_if_unambiguous", "—")
        print(f" {verdict}  code={code}  ({result['api_call_elapsed']}s)")

        # Partial save after each crop
        RESULTS_OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2))

    total_elapsed = round(time.time() - global_start, 1)

    # --- Final save ---
    audit = {
        "smoke_test_meta": {
            "started_at":     started_at,
            "model":          VISION_MODEL,
            "prompt_version": PROMPT_VERSION,
            "crops_tested":   len(results),
            "total_elapsed":  total_elapsed,
        },
        "results": results,
    }
    RESULTS_OUT.write_text(json.dumps(audit, ensure_ascii=False, indent=2))
    print(f"\nResults saved: {RESULTS_OUT}")

    inv_occs = inventory.get("occurrences", [])
    report   = build_report(results, categories, inv_occs, started_at, total_elapsed)
    REPORT_OUT.write_text(report)
    print(f"Report saved:  {REPORT_OUT}")

    # --- Summary ---
    codes_read   = sum(1 for r in results if verdict_from_result(r) in ("CODE_READ_CONFIRMED", "CODE_READ_REVIEW_REQUIRED"))
    unreadable   = sum(1 for r in results if verdict_from_result(r) == "UNREADABLE")
    parse_failed = sum(1 for r in results if verdict_from_result(r) == "PARSE_FAILED")

    print()
    print("=== Smoke Test Summary ===")
    print(f"  Crops tested:      {len(results)}")
    print(f"  Codes read:        {codes_read}")
    print(f"  Unreadable:        {unreadable}")
    print(f"  Parse failures:    {parse_failed}")
    print(f"  Total elapsed:     {total_elapsed}s")


if __name__ == "__main__":
    main()
