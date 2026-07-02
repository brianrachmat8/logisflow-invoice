"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

type PreviewInvoice = {
  key: string;
  type: "JASA" | "REIMBURSEMENT";
  reference: string;
  itemCount: number;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  outstandingAmount: number;
  amountInWords: string;
  items: { id: string; description: string; quantity: number; unitPrice: number; totalAmount: number }[];
};

type PreviewData = {
  totalGrand: number;
  advanceDpAmount: number;
  invoices: PreviewInvoice[];
};

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function GenerateInvoicePanel({
  shipmentId,
  hasDraft,
  isOtherOrder = false,
}: {
  shipmentId: string;
  hasDraft: boolean;
  isOtherOrder?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"split_by_bl" | "combine_jasa">("split_by_bl");
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [message, setMessage] = useState("");

  const effectiveMode = isOtherOrder ? "combine_jasa" : mode;

  async function previewInvoices() {
    setPreviewLoading(true);
    setMessage("");
    setPreview(null);
    const response = await fetch(`/api/shipments/${shipmentId}/preview-invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: effectiveMode }),
    });
    const payload = await response.json();
    setPreviewLoading(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Preview invoice gagal.");
      return;
    }
    setPreview(payload.data);
    setMessage("Preview simulasi berhasil dibuat. Belum ada invoice yang disimpan.");
  }

  async function generate() {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/shipments/${shipmentId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: effectiveMode, replaceDraft: true }),
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Generate invoice gagal.");
      return;
    }
    setMessage(hasDraft ? "Draft invoice berhasil diperbarui." : "Draft invoice berhasil dibuat.");
    setPreview(null);
    router.refresh();
  }

  function closePreview() {
    setPreview(null);
    setMessage("");
  }

  return (
    <div className="generate-panel">
      {!isOtherOrder && <div className="field">
        <label>Mode invoice JASA</label>
        <select value={mode} onChange={(event) => { setMode(event.target.value as "split_by_bl" | "combine_jasa"); setPreview(null); }}>
          <option value="split_by_bl">Pisah: 1 invoice JASA per B/L</option>
          <option value="combine_jasa">Gabung: 1 invoice JASA untuk semua B/L</option>
        </select>
      </div>}
      {isOtherOrder && <small style={{ color: "var(--muted)" }}>Order Lain-lain otomatis digenerate sebagai invoice gabungan tanpa B/L.</small>}
      <button className="btn btn-secondary" type="button" onClick={previewInvoices} disabled={previewLoading || loading}>
        {previewLoading && <LoaderCircle size={16} className="spin" />}
        {previewLoading ? "Membuat preview..." : "Preview simulasi"}
      </button>
      <button className="btn btn-primary" onClick={generate} disabled={loading || previewLoading}>
        {loading && <LoaderCircle size={16} className="spin" />}
        {loading ? "Memproses..." : hasDraft ? "Update draft invoice" : "Generate draft invoice"}
      </button>
      {message && <small style={{ color: message.includes("berhasil") ? "var(--success)" : "var(--danger)" }}>{message}</small>}
      {preview && <div className="card" style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.16)" }}>
        <div className="card-body" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <strong>Preview simulasi invoice</strong>
            <button className="btn btn-secondary" type="button" onClick={closePreview} style={{ padding: "8px 12px" }}>
              Tutup preview
            </button>
          </div>
          <small style={{ color: "rgba(255,255,255,.72)" }}>Ini hanya hitungan sementara. Nomor invoice belum dibuat dan database belum berubah.</small>
          <Link className="btn btn-secondary" href={`/shipments/${shipmentId}/invoice-preview?mode=${effectiveMode}`} target="_blank" style={{ width: "fit-content" }}>
            Buka preview visual
          </Link>
          <div style={{ display: "grid", gap: 10 }}>
            {preview.invoices.map((invoice) => <div key={invoice.key} style={{ borderTop: "1px solid rgba(255,255,255,.16)", paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <strong>{invoice.type} · {invoice.reference}</strong>
                <strong>{money.format(invoice.grandTotal)}</strong>
              </div>
              <small style={{ color: "rgba(255,255,255,.72)" }}>{invoice.itemCount} item · PPN {money.format(invoice.taxAmount)} · DP diterapkan {money.format(invoice.amountPaid)} · Sisa {money.format(invoice.outstandingAmount)}</small>
              <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                {invoice.items.slice(0, 4).map((item) => <small key={item.id} style={{ color: "rgba(255,255,255,.86)", display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span>{item.description} x {item.quantity}</span>
                  <span>{money.format(item.totalAmount)}</span>
                </small>)}
                {invoice.items.length > 4 && <small style={{ color: "rgba(255,255,255,.72)" }}>+{invoice.items.length - 4} item lainnya</small>}
              </div>
              <small style={{ color: "rgba(255,255,255,.72)" }}>Terbilang: {invoice.amountInWords}</small>
            </div>)}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.16)", paddingTop: 10, display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Total semua calon invoice</span>
            <strong>{money.format(preview.totalGrand)}</strong>
          </div>
        </div>
      </div>}
    </div>
  );
}
