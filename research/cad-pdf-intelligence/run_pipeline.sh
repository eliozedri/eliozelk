#!/bin/bash
# CAD PDF Intelligence — full pipeline runner
# Usage: ./run_pipeline.sh [/path/to/plan.pdf]
# Default: uses 50-448-02-400.pdf (smallest of the 3 sample PDFs)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/.venv/bin/python3"
PDF="${1:-/Users/eliozedri/Downloads/50-448-02-400.pdf}"

if [ ! -f "$VENV" ]; then
  echo "[!] Virtual environment not found. Run:"
  echo "    python3 -m venv $SCRIPT_DIR/.venv"
  echo "    $SCRIPT_DIR/.venv/bin/pip install -r $SCRIPT_DIR/requirements.txt"
  exit 1
fi

if [ ! -f "$PDF" ]; then
  echo "[!] PDF not found: $PDF"
  exit 1
fi

echo "========================================"
echo "  CAD PDF Intelligence POC"
echo "  PDF: $PDF"
echo "========================================"

cd "$SCRIPT_DIR"

echo ""
"$VENV" 01_inspect.py "$PDF"
echo ""
"$VENV" 02_extract_vectors.py "$PDF"
echo ""
"$VENV" 03_analyze_colors_geometry.py "$PDF"
echo ""
"$VENV" 04_cluster_symbols.py "$PDF"
echo ""
"$VENV" 05_debug_overlay.py "$PDF"
echo ""
"$VENV" 06_match_signs.py "$PDF"

echo ""
echo "========================================"
echo "  Done. Outputs in: $SCRIPT_DIR/outputs/"
echo "  Open debug_overlay.svg in a browser."
echo "  Open sign_recognition_report.md for E results."
echo "========================================"
