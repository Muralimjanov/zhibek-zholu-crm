#!/bin/bash
# Stops scheduled backups and removes the agent settings. Downloaded copies are kept.
set -u
LABEL="kg.uzz.crm-backup"
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
rm -rf "$HOME/Library/Application Support/UZZ-CRM-Backup"
echo "Агент удалён. Копии остались в $HOME/UZZ-CRM-Backups"
