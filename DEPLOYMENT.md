# Panduan Deployment LogisFlow ke VPS

Panduan ini untuk menjadikan aplikasi dari `localhost` menjadi website aplikasi online yang bisa diakses dari mana saja dengan data tersimpan di server.

## 1. Persiapan VPS

Rekomendasi minimal:

- Ubuntu Server 22.04/24.04
- RAM 2 GB minimum, 4 GB lebih nyaman
- Storage 40 GB atau lebih
- Domain/subdomain, contoh `invoice.namaperusahaan.com`

Install Docker:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Logout lalu login kembali ke SSH agar group Docker aktif.

## 2. Upload project ke VPS

Contoh folder:

```bash
mkdir -p /opt/logisflow
cd /opt/logisflow
```

Upload isi project ini ke folder tersebut, atau clone dari repository Git jika sudah disimpan di Git.

## 3. Buat file environment production

```bash
cp .env.production.example .env
nano .env
```

Isi minimal:

```env
APP_DOMAIN=invoice.namaperusahaan.com
APP_URL=https://invoice.namaperusahaan.com
AUTH_URL=https://invoice.namaperusahaan.com
NEXTAUTH_URL=https://invoice.namaperusahaan.com
AUTH_SECRET=hasil-openssl-rand-base64-32
POSTGRES_PASSWORD=password-database-yang-kuat
ACME_EMAIL=email@namaperusahaan.com
TZ=Asia/Jakarta
```

Generate secret:

```bash
openssl rand -base64 32
```

## 4. Arahkan domain ke IP VPS

Di DNS provider domain, buat record:

```text
Type: A
Name: invoice
Value: IP_VPS_ANDA
TTL: Auto
```

Tunggu propagasi DNS. Bisa beberapa menit sampai beberapa jam.

## 5. Jalankan aplikasi production

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Saat aplikasi naik, migration database otomatis dijalankan sebelum container aplikasi start. Jika perlu menjalankan migration secara manual:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
```

Untuk instalasi pertama, isi akun admin demo:

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm seed
```

Setelah login pertama, ganti password admin demo melalui fitur user/admin agar aman.

## 6. Buka aplikasi

Buka:

```text
https://invoice.namaperusahaan.com
```

Caddy akan otomatis membuat HTTPS/SSL selama domain sudah mengarah ke IP VPS dan port 80/443 terbuka.

## 7. Backup harian

Buat folder backup dan izinkan script:

```bash
mkdir -p backups
chmod +x deploy/backup.sh deploy/restore.sh
```

Tes backup:

```bash
sh deploy/backup.sh
```

Jadwalkan backup harian jam 23:30:

```bash
crontab -e
```

Tambahkan:

```cron
30 23 * * * cd /opt/logisflow && sh deploy/backup.sh >> backups/backup.log 2>&1
```

Backup tersimpan 30 hari:

- `backups/db-*.sql`
- `backups/files-*.tar.gz`

## 8. Restore backup

```bash
sh deploy/restore.sh backups/db-YYYYMMDD-HHMMSS.sql backups/files-YYYYMMDD-HHMMSS.tar.gz
```

## 9. Migrasi data dari komputer kantor

Di komputer kantor, export database lokal:

```bash
pg_dump -U logis -d logis_invoice > logis_invoice_local.sql
```

Copy file SQL dan folder `storage` ke VPS.

Restore database di VPS:

```bash
sh deploy/restore.sh backups/logis_invoice_local.sql
```

Untuk file PDF/logo/TTD/bukti bayar, masukkan isi folder `storage` ke Docker volume `invoice_files`.

## 10. Update aplikasi setelah ada perubahan

Di VPS:

```bash
cd /opt/logisflow
docker compose -f docker-compose.prod.yml up -d --build
```

## Catatan keamanan

- Jangan bagikan file `.env`.
- Gunakan password PostgreSQL kuat.
- Jangan buka port database PostgreSQL ke internet.
- Backup wajib diuji restore minimal sekali.
- Setelah online, ganti password akun admin demo.
