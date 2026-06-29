"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; name: string };

export function ShipmentForm({
  clients, carriers, fieldTeams,
}: {
  clients: Option[];
  carriers: Option[];
  fieldTeams: Option[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shipmentDirection, setShipmentDirection] = useState<"EXPORT" | "IMPORT">("EXPORT");
  async function submit(formData: FormData) {
    setLoading(true);
    setError("");
    const body = Object.fromEntries(formData);
    const response = await fetch("/api/shipments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) return setError(payload.error?.message || "Shipment gagal dibuat.");
    router.push(`/shipments/${payload.data.id}`);
    router.refresh();
  }
  return (
    <form action={submit} className="card">
      <div className="card-head"><h3>Informasi shipment</h3></div>
      <div className="card-body">
        <div className="grid-equal">
          <div className="field">
            <label>Klien *</label>
            <select name="clientId" required defaultValue=""><option value="" disabled>Pilih klien</option>{clients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
          </div>
          <div className="field">
            <label>Carrier</label>
            <select name="carrierId" defaultValue=""><option value="">Belum ditentukan</option>{carriers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
          </div>
          <div className="field">
            <label>Jenis order *</label>
            <select name="shipmentDirection" value={shipmentDirection} onChange={(event) => setShipmentDirection(event.target.value as "EXPORT" | "IMPORT")}>
              <option value="EXPORT">Export</option>
              <option value="IMPORT">Import</option>
            </select>
            <small>Pilih Export jika dokumen utamanya DO Number. Pilih Import jika dokumen utamanya B/L Number.</small>
          </div>
          <div className="field"><label>Vessel *</label><input name="vessel" required placeholder="MV Container Star" /></div>
          <div className="field"><label>Voyage *</label><input name="voyage" required placeholder="001A" /></div>
          <div className="field">
            <label>{shipmentDirection === "EXPORT" ? "DO Number (Export)" : "B/L Number (Import)"} *</label>
            <input name="doNumber" required placeholder={shipmentDirection === "EXPORT" ? "JKTG26534800" : "SNKO010260504337"} />
            <small>{shipmentDirection === "EXPORT" ? "Untuk order Export, isi DO Number." : "Untuk order Import, isi B/L Number. Sistem akan membuat B/L awal otomatis."}</small>
          </div>
          <div className="field"><label>Tanggal shipment *</label><input name="shipmentDate" type="date" required /></div>
          <div className="field">
            <label>Tim lapangan</label>
            <select name="fieldTeamId" defaultValue=""><option value="">Tidak ditentukan</option>{fieldTeams.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
          </div>
          <div className="field"><label>PIC internal</label><input name="internalPic" placeholder="Nama PIC operasional" /></div>
        </div>
        <div className="field" style={{ marginTop: 18 }}><label>Catatan</label><textarea name="notes" rows={3} /></div>
        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        <div className="actions" style={{ marginTop: 22 }}>
          <button className="btn btn-primary" disabled={loading}>{loading ? "Menyimpan..." : "Simpan & lanjut input B/L"}</button>
          <small style={{ color: "var(--muted)", alignSelf: "center" }}>{shipmentDirection === "EXPORT" ? "Setelah shipment tersimpan, tambahkan B/L jika diperlukan." : "B/L awal otomatis dibuat dari nomor import yang diisi."}</small>
        </div>
      </div>
    </form>
  );
}
