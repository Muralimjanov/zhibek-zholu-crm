#!/bin/bash
# UZZ CRM: download an encrypted database backup to this Mac.
# Installed and scheduled by install.sh; safe to run by hand at any time.
set -euo pipefail

APP_DIR="$HOME/Library/Application Support/UZZ-CRM-Backup"
CONFIG="$APP_DIR/config"
LOG="$APP_DIR/backup.log"
DEST="$HOME/UZZ-CRM-Backups"
KEEP=60

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }
notify_failure() {
  log "ОШИБКА: $1"
  /usr/bin/osascript -e "display notification \"$1\" with title \"CRM: резервная копия не скачана\"" >/dev/null 2>&1 || true
  exit 1
}

[ -f "$CONFIG" ] || notify_failure "нет файла настроек, запустите install.sh"
# Read KEY=VALUE lines without executing the file.
API_URL="$(grep -E '^API_URL=' "$CONFIG" | head -1 | cut -d= -f2-)"
TOKEN="$(grep -E '^TOKEN=' "$CONFIG" | head -1 | cut -d= -f2-)"
[ -n "$API_URL" ] && [ -n "$TOKEN" ] || notify_failure "в настройках нет API_URL или TOKEN"
case "$API_URL" in https://*) ;; *) notify_failure "API_URL должен начинаться с https://" ;; esac

mkdir -p "$DEST" && chmod 700 "$DEST"
umask 077
PART="$DEST/.download.part"
HEADER_FILE="$(mktemp "$APP_DIR/.hdr.XXXXXX")"
trap 'rm -f "$HEADER_FILE" "$PART"' EXIT
# The token goes through a 0600 file, never the command line (visible in `ps`).
printf 'Authorization: Bearer %s\n' "$TOKEN" > "$HEADER_FILE"

# A sleeping free-tier server needs up to a minute to wake up.
if ! /usr/bin/curl --fail --silent --show-error --location --proto '=https' \
     --connect-timeout 90 --max-time 1800 --retry 5 --retry-delay 60 --retry-all-errors \
     -H @"$HEADER_FILE" -o "$PART" "${API_URL%/}/api/v1/backups/agent/export" 2>>"$LOG"; then
  notify_failure "сервер недоступен или токен неверный (подробности в $LOG)"
fi

[ "$(head -c 7 "$PART")" = "UZZBAK1" ] || notify_failure "скачанный файл не является резервной копией"
SIZE=$(wc -c < "$PART" | tr -d ' ')
FILE="$DEST/uzz-crm-backup-$(date '+%Y%m%d-%H%M%S').uzzbak"
mv "$PART" "$FILE"
chmod 600 "$FILE"
log "OK: $FILE ($SIZE байт)"

# Keep the newest $KEEP copies.
ls -1t "$DEST"/uzz-crm-backup-*.uzzbak 2>/dev/null | tail -n +$((KEEP + 1)) | while IFS= read -r old; do rm -f "$old"; done
