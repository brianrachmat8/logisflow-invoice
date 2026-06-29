$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $PSScriptRoot "..\backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
docker compose exec -T db pg_dump -U logis -d logis_invoice -Fc -f "/backups/logis-$stamp.dump"
Get-ChildItem -LiteralPath $backupDir -Filter "logis-*.dump" |
  Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) |
  Remove-Item -Force
Write-Host "Backup database selesai: logis-$stamp.dump"
