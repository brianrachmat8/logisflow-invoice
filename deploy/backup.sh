#!/usr/bin/env sh
set -eu

BACKUP_DIR="./backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

docker compose -f docker-compose.prod.yml exec -T db pg_dump -U logis -d logis_invoice > "$BACKUP_DIR/db-$STAMP.sql"

docker run --rm \
  -v "$(basename "$(pwd)")_invoice_files:/data:ro" \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine:3.20 \
  sh -c "cd /data && tar -czf /backup/files-$STAMP.tar.gz ."

find "$BACKUP_DIR" -type f -mtime +30 -delete

echo "Backup selesai:"
echo "$BACKUP_DIR/db-$STAMP.sql"
echo "$BACKUP_DIR/files-$STAMP.tar.gz"
