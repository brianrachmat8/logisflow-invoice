#!/usr/bin/env sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Pakai: sh deploy/restore.sh backups/db-YYYYMMDD-HHMMSS.sql [backups/files-YYYYMMDD-HHMMSS.tar.gz]"
  exit 1
fi

DB_BACKUP="$1"
FILES_BACKUP="${2:-}"

echo "Restore database dari $DB_BACKUP"
docker compose -f docker-compose.prod.yml exec -T db psql -U logis -d logis_invoice -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose -f docker-compose.prod.yml exec -T db psql -U logis -d logis_invoice < "$DB_BACKUP"

if [ -n "$FILES_BACKUP" ]; then
  echo "Restore file storage dari $FILES_BACKUP"
  docker run --rm \
    -v "$(basename "$(pwd)")_invoice_files:/data" \
    -v "$(pwd)/$(dirname "$FILES_BACKUP"):/backup:ro" \
    alpine:3.20 \
    sh -c "rm -rf /data/* && tar -xzf /backup/$(basename "$FILES_BACKUP") -C /data"
fi

echo "Restore selesai."
