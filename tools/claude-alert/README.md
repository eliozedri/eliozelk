# Claude Code Alert System

A persistent repeating sound alert that fires whenever Claude Code finishes responding. Runs as a background process, stoppable from any terminal session.

---

## What it does

- Every time Claude Code finishes a response, the `Stop` hook fires `claude-alert-start.sh`
- That script starts an infinite loop playing `Hero.aiff` in the background
- The loop continues until you explicitly stop it
- A 30-second suppression window prevents the immediately-following response (Claude acknowledging the stop command) from restarting the alert

---

## File locations

| File | Purpose |
|---|---|
| `~/.local/bin/alert` | Unified control command — available in every shell |
| `~/.local/bin/stop-alert` | Convenience wrapper for `alert stop` |
| `~/.claude/claude-alert-start.sh` | Hook entry point — called by Claude Code on Stop |
| `~/.claude/claude-alert-stop.sh` | Delegates to `alert stop` |
| `~/.claude/alert/running` | Sentinel file — loop exits when absent |
| `~/.claude/alert/pid` | PID of the bash loop process |
| `~/.claude/alert/suppressed` | Suppression timestamp |
| `~/.zshenv` | PATH export for `~/.local/bin` (all zsh shells) |
| `~/.zshrc` | Convenience aliases |
| `~/.claude/settings.json` | Claude Code Stop hook registration |

---

## Installation

```bash
cd tools/claude-alert
chmod +x install.sh
./install.sh
source ~/.zshrc
```

The install script is idempotent — safe to re-run.

---

## Supported commands

### Preferred
```bash
alert stop       # stop active alert
alert start      # start manually
alert status     # check current state
```

### Aliases (all equivalent to alert stop)
```bash
stop-alert
alert-stop
stopalert
alert off
alert silence
alert mute
alert quiet
ALERT STOP       # case-insensitive
```

### Not supported
`stop alert` (two words, reversed) — `stop` is a shell job-control builtin in zsh/bash. Overriding it is unsafe. Use `alert stop` instead.

---

## Claude Code hook configuration

The Stop hook in `~/.claude/settings.json` must contain:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/claude-alert-start.sh"
          }
        ]
      }
    ]
  }
}
```

---

## Cross-session behavior

All state lives in `~/.claude/alert/` — a fixed global path. Any session can start or stop the alert:

```bash
# Terminal A — start an alert
~/.claude/claude-alert-start.sh

# Terminal B — stop it (no .zshrc needed)
alert stop
# or: ~/.local/bin/alert stop
```

This works because:
- `~/.local/bin` is guaranteed to be on PATH via `~/.zshenv` (loaded for ALL zsh shells)
- State files use absolute paths
- The loop checks the running sentinel before every sound play

---

## PATH reliability

`~/.local/bin` is added to PATH in `~/.zshenv`, which zsh loads for **all** invocations:

| Shell type | `.zshenv` loaded | `.zshrc` loaded |
|---|---|---|
| Interactive login | yes | yes |
| Interactive non-login | yes | yes |
| Non-interactive (scripts, hooks) | yes | no |
| Claude Code hook runner | yes | no |

This is what makes the commands available even in Claude Code's hook execution context.

---

## Manual verification

### Verify commands exist without .zshrc

```bash
bash --noprofile --norc -c 'command -v alert'
# expected: /Users/<you>/.local/bin/alert

bash --noprofile --norc -c 'command -v stop-alert'
# expected: /Users/<you>/.local/bin/stop-alert

bash --noprofile --norc -c 'alert status'
# expected: No alert running.
```

### Verify cross-session stop

```bash
# Session A
bash --noprofile --norc -c '~/.claude/claude-alert-start.sh'
sleep 0.5
cat ~/.claude/alert/pid           # should show a PID
pgrep -x afplay                   # should show a PID

# Session B (separate terminal or subshell)
bash --noprofile --norc -c 'alert stop'

# Verification
sleep 0.5
ls ~/.claude/alert/running        # should: No such file
pgrep -x afplay                   # should: no output
cat ~/.claude/alert/pid           # should: No such file
```

---

## Uninstallation

```bash
cd tools/claude-alert
chmod +x uninstall.sh
./uninstall.sh
source ~/.zshrc
```

Then remove the Stop hook from `~/.claude/settings.json` manually.

---

## Changing the sound

Edit `src/claude-alert-start.sh` (and re-run `install.sh`), or edit `~/.claude/claude-alert-start.sh` directly:

```bash
SOUND="/System/Library/Sounds/Hero.aiff"
# Available: Basso Blow Bottle Frog Funk Glass Hero Morse Ping Pop Purr Sosumi Submarine Tink
```
