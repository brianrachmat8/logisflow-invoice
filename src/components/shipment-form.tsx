"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; name: string };
type ShipmentDirection = "EXPORT" | "IMPORT" | "LAIN_LAIN";

const directionCopy: Record<ShipmentDirection, {
  title: string;
  description: string;
  workLabel: string;
  workPlaceholder: string;
  codeLabel: string;
  codePlaceholder: string;
  referenceLabel: string;
  referencePlaceholder: string;
  referenceHelp: string;
  submitLabel: string;
  nextStep: string;
}> = {
  EXPORT: {
    title: "Order Export",
    description: "Gunakan untuk pekerjaan export yang dokumen utamanya DO Number dan bisa dilanjutkan input B/L/kontainer bila diperlukan.",
    workLabel: "Vessel *",
    workPlaceholder: "MV Container Star",
    codeLabel: "Voyage *",
    codePlaceholder: "001A",
    referenceLabel: "DO Number (Export) *",
    referencePlaceholder: "JKTG26534800",
    referenceHelp: "Untuk order Export, isi DO Number sebagai referensi utama.",
    submitLabel: "Simpan & lanjut input B/L",
    nextStep: "Setelah shipment tersimpan, tambahkan B/L dan kontainer jika diperlukan.",
  },
  IMPORT: {
    title: "Order Import",
    description: "Gunakan untuk pekerjaan import yang dokumen utamanya B/L Number. Sistem akan membuat B/L awal otomatis dari nomor ini.",
    workLabel: "Vessel *",
    workPlaceholder: "CHENNAI VOYAGER",
    codeLabel: "Voyage *",
    codePlaceholder: "2606S",
    referenceLabel: "B/L Number (Import) *",
    referencePlaceholder: "SNKO010260504337",
    referenceHelp: "Untuk order Import, isi B/L Number. B/L awal akan dibuat otomatis.",
    submitLabel: "Simpan & lanjut input kontainer",
    nextStep: "Setelah shipment tersimpan, lanjut paste nomor kontainer dan input biaya.",
  },
  LAIN_LAIN: {
    title: "Order Lain-lain",
    description: "Gunakan untuk invoice non-trucking atau pekerjaan bebas. Tidak perlu carrier, B/L, atau kontainer.",
    workLabel: "Detail pekerjaan *",
    workPlaceholder: "Sewa truck dan driver",
    codeLabel: "Kode / periode",
    codePlaceholder: "Juli 2026 / 07",
    referenceLabel: "Referensi order *",
    referencePlaceholder: "INV-HANDLING-001",
    referenceHelp: "Isi nomor referensi, nama paket pekerjaan, atau nomor permintaan customer.",
    submitLabel: "Simpan & lanjut input biaya",
    nextStep: "Setelah job tersimpan, langsung tambahkan biaya tanpa B/L/kontainer.",
  },
};

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
  const [shipmentDirection, setShipmentDirection] = useState<ShipmentDirection>("EXPORT");
  const isOtherOrder = shipmentDirection === "LAIN_LAIN";
  const copy = directionCopy[shipmentDirection];

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
      <div className="card-head"><h3>Informasi pekerjaan</h3></div>
      <div className="card-body">
        <div className="field" style={{ marginBottom: 18 }}>
          <label>Jenis order *</label>
          <select name="shipmentDirection" value={shipmentDirection} onChange={(event) => setShipmentDirection(event.target.value as ShipmentDirection)}>
            <option value="EXPORT">Export</option>
            <option value="IMPORT">Import</option>
            <option value="LAIN_LAIN">Lain-lain</option>
          </select>
        </div>

        <div className="card" style={{ background: "#f7f9fd", marginBottom: 18 }}>
          <div className="card-body" style={{ display: "grid", gap: 6 }}>
            <strong>{copy.title}</strong>
            <small style={{ color: "var(--muted)", lineHeight: 1.55 }}>{copy.description}</small>
          </div>
        </div>

        <div className="grid-equal">
          <div className="field">
            <label>Klien *</label>
            <select name="clientId" required defaultValue=""><option value="" disabled>Pilih klien</option>{clients.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
          </div>
          {!isOtherOrder && <div className="field">
            <label>Carrier</label>
            <select name="carrierId" defaultValue=""><option value="">Belum ditentukan</option>{carriers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
          </div>}
          <div className="field">
            <label>{copy.workLabel}</label>
            <input name="vessel" required placeholder={copy.workPlaceholder} />
          </div>
          <div className="field">
            <label>{copy.codeLabel}</label>
            <input name="voyage" required={!isOtherOrder} placeholder={copy.codePlaceholder} />
          </div>
          <div className="field">
            <label>{copy.referenceLabel}</label>
            <input name="doNumber" required placeholder={copy.referencePlaceholder} />
            <small>{copy.referenceHelp}</small>
          </div>
          <div className="field"><label>{isOtherOrder ? "Tanggal pekerjaan *" : "Tanggal shipment *"}</label><input name="shipmentDate" type="date" required /></div>
          <div className="field">
            <label>{isOtherOrder ? "Penanggung jawab" : "Tim lapangan"}</label>
            <select name="fieldTeamId" defaultValue=""><option value="">Tidak ditentukan</option>{fieldTeams.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
          </div>
          <div className="field"><label>PIC internal</label><input name="internalPic" placeholder="Nama PIC operasional" /></div>
        </div>
        <div className="field" style={{ marginTop: 18 }}><label>Catatan</label><textarea name="notes" rows={3} placeholder={isOtherOrder ? "Detail tambahan pekerjaan, lokasi, atau instruksi customer" : "Catatan operasional"} /></div>
        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        <div className="actions" style={{ marginTop: 22 }}>
          <button className="btn btn-primary" disabled={loading}>{loading ? "Menyimpan..." : copy.submitLabel}</button>
          <small style={{ color: "var(--muted)", alignSelf: "center" }}>{copy.nextStep}</small>
        </div>
      </div>
    </form>
  );
}
