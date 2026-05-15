#!/bin/bash
# Triggered by the Claude Code Stop hook on every completed response.
# Installed to ~/.claude/claude-alert-start.sh
#
# Behaviour:
#   - Respects a 30-second suppression window written by alert stop
#   - Deduplicates: does nothing if an alert loop is already running
#   - Starts a self-checking loop that reads the running sentinel before every play
#   - Loop exits cleanly when the running sentinel is removed (no kill required)

ALERT_DIR="$HOME/.claude/alert"
RUNNING="$ALERT_DIR/running"
PIDFILE="$ALERT_DIR/pid"
SUPPRESSION="$ALERT_DIR/suppressed"
SOUND="/System/Library/Sounds/Hero.aiff"
SUPPRESS_SECONDS=30

mkdir -p "$ALERT_DIR"

# Honour suppression window
if [ -f "$SUPPRESSION" ]; then
  AGE=$(( $(date +%s) - $(stat -f %m "$SUPPRESSION") ))
  if [ "$AGE" -lt "$SUPPRESS_SECONDS" ]; then
    exit 0
  fi
  rm -f "$SUPPRESSION"
fi

# Deduplicate: exit if a loop is already running
if [ -f "$RUNNING" ] && [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  exit 0
fi

# Clean up any stale state from a previous crashed session
rm -f "$RUNNING" "$PIDFILE"

# macOS banner notification
osascript -e 'display notification "Claude has finished. Run: alert stop" with title "Claude Code" subtitle "Task Complete"' 2>/dev/null &

# Create running sentinel BEFORE spawning the loop
touch "$RUNNING"

# Self-checking loop: checks $RUNNING before every play.
# Removing $RUNNING is sufficient to stop the loop — no external kill required.
nohup bash -c "
  while [ -f '$RUNNING' ]; do
    afplay '$SOUND'
  done
  rm -f '$PIDFILE'
" > /dev/null 2>&1 &
echo $! > "$PIDFILE"
