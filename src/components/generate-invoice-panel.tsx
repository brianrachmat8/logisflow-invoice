"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

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
  const [message, setMessage] = useState("");

  async function generate() {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/shipments/${shipmentId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: isOtherOrder ? "combine_jasa" : mode, replaceDraft: true }),
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Generate invoice gagal.");
      return;
    }
    setMessage(hasDraft ? "Draft invoice berhasil diperbarui." : "Draft invoice berhasil dibuat.");
    router.refresh();
  }

  return (
    <div className="generate-panel">
      {!isOtherOrder && <div className="field">
        <label>Mode invoice JASA</label>
        <select value={mode} onChange={(event) => setMode(event.target.value as "split_by_bl" | "combine_jasa")}>
          <option value="split_by_bl">Pisah: 1 invoice JASA per B/L</option>
          <option value="combine_jasa">Gabung: 1 invoice JASA untuk semua B/L</option>
        </select>
      </div>}
      {isOtherOrder && <small style={{ color: "var(--muted)" }}>Order Lain-lain otomatis digenerate sebagai invoice gabungan tanpa B/L.</small>}
      <button className="btn btn-primary" onClick={generate} disabled={loading}>
        {loading && <LoaderCircle size={16} className="spin" />}
        {loading ? "Memproses..." : hasDraft ? "Update draft invoice" : "Generate draft invoice"}
      </button>
      {message && <small style={{ color: message.includes("berhasil") ? "var(--success)" : "var(--danger)" }}>{message}</small>}
    </div>
  );
}
