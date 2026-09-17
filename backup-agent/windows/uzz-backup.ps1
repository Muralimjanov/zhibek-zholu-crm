# UZZ CRM: download an encrypted database backup to this Windows computer.
# Installed and scheduled by install.ps1; safe to run by hand at any time.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AppDir = Join-Path $env:LOCALAPPDATA 'UZZ-CRM-Backup'
$Config = Join-Path $AppDir 'config.json'
$Log = Join-Path $AppDir 'backup.log'
$Dest = Join-Path $env:USERPROFILE 'UZZ-CRM-Backups'
$Keep = 60

function Write-Log($msg) { Add-Content -Path $Log -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg) -Encoding UTF8 }
function Fail($msg) {
  Write-Log "ОШИБКА: $msg"
  try {
    Add-Type -AssemblyName System.Windows.Forms
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Warning
    $n.Visible = $true
    $n.ShowBalloonTip(10000, 'CRM: резервная копия не скачана', $msg, 'Warning')
    Start-Sleep -Seconds 10
    $n.Dispose()
  } catch {}
  exit 1
}

if (-not (Test-Path $Config)) { Fail 'нет файла настроек, запустите install.ps1' }
$cfg = Get-Content $Config -Raw | ConvertFrom-Json
if (-not $cfg.ApiUrl.StartsWith('https://')) { Fail 'адрес сервера должен начинаться с https://' }
# The token is stored encrypted with Windows DPAPI for this user only.
$secure = ConvertTo-SecureString $cfg.Token
$token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$part = Join-Path $Dest '.download.part'
$url = $cfg.ApiUrl.TrimEnd('/') + '/api/v1/backups/agent/export'

$ok = $false
for ($i = 1; $i -le 6 -and -not $ok; $i++) {
  try {
    # A sleeping free-tier server needs up to a minute to wake up.
    Invoke-WebRequest -Uri $url -Headers @{ Authorization = "Bearer $token" } -OutFile $part -TimeoutSec 1800 -UseBasicParsing
    $ok = $true
  } catch {
    Write-Log "попытка ${i}: $($_.Exception.Message)"
    Start-Sleep -Seconds 60
  }
}
if (-not $ok) { Fail 'сервер недоступен или токен неверный (подробности в backup.log)' }

$bytes = New-Object byte[] 7
$fs = [IO.File]::OpenRead($part); [void]$fs.Read($bytes, 0, 7); $fs.Close()
if ([Text.Encoding]::ASCII.GetString($bytes) -ne 'UZZBAK1') { Remove-Item $part -Force; Fail 'скачанный файл не является резервной копией' }

$file = Join-Path $Dest ("uzz-crm-backup-{0}.uzzbak" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Move-Item $part $file
Write-Log ("OK: {0} ({1} байт)" -f $file, (Get-Item $file).Length)

Get-ChildItem $Dest -Filter 'uzz-crm-backup-*.uzzbak' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item -Force
