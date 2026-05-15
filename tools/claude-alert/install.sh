#!/bin/bash
# Installs the Claude Code alert system into global locations.
# Safe to re-run — idempotent.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/src"

BIN="$HOME/.local/bin"
CLAUDE="$HOME/.claude"
ZSHENV="$HOME/.zshenv"
ZSHRC="$HOME/.zshrc"
SETTINGS="$CLAUDE/settings.json"

echo "=== Installing Claude Code Alert System ==="

# ── 1. Directories ─────────────────────────────────────────────────────────
mkdir -p "$BIN" "$CLAUDE" "$CLAUDE/alert"
echo "✓ Directories ready"

# ── 2. Copy scripts ────────────────────────────────────────────────────────
cp "$SRC/alert"                   "$BIN/alert"
cp "$SRC/stop-alert"              "$BIN/stop-alert"
cp "$SRC/claude-alert-start.sh"   "$CLAUDE/claude-alert-start.sh"
cp "$SRC/claude-alert-stop.sh"    "$CLAUDE/claude-alert-stop.sh"
chmod +x "$BIN/alert" "$BIN/stop-alert" \
         "$CLAUDE/claude-alert-start.sh" "$CLAUDE/claude-alert-stop.sh"
echo "✓ Scripts installed and made executable"

# ── 3. PATH — add ~/.local/bin to ~/.zshenv (all zsh shells, including
#    non-interactive ones used by Claude Code hooks) ─────────────────────────
PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
GUARD='[[ ":$PATH:" != *":$HOME/.local/bin:"* ]]'
ZSHENV_ENTRY="$GUARD && $PATH_LINE"

if [ ! -f "$ZSHENV" ] || ! grep -qF '.local/bin' "$ZSHENV"; then
  echo "" >> "$ZSHENV"
  echo "# Added by claude-alert install.sh" >> "$ZSHENV"
  echo "$ZSHENV_ENTRY" >> "$ZSHENV"
  echo "✓ ~/.zshenv updated — ~/.local/bin now in PATH for all zsh shells"
else
  echo "✓ ~/.zshenv already contains ~/.local/bin path"
fi

# ── 4. Aliases in ~/.zshrc ─────────────────────────────────────────────────
ALIASES='alias stop-alert='"'"'alert stop'"'"'
alias alert-stop='"'"'alert stop'"'"'
alias stopalert='"'"'alert stop'"'"''

if ! grep -q 'stop-alert' "$ZSHRC" 2>/dev/null; then
  echo "" >> "$ZSHRC"
  echo "# Claude Code alert aliases — real commands are in ~/.local/bin/" >> "$ZSHRC"
  echo "$ALIASES" >> "$ZSHRC"
  echo "✓ Aliases added to ~/.zshrc"
else
  echo "✓ ~/.zshrc already has aliases"
fi

# ── 5. Claude Code Stop hook ───────────────────────────────────────────────
if [ -f "$SETTINGS" ]; then
  if grep -q 'claude-alert-start' "$SETTINGS"; then
    echo "✓ Claude Code Stop hook already configured"
  else
    echo "⚠  Stop hook not found in $SETTINGS"
    echo "   Add this manually to the hooks.Stop array:"
    echo '   { "type": "command", "command": "~/.claude/claude-alert-start.sh" }'
  fi
else
  echo "⚠  $SETTINGS not found — create it manually (see README.md)"
fi

# ── 6. Verify ──────────────────────────────────────────────────────────────
echo ""
echo "=== Verification ==="
bash --noprofile --norc -c "
  export PATH=\"$BIN:\$PATH\"
  echo -n 'alert:      '; command -v alert
  echo -n 'stop-alert: '; command -v stop-alert
  alert status
"
echo ""
echo "=== Done ==="
echo "Run 'source ~/.zshrc' (or open a new terminal) to activate aliases."
echo "Official commands: alert stop | alert start | alert status | stop-alert"
