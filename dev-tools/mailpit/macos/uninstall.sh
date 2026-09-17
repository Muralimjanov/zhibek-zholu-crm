#!/bin/bash
# Removes the Mailpit background service installed by install.sh.
set -u
LABEL="kg.uzz.mailpit"
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "Служба Mailpit удалена. Сама программа осталась (brew uninstall mailpit - удалить её)."
