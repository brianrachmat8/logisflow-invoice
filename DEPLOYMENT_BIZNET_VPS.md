# Panduan Deployment LogisFlow di Biznet VPS

Panduan ini menyiapkan aplikasi LogisFlow Invoice agar berjalan online di VPS Biznet memakai Docker Compose, PostgreSQL, dan Caddy HTTPS otomatis.

## Target akhir

- Aplikasi bisa dibuka dari domain/subdomain, contoh `https://invoice.namaperusahaan.com`.
- Database PostgreSQL hanya bisa diakses dari dalam VPS.
- File PDF, Excel, logo, tanda tangan, dan bukti bayar tersimpan di Docker volume `invoice_files`.
- HTTPS aktif otomatis melalui Caddy dan Let's Encrypt.
- Backup database dan file berjalan harian.

## 1. Data yang perlu disiapkan

Siapkan sebelum mulai:

- IP publik VPS Biznet.
- Domain atau subdomain untuk aplikasi invoice.
- Email aktif untuk sertifikat SSL.
- Password PostgreSQL production yang kuat.
- Secret Auth.js minimal 32 karakter.

Contoh nama yang dipakai di panduan ini:

```text
Domain: invoice.namaperusahaan.com
Folder VPS: /opt/logisflow
User server: root atau user sudo
```

## 2. Arahkan DNS ke VPS Biznet

Di panel DNS domain, buat record:

```text
Type: A
Name: invoice
Value: IP_PUBLIK_VPS_BIZNET
TTL: Auto atau 300
```

Cek dari komputer lokal:

```bash
nslookup invoice.namaperusahaan.com
```

Lanjutkan setelah hasilnya mengarah ke IP VPS Biznet. Propagasi DNS bisa butuh beberapa menit sampai beberapa jam.

## 3. Buka akses firewall

Pastikan port berikut terbuka di firewall VPS/panel Biznet dan firewall Ubuntu:

```text
22/tcp  SSH
80/tcp  HTTP untuk validasi SSL Caddy
443/tcp HTTPS aplikasi
```

Jika Ubuntu memakai UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Jangan buka port PostgreSQL `5432` ke internet.

## 4. Install paket dasar dan Docker

Masuk ke VPS lewat SSH, lalu jalankan:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nano ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Logout dari SSH lalu login kembali agar akses Docker aktif.

Cek instalasi:

```bash
docker --version
docker compose version
```

## 5. Upload atau clone project

Pakai folder tetap agar backup dan update mudah:

```bash
sudo mkdir -p /opt/logisflow
sudo chown -R $USER:$USER /opt/logisflow
cd /opt/logisflow
```

Jika repo sudah ada di GitHub:

```bash
git clone https://github.com/brianrachmat8/logisflow-invoice.git .
```

Jika memakai upload manual, pastikan isi project berada langsung di `/opt/logisflow`, bukan di subfolder tambahan.

## 6. Buat file environment production

```bash
cp .env.production.example .env
nano .env
```

Isi nilai production:

```env
APP_DOMAIN=invoice.namaperusahaan.com
APP_URL=https://invoice.namaperusahaan.com
AUTH_URL=https://invoice.namaperusahaan.com
NEXTAUTH_URL=https://invoice.namaperusahaan.com
AUTH_SECRET=isi-dengan-secret-random-minimal-32-karakter
POSTGRES_PASSWORD=isi-dengan-password-postgres-kuat
ACME_EMAIL=admin@namaperusahaan.com
TZ=Asia/Jakarta
```

Buat secret acak:

```bash
openssl rand -base64 32
```

Simpan hasilnya sebagai `AUTH_SECRET`.

## 7. Jalankan aplikasi

Build dan jalankan container production:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Terapkan schema database:

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
```

Untuk instalasi pertama, buat data demo/admin awal:

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm seed
```

Cek status:

```bash
docker compose -f docker-compose.prod.yml ps
```

## 8. Login pertama

Buka:

```text
https://invoice.namaperusahaan.com
```

Login demo setelah seed:

```text
Email: admin@logisflow.id
Password: LogisFlow123!
```

Setelah berhasil login, segera ganti password admin demo dan buat akun user production sesuai role.

## 9. Cek log saat ada masalah

Lihat semua log:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Lihat log aplikasi saja:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

Lihat log Caddy/SSL:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

Masalah umum:

- Domain belum mengarah ke IP VPS: tunggu DNS atau perbaiki A record.
- Port 80/443 tertutup: buka firewall panel VPS dan UFW.
- HTTPS gagal: pastikan `APP_DOMAIN` benar dan tanpa `https://`.
- Login error setelah deploy: cek `AUTH_SECRET`, `AUTH_URL`, `NEXTAUTH_URL`, dan log `app`.
- Build gagal karena memori: hentikan service lain sementara atau gunakan VPS dengan RAM lebih besar.

## 10. Backup harian

Tes backup manual:

```bash
mkdir -p backups
chmod +x deploy/backup.sh deploy/restore.sh
sh deploy/backup.sh
```

Jadwalkan backup harian pukul 23:30 WIB:

```bash
crontab -e
```

Tambahkan:

```cron
30 23 * * * cd /opt/logisflow && sh deploy/backup.sh >> backups/backup.log 2>&1
```

File backup tersimpan di folder `backups` dan otomatis dibersihkan setelah 30 hari:

- `db-YYYYMMDD-HHMMSS.sql`
- `files-YYYYMMDD-HHMMSS.tar.gz`

Sebaiknya salin backup penting ke tempat lain secara berkala, misalnya laptop kantor atau storage cloud internal.

## 11. Restore backup

Restore database saja:

```bash
sh deploy/restore.sh backups/db-YYYYMMDD-HHMMSS.sql
```

Restore database dan file storage:

```bash
sh deploy/restore.sh backups/db-YYYYMMDD-HHMMSS.sql backups/files-YYYYMMDD-HHMMSS.tar.gz
```

Setelah restore, cek ulang aplikasi:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 app
```

## 12. Update aplikasi berikutnya

Jika source diambil dari GitHub:

```bash
cd /opt/logisflow
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
```

Jika ada perubahan file `.env`, restart ulang:

```bash
docker compose -f docker-compose.prod.yml up -d
```

## 13. Checklist sebelum dipakai operasional

- Domain sudah membuka aplikasi via HTTPS.
- Password admin demo sudah diganti.
- Akun user dan role sudah dibuat.
- Data perusahaan, rekening bank, logo, dan tanda tangan sudah diisi.
- Tarif pajak aktif sudah dikonfirmasi di Settings.
- Backup manual berhasil dibuat dan file backup terlihat di folder `backups`.
- Restore backup pernah diuji minimal di server test atau sebelum data production berjalan.
