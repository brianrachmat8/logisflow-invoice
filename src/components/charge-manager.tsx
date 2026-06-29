"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Bill = { id: string; number: string };
type Charge = {
  id: string;
  billId: string | null;
  billNumber: string | null;
  name: string;
  description: string | null;
  category: "JASA" | "REIMBURSEMENT";
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  totalAmount: number;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function formatMoneyInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("id-ID").format(Number(digits));
}

function parseMoneyInput(value: unknown) {
  return Number(String(value || "").replace(/\D/g, "")) || 0;
}

async function request(endpoint: string, method: "PATCH" | "DELETE", data: unknown) {
  const response = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "Permintaan gagal.");
  return payload.data;
}

export function ChargeManager({ shipmentId, bills, charges }: { shipmentId: string; bills: Bill[]; charges: Charge[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(charges.map((charge) => [charge.id, formatMoneyInput(charge.unitPrice)])),
  );
  const endpoint = useMemo(() => `/api/shipments/${shipmentId}/charges`, [shipmentId]);

  async function updateCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    try {
      await request(endpoint, "PATCH", {
        ...raw,
        unitPrice: parseMoneyInput(raw.unitPrice),
      });
      setPrices((current) => ({ ...current, [String(raw.id)]: formatMoneyInput(parseMoneyInput(raw.unitPrice)) }));
      setMessage("Biaya berhasil diubah.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Biaya gagal diubah.");
    }
  }

  async function deleteCharge(id: string) {
    setMessage("");
    if (!window.confirm("Hapus biaya ini?")) return;
    try {
      await request(endpoint, "DELETE", { id });
      setMessage("Biaya berhasil dihapus.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Biaya gagal dihapus.");
    }
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-head"><h3>Charges / Biaya</h3></div>
      {message && <p className="form-note" style={{ color: message.includes("berhasil") ? "var(--success)" : "var(--danger)" }}>{message}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Biaya</th><th>B/L</th><th>Kategori</th><th>Qty</th><th>Harga</th><th>PPN</th><th>Total</th><th>Aksi</th></tr></thead>
          <tbody>
            {charges.map((charge) => (
              <tr key={charge.id}>
                <td className="primary-cell"><strong>{charge.name}</strong><span>{charge.description || "-"}</span></td>
                <td>{charge.billNumber || "-"}</td>
                <td><span className={`badge ${charge.category === "JASA" ? "blue" : "orange"}`}>{charge.category}</span></td>
                <td>{charge.quantity}</td>
                <td>{rupiah.format(charge.unitPrice)}</td>
                <td>{rupiah.format(charge.taxAmount)}</td>
                <td className="money">{rupiah.format(charge.totalAmount)}</td>
                <td>
                  <div className="actions compact-actions">
                    <details className="inline-editor">
                      <summary>Edit</summary>
                      <form className="charge-edit-form" onSubmit={updateCharge}>
                        <input type="hidden" name="id" value={charge.id} />
                        <div className="field"><label>Nama biaya</label><input name="name" defaultValue={charge.name} required /></div>
                        <div className="field">
                          <label>Kategori</label>
                          <select name="category" defaultValue={charge.category}>
                            <option value="JASA">JASA</option>
                            <option value="REIMBURSEMENT">REIMBURSEMENT</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Terkait B/L</label>
                          <select name="billId" defaultValue={charge.billId || ""}>
                            <option value="">Level shipment</option>
                            {bills.map((bill) => <option value={bill.id} key={bill.id}>{bill.number}</option>)}
                          </select>
                        </div>
                        <div className="field"><label>Deskripsi</label><input name="description" defaultValue={charge.description || ""} /></div>
                        <div className="field"><label>Quantity</label><input name="quantity" type="number" min="0.01" step="0.01" defaultValue={charge.quantity} required /></div>
                        <div className="field">
                          <label>Harga satuan</label>
                          <input
                            name="unitPrice"
                            inputMode="numeric"
                            value={prices[charge.id] ?? ""}
                            onChange={(event) => setPrices((current) => ({ ...current, [charge.id]: formatMoneyInput(event.target.value) }))}
                            placeholder="19.000.000"
                            required
                          />
                        </div>
                        <button className="btn btn-primary">Simpan edit</button>
                      </form>
                    </details>
                    <button className="btn btn-danger" type="button" onClick={() => deleteCharge(charge.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!charges.length && <tr><td colSpan={8} className="empty">Belum ada biaya.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
