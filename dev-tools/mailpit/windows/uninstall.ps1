# Removes the Mailpit background task and the downloaded program.
Unregister-ScheduledTask -TaskName 'UZZ Mailpit' -Confirm:$false -ErrorAction SilentlyContinue
$AppDir = Join-Path $env:LOCALAPPDATA 'UZZ-Mailpit'
Get-Process mailpit -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$AppDir*" } | Stop-Process -Force
Remove-Item -Recurse -Force $AppDir -ErrorAction SilentlyContinue
Write-Host 'Mailpit удалён.'
