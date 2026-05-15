#!/bin/bash
# Removes the Claude Code alert system completely.
set -e

BIN="$HOME/.local/bin"
CLAUDE="$HOME/.claude"
ZSHRC="$HOME/.zshrc"
ZSHENV="$HOME/.zshenv"

echo "=== Uninstalling Claude Code Alert System ==="

# Stop any running alert first
"$BIN/alert" stop 2>/dev/null || true

# Remove binaries
rm -f "$BIN/alert" "$BIN/stop-alert"
echo "✓ Removed ~/.local/bin/alert and stop-alert"

# Remove claude scripts
rm -f "$CLAUDE/claude-alert-start.sh" "$CLAUDE/claude-alert-stop.sh"
rm -rf "$CLAUDE/alert"
echo "✓ Removed ~/.claude alert scripts and state directory"

# Remove aliases from ~/.zshrc
if [ -f "$ZSHRC" ]; then
  sed -i '' '/# Claude Code alert aliases/d' "$ZSHRC"
  sed -i '' '/stop-alert.*alert stop/d' "$ZSHRC"
  sed -i '' '/alert-stop.*alert stop/d' "$ZSHRC"
  sed -i '' '/stopalert.*alert stop/d' "$ZSHRC"
  echo "✓ Aliases removed from ~/.zshrc"
fi

# Remove PATH line from ~/.zshenv (only if added by install.sh)
if [ -f "$ZSHENV" ] && grep -q 'claude-alert install.sh' "$ZSHENV"; then
  sed -i '' '/# Added by claude-alert install.sh/d' "$ZSHENV"
  sed -i '' '/\.local\/bin.*PATH/d' "$ZSHENV"
  echo "✓ PATH entry removed from ~/.zshenv"
fi

echo ""
echo "=== Done ==="
echo "Remove the Stop hook from ~/.claude/settings.json manually if desired."
echo "Run 'source ~/.zshrc' to apply alias removals."
