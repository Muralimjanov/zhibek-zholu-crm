# Installs the UZZ CRM backup agent for the current Windows user:
# downloads at 13:00 and 19:00 every day (missed runs start as soon as possible).
# Run: right click -> "Run with PowerShell", or:
#   powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = 'Stop'
$AppDir = Join-Path $env:LOCALAPPDATA 'UZZ-CRM-Backup'
$TaskName = 'UZZ CRM Backup'

Write-Host 'Установка резервного копирования CRM «Улуу Жибек Жолу»'
$apiUrl = Read-Host 'Адрес сервера (например https://uzz-crm-api.onrender.com)'
if (-not $apiUrl.StartsWith('https://')) { throw 'Адрес должен начинаться с https://' }
$token = Read-Host 'Токен агента (ввод не отображается)' -AsSecureString
if ($token.Length -lt 32) { throw 'Токен слишком короткий' }

New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
# Only this user may read the settings folder.
icacls $AppDir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null
@{ ApiUrl = $apiUrl.TrimEnd('/'); Token = (ConvertFrom-SecureString $token) } | ConvertTo-Json | Set-Content (Join-Path $AppDir 'config.json') -Encoding UTF8
Copy-Item (Join-Path $PSScriptRoot 'uzz-backup.ps1') (Join-Path $AppDir 'uzz-backup.ps1') -Force

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AppDir\uzz-backup.ps1`""
$triggers = @((New-ScheduledTaskTrigger -Daily -At '13:00'), (New-ScheduledTaskTrigger -Daily -At '19:00'))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Description 'Резервная копия базы CRM' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host 'Готово. Первая копия скачивается сейчас, затем ежедневно в 13:00 и 19:00.'
Write-Host "Папка с копиями: $env:USERPROFILE\UZZ-CRM-Backups"
Write-Host "Журнал: $AppDir\backup.log"
