#!/bin/bash
# Installs the UZZ CRM backup agent for the current macOS user:
# downloads at 13:00 and 19:00 every day (and at login if a run was missed).
set -euo pipefail

APP_DIR="$HOME/Library/Application Support/UZZ-CRM-Backup"
PLIST="$HOME/Library/LaunchAgents/kg.uzz.crm-backup.plist"
LABEL="kg.uzz.crm-backup"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "Установка резервного копирования CRM «Улуу Жибек Жолу»"
read -r -p "Адрес сервера (например https://uzz-crm-api.onrender.com): " API_URL
case "$API_URL" in https://*) ;; *) echo "Адрес должен начинаться с https://"; exit 1 ;; esac
read -r -s -p "Токен агента (ввод не отображается): " TOKEN; echo
[ ${#TOKEN} -ge 32 ] || { echo "Токен слишком короткий"; exit 1; }

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents"
chmod 700 "$APP_DIR"
umask 077
printf 'API_URL=%s\nTOKEN=%s\n' "${API_URL%/}" "$TOKEN" > "$APP_DIR/config"
chmod 600 "$APP_DIR/config"
cp "$HERE/uzz-backup.sh" "$APP_DIR/uzz-backup.sh"
chmod 700 "$APP_DIR/uzz-backup.sh"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$APP_DIR/uzz-backup.sh</string></array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>13</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>19</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLISTEOF

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Готово. Первая копия скачивается сейчас, затем ежедневно в 13:00 и 19:00."
echo "Папка с копиями: $HOME/UZZ-CRM-Backups"
echo "Журнал: $APP_DIR/backup.log"
