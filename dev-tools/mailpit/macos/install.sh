#!/bin/bash
# Mailpit (local test mailbox) as a background service for the current macOS
# user, reachable ONLY from this computer (127.0.0.1) - never from the Wi-Fi.
# Starts at login and restarts if it crashes.
set -euo pipefail

LABEL="kg.uzz.mailpit"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/uzz-mailpit.log"

MAILPIT="$(command -v mailpit || true)"
for candidate in /opt/homebrew/bin/mailpit /usr/local/bin/mailpit; do
  [ -z "$MAILPIT" ] && [ -x "$candidate" ] && MAILPIT="$candidate"
done
if [ -z "$MAILPIT" ]; then
  echo "Mailpit не установлен. Установите: brew install mailpit"
  exit 1
fi

# The Homebrew service listens on all interfaces - replace it.
if command -v brew >/dev/null 2>&1 && brew services list 2>/dev/null | grep -q '^mailpit .*started'; then
  echo "Останавливаю службу brew (она слушает всю сеть)..."
  brew services stop mailpit >/dev/null
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$MAILPIT</string>
    <string>--smtp</string><string>127.0.0.1:1025</string>
    <string>--listen</string><string>127.0.0.1:8025</string>
    <string>--max</string><string>500</string>
    <string>--max-age</string><string>7d</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTEOF

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

for _ in $(seq 1 20); do
  curl -sf http://127.0.0.1:8025/api/v1/info >/dev/null 2>&1 && break
  sleep 0.5
done
if ! curl -sf http://127.0.0.1:8025/api/v1/info >/dev/null 2>&1; then
  echo "Mailpit не запустился, см. $LOG"
  exit 1
fi
if lsof -nP -iTCP:1025 -iTCP:8025 -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $9}' | grep -qv '^127\.0\.0\.1:'; then
  echo "ВНИМАНИЕ: порт 1025 или 8025 открыт не только для этого компьютера:"
  lsof -nP -iTCP:1025 -iTCP:8025 -sTCP:LISTEN
  exit 1
fi
echo "Готово. Mailpit доступен только с этого компьютера: SMTP 127.0.0.1:1025, письма http://127.0.0.1:8025"
echo "Запускается автоматически при входе в систему. Журнал: $LOG"
