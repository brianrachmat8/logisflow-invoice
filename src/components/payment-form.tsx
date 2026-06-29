"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PaymentForm({ invoiceId, max }: { invoiceId: string; max: number }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const numericAmount = Number(amount || 0);
  const formattedAmount = amount ? Number(amount).toLocaleString("id-ID") : "";
  async function submit(form: FormData) {
    const response = await fetch(`/api/invoices/${invoiceId}/payments`, { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error?.message || "Pembayaran gagal.");
    setMessage("Pembayaran berhasil dicatat.");
    router.refresh();
  }
  return (
    <form action={submit} className="form-stack">
      <div className="grid-equal">
        <div className="field"><label>Tanggal bayar</label><input name="paymentDate" type="date" required /></div>
        <div className="field">
          <label>Nominal DP / pembayaran (maks. Rp {max.toLocaleString("id-ID")})</label>
          <input
            inputMode="numeric"
            placeholder="Contoh: 1.900.000"
            value={formattedAmount}
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
            required
          />
          <input name="amount" type="hidden" value={amount} />
          <small>
            Titik ribuan otomatis ditambahkan agar tidak salah ketik. Contoh: ketik 1900000 menjadi 1.900.000.
            {numericAmount > 0 && numericAmount < max && " Nominal ini akan tercatat sebagai DP / partial."}
            {numericAmount === max && " Nominal ini akan membuat invoice PAID / lunas."}
            {numericAmount > max && " Nominal melebihi sisa tagihan dan akan ditolak."}
          </small>
        </div>
        <div className="field">
          <label>Keterangan pembayaran</label>
          <select name="paymentKind">
            <option value="DP">DP / Partial</option>
            <option value="PELUNASAN">Pelunasan / Paid</option>
          </select>
        </div>
        <div className="field"><label>Metode</label><select name="method"><option>Transfer Bank</option><option>Cash</option><option>Lainnya</option></select></div>
        <div className="field"><label>Referensi bank</label><input name="bankReference" /></div>
      </div>
      <div className="field"><label>Bukti pembayaran (JPG/PNG/PDF, maks 5 MB)</label><input name="proof" type="file" accept=".jpg,.jpeg,.png,.pdf" /></div>
      <div className="field"><label>Catatan</label><textarea name="notes" rows={2} /></div>
      {message && <small style={{ color: message.includes("berhasil") ? "var(--success)" : "var(--danger)" }}>{message}</small>}
      <button className="btn btn-primary">Simpan DP / pembayaran</button>
    </form>
  );
}
