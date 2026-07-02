# Backup VPS LogisFlow

Dokumen ini dipakai sebelum aplikasi masuk data asli dan sebelum setiap deploy besar. Backup wajib mencakup dua hal:

1. Database PostgreSQL: invoice, payment, client, shipment, konfigurasi, dan audit.
2. Folder `storage/`: PDF, Excel, logo, TTD, stampel, dan bukti transfer.

> Jalankan semua command dari folder project di VPS: `~/logisflow`.

## 1. Cek service Docker

```bash
cd ~/logisflow
sudo docker compose -f docker-compose.prod.yml ps
```

Pastikan service database bernama `db` atau container terlihat seperti `logisflow-db-1` dan statusnya healthy/running.

## 2. Buat folder backup

```bash
mkdir -p ~/logisflow-backups
```

## 3. Backup database manual

Gunakan command ini dari folder `~/logisflow`:

```bash
cd ~/logisflow
BACKUP_NAME="logisflow-db-$(date +%Y%m%d-%H%M%S).sql.gz"
sudo docker compose -f docker-compose.prod.yml exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > ~/logisflow-backups/$BACKUP_NAME
ls -lh ~/logisflow-backups/$BACKUP_NAME
```

Jika file muncul dan ukurannya tidak 0 byte, backup database berhasil.

## 4. Backup folder storage manual

```bash
cd ~/logisflow
STORAGE_BACKUP_NAME="logisflow-storage-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf ~/logisflow-backups/$STORAGE_BACKUP_NAME storage
ls -lh ~/logisflow-backups/$STORAGE_BACKUP_NAME
```

Folder `storage/` berisi file penting seperti PDF invoice, Excel, logo, TTD, stampel, dan bukti transfer.

## 5. Backup lengkap sebelum deploy

Jalankan ini sebelum `git pull` atau rebuild Docker:

```bash
cd ~/logisflow
mkdir -p ~/logisflow-backups
NOW="$(date +%Y%m%d-%H%M%S)"
sudo docker compose -f docker-compose.prod.yml exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > ~/logisflow-backups/logisflow-db-$NOW.sql.gz
tar -czf ~/logisflow-backups/logisflow-storage-$NOW.tar.gz storage
ls -lh ~/logisflow-backups/logisflow-*-$NOW.*
```

Setelah backup berhasil, baru deploy:

```bash
git pull
sudo docker compose -f docker-compose.prod.yml up -d --build
```

## 6. Lihat daftar backup

```bash
ls -lh ~/logisflow-backups
```

## 7. Restore database

Pakai restore hanya jika benar-benar perlu, karena ini akan menimpa database aktif.

1. Masuk ke folder project:

```bash
cd ~/logisflow
```

2. Pilih file backup database:

```bash
ls -lh ~/logisflow-backups/*.sql.gz
```

3. Restore database:

```bash
BACKUP_FILE="/home/brianlogis/logisflow-backups/NAMA_FILE_BACKUP.sql.gz"
gunzip -c "$BACKUP_FILE" | sudo docker compose -f docker-compose.prod.yml exec -T db sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Ganti `NAMA_FILE_BACKUP.sql.gz` sesuai file yang dipilih.

## 8. Restore folder storage

Pakai restore storage jika file PDF/logo/bukti transfer hilang atau rusak.

```bash
cd ~/logisflow
STORAGE_BACKUP="/home/brianlogis/logisflow-backups/NAMA_FILE_STORAGE.tar.gz"
tar -xzf "$STORAGE_BACKUP" -C ~/logisflow
sudo docker compose -f docker-compose.prod.yml restart app
```

Ganti `NAMA_FILE_STORAGE.tar.gz` sesuai file yang dipilih.

## 9. Jadwal backup harian sederhana

Buat script backup:

```bash
mkdir -p ~/bin
nano ~/bin/backup-logisflow.sh
```

Isi file:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd ~/logisflow
mkdir -p ~/logisflow-backups
NOW="$(date +%Y%m%d-%H%M%S)"
sudo docker compose -f docker-compose.prod.yml exec -T db sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > ~/logisflow-backups/logisflow-db-$NOW.sql.gz
tar -czf ~/logisflow-backups/logisflow-storage-$NOW.tar.gz storage
find ~/logisflow-backups -type f -mtime +14 -delete
```

Aktifkan script:

```bash
chmod +x ~/bin/backup-logisflow.sh
```

Tes manual:

```bash
~/bin/backup-logisflow.sh
ls -lh ~/logisflow-backups
```

Pasang cron harian jam 02:00:

```bash
crontab -e
```

Tambahkan baris ini:

```cron
0 2 * * * /home/brianlogis/bin/backup-logisflow.sh >> /home/brianlogis/logisflow-backups/backup.log 2>&1
```

## 10. Cek hasil backup harian

```bash
ls -lh ~/logisflow-backups
tail -50 ~/logisflow-backups/backup.log
```

## 11. Aturan aman sebelum deploy

Sebelum update VPS, biasakan urutan ini:

```bash
cd ~/logisflow
~/bin/backup-logisflow.sh
git pull
sudo docker compose -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.prod.yml ps
```

Jika deploy bermasalah, jangan hapus backup terakhir. Simpan minimal 14 hari.
