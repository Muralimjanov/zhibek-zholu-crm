# Stops scheduled backups and removes the agent settings. Downloaded copies are kept.
Unregister-ScheduledTask -TaskName 'UZZ CRM Backup' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA 'UZZ-CRM-Backup') -ErrorAction SilentlyContinue
Write-Host "Агент удалён. Копии остались в $env:USERPROFILE\UZZ-CRM-Backups"
