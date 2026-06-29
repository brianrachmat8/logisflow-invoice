"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";

type Bill = { id: string; number: string };
type AdvanceDp = {
  amount: number;
  paymentDate: string;
  method: string;
  reference: string;
  notes: string;
};

function formatMoneyInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID").format(Number(digits));
}

function parseMoneyInput(value: unknown) {
  return Number(String(value || "").replace(/\D/g, "")) || 0;
}

async function post(endpoint: string, data: unknown) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "Permintaan gagal.");
  return payload.data;
}

export function ShipmentWorkspace({ shipmentId, bills, advanceDp }: { shipmentId: string; bills: Bill[]; advanceDp?: AdvanceDp }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"bill" | "container" | "charge">("bill");
  const [dpMode, setDpMode] = useState<"NO_DP" | "WITH_DP">("NO_DP");
  const [unitPrice, setUnitPrice] = useState("");
  const [advanceDpAmount, setAdvanceDpAmount] = useState("");
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    try {
      if (mode === "bill") {
        await post(`/api/shipments/${shipmentId}/bills`, raw);
      } else if (mode === "container") {
        await post(`/api/shipments/${shipmentId}/containers`, {
          ...raw,
          numbers: String(raw.numbers).split(/\r?\n|,|\s+/).filter(Boolean),
        });
      } else {
        await post(`/api/shipments/${shipmentId}/charges`, {
          ...raw,
          unitPrice: parseMoneyInput(raw.unitPrice),
          advanceDpAmount: raw.dpMode === "WITH_DP" ? parseMoneyInput(raw.advanceDpAmount) : 0,
        });
      }
      form.reset();
      setUnitPrice("");
      setDpMode("NO_DP");
      setAdvanceDpAmount("");
      setMessage("Data berhasil disimpan.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data gagal disimpan.");
    }
  }
  return (
    <div className="card">
      <div className="tabs">
        <button className={`tab ${mode === "bill" ? "active" : ""}`} onClick={() => setMode("bill")}><Plus size={14} /> Tambah B/L</button>
        <button className={`tab ${mode === "container" ? "active" : ""}`} onClick={() => setMode("container")}><Upload size={14} /> Paste Kontainer</button>
        <button className={`tab ${mode === "charge" ? "active" : ""}`} onClick={() => setMode("charge")}><Plus size={14} /> Tambah Biaya</button>
      </div>
      <form className="card-body" onSubmit={handle}>
        {mode === "bill" && (
          <div className="grid-equal">
            <div className="field">
              <label>B/L Number (Impor) *</label>
              <input name="number" required placeholder="BL001" />
              <small>Untuk shipment Import, B/L awal biasanya sudah otomatis dibuat dari nomor import. Tambahkan hanya jika ada B/L lain.</small>
            </div>
            <div className="field"><label>Catatan</label><input name="notes" placeholder="Opsional" /></div>
          </div>
        )}
        {mode === "container" && (
          <>
            <div className="grid-equal">
              <div className="field"><label>B/L *</label><select name="billId" required defaultValue=""><option value="" disabled>Pilih B/L</option>{bills.map((b) => <option value={b.id} key={b.id}>{b.number}</option>)}</select></div>
              <div className="field"><label>Ukuran</label><select name="size" defaultValue="40HC"><option>20FT</option><option>40FT</option><option>40HC</option><option>45FT</option></select></div>
              <div className="field"><label>Tipe</label><select name="type" defaultValue="HC"><option>GP</option><option>HC</option><option>RF</option><option>FR</option><option>OT</option></select></div>
            </div>
            <div className="field" style={{ marginTop: 16 }}><label>Nomor kontainer (satu per baris, maksimal 500)</label><textarea name="numbers" rows={6} required placeholder={"ONEU1234567\nTCLU7654321"} /></div>
          </>
        )}
        {mode === "charge" && (
          <>
            <div className="grid-equal">
              <div className="field"><label>Nama biaya *</label><input name="name" required placeholder="Trucking" /></div>
              <div className="field"><label>Kategori *</label><select name="category" defaultValue="JASA"><option value="JASA">JASA</option><option value="REIMBURSEMENT">REIMBURSEMENT</option></select></div>
              <div className="field"><label>Terkait B/L</label><select name="billId" defaultValue=""><option value="">Level shipment</option>{bills.map((b) => <option value={b.id} key={b.id}>{b.number}</option>)}</select></div>
              <div className="field"><label>Deskripsi</label><input name="description" /></div>
              <div className="field"><label>Quantity *</label><input name="quantity" type="number" min="0.01" step="0.01" required /></div>
              <div className="field">
                <label>Harga satuan *</label>
                <input
                  name="unitPrice"
                  inputMode="numeric"
                  value={unitPrice}
                  onChange={(event) => setUnitPrice(formatMoneyInput(event.target.value))}
                  placeholder="19.000.000"
                  required
                />
              </div>
            </div>
            <div className="card" style={{ marginTop: 18, background: "#f7f9fd" }}>
              <div className="card-body form-stack">
                <strong>DP awal / uang muka</strong>
                <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
                  Opsional. Isi di sini jika klien sudah bayar DP atau langsung lunas saat input biaya pertama. Nominal ini nanti otomatis mengurangi sisa tagihan invoice saat digenerate.
                </p>
                {advanceDp?.amount ? <div className="summary-line">
                  <span>DP/lunas awal tersimpan</span>
                  <strong>Rp {advanceDp.amount.toLocaleString("id-ID")}</strong>
                </div> : null}
                <div className="field">
                  <label>Pembayaran awal</label>
                  <select name="dpMode" value={dpMode} onChange={(event) => setDpMode(event.target.value as "NO_DP" | "WITH_DP")}>
                    <option value="NO_DP">Tanpa DP</option>
                    <option value="WITH_DP">Ada DP / Lunas awal</option>
                  </select>
                  <small>Pilih “Ada DP / Lunas awal” hanya saat ingin mencatat pembayaran awal baru atau mengganti nominal yang tersimpan.</small>
                </div>
                {dpMode === "WITH_DP" && <>
                  <div className="grid-equal">
                    <div className="field">
                      <label>Nominal DP / lunas awal</label>
                      <input
                        name="advanceDpAmount"
                        inputMode="numeric"
                        value={advanceDpAmount}
                        onChange={(event) => setAdvanceDpAmount(formatMoneyInput(event.target.value))}
                        placeholder="Contoh: 1.900.000"
                        required
                      />
                      <small>Titik ribuan otomatis ditambahkan. Jika customer sudah transfer lunas, isi nominal lunasnya di sini.</small>
                    </div>
                    <div className="field"><label>Tanggal DP</label><input name="advanceDpDate" type="date" /></div>
                    <div className="field"><label>Metode DP</label><select name="advanceDpMethod" defaultValue="Transfer Bank"><option>Transfer Bank</option><option>Cash</option><option>Lainnya</option></select></div>
                    <div className="field"><label>Referensi DP</label><input name="advanceDpReference" placeholder="No referensi bank" /></div>
                  </div>
                  <div className="field"><label>Catatan DP</label><input name="advanceDpNotes" placeholder="Opsional" /></div>
                </>}
              </div>
            </div>
          </>
        )}
        {message && <p style={{ color: message.includes("berhasil") ? "var(--success)" : "var(--danger)", fontSize: 13 }}>{message}</p>}
        <button className="btn btn-primary" type="submit" style={{ marginTop: 18 }}>Simpan data</button>
      </form>
    </div>
  );
}
