#!/bin/bash
# Installed to ~/.claude/claude-alert-stop.sh
# Delegates to the unified alert controller.
exec "$HOME/.local/bin/alert" stop "$@"
