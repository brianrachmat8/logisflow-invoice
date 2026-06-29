# LogisFlow

MVP aplikasi internal otomasi invoice logistik berbasis Next.js, PostgreSQL, Prisma, dan Auth.js.

## Menjalankan secara lokal

1. Salin `.env.example` menjadi `.env`.
2. Jalankan PostgreSQL dan pastikan `DATABASE_URL` benar.
3. Instal dependensi: `pnpm install`.
4. Buat struktur database: `pnpm prisma db push`.
5. Isi data demo: `pnpm db:seed`.
6. Jalankan aplikasi: `pnpm dev`.

Login demo:

- Email: `admin@logisflow.id`
- Password: `LogisFlow123!`

Seed memasang tarif PPN 11% hanya untuk data demonstrasi. Pada instalasi production kosong, Super Admin harus mengaktifkan tarif melalui menu Settings.

## Docker VPS

1. Buat `.env` dan isi `AUTH_SECRET` serta `POSTGRES_PASSWORD`.
2. Jalankan `docker compose up -d --build`.
3. Terapkan schema dan seed dari container build/administrasi sebelum penggunaan pertama.
4. Pasang HTTPS di reverse proxy atau load balancer VPS.
5. Jadwalkan `deploy/backup.ps1` setiap hari. Backup lama dibersihkan setelah 30 hari.

## Modul

- Login credential dan RBAC empat role.
- Master data dan konfigurasi tarif pajak.
- Shipment, B/L, paste massal hingga 500 kontainer, dan charges.
- Preview split serta draft invoice JASA per B/L dan reimbursement gabungan.
- Finalisasi dengan nomor atomik, PDF, Excel, partial payment, dan bukti bayar.
- Dashboard, AR tracking, laporan Excel, dan activity log.

## Pemeriksaan

```bash
pnpm test
pnpm lint
pnpm build
```
