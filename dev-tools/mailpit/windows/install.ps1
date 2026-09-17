# Mailpit (local test mailbox) as a background task for the current Windows
# user, reachable ONLY from this computer (127.0.0.1) - never from the network.
# Starts at logon (after a crash: log off/on or run install.ps1 again).
# Run: right click -> "Run with PowerShell", or:
#   powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Version = 'v1.31.1'
# SHA-256 of the official release archives (checked against GitHub's asset digests).
$Hashes = @{
  'amd64' = '73ff05204741bd89cc96e6074573c4b22e1edfadf1b3427536233ff20c751604'
  'arm64' = 'a6475d8e63ac92084d0a2a3cf22ff8a723b508ccc65283b2d4d54f71ef897ca0'
}
$AppDir = Join-Path $env:LOCALAPPDATA 'UZZ-Mailpit'
$Exe = Join-Path $AppDir 'mailpit.exe'
$TaskName = 'UZZ Mailpit'

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

if (-not (Test-Path $Exe)) {
  $zip = Join-Path $env:TEMP "mailpit-$Version-$arch.zip"
  $url = "https://github.com/axllent/mailpit/releases/download/$Version/mailpit-windows-$arch.zip"
  Write-Host "Скачиваю Mailpit $Version ($arch)..."
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $Hashes[$arch]) {
    Remove-Item $zip -Force
    throw "Контрольная сумма архива не совпала ($actual) - файл повреждён или подменён, установка остановлена."
  }
  Expand-Archive -Path $zip -DestinationPath $AppDir -Force
  Remove-Item $zip -Force
}

# Hidden launcher, so no console window stays open.
$launcher = Join-Path $AppDir 'start-mailpit.ps1'
@"
Start-Process -FilePath '$Exe' -ArgumentList '--smtp','127.0.0.1:1025','--listen','127.0.0.1:8025','--max','500','--max-age','7d' -WindowStyle Hidden
"@ | Set-Content -Path $launcher -Encoding UTF8

Get-Process mailpit -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Exe } | Stop-Process -Force
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Mailpit для тестов CRM (только 127.0.0.1)' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$ok = $false
for ($i = 0; $i -lt 20 -and -not $ok; $i++) {
  Start-Sleep -Milliseconds 500
  try { Invoke-WebRequest -Uri 'http://127.0.0.1:8025/api/v1/info' -UseBasicParsing -TimeoutSec 2 | Out-Null; $ok = $true } catch {}
}
if (-not $ok) { throw 'Mailpit не запустился. Проверьте, не заняты ли порты 1025 и 8025 другой программой.' }

$open = Get-NetTCPConnection -State Listen -LocalPort 1025, 8025 -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -ne '127.0.0.1' }
if ($open) {
  $open | Format-Table LocalAddress, LocalPort, OwningProcess
  throw 'Порт 1025 или 8025 открыт не только для этого компьютера - другая программа (например, Docker) уже слушает его.'
}
Write-Host 'Готово. Mailpit доступен только с этого компьютера: SMTP 127.0.0.1:1025, письма http://127.0.0.1:8025'
Write-Host 'Запускается автоматически при входе в Windows.'
