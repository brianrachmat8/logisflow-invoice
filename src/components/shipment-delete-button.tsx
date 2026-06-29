"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ShipmentDeleteButton({ shipmentId, disabled }: { shipmentId: string; disabled?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function removeShipment() {
    setMessage("");
    if (disabled) {
      setMessage("Tidak bisa hapus shipment yang sudah punya invoice final/berjalan.");
      return;
    }
    if (!window.confirm("Hapus shipment ini? Draft invoice, B/L, kontainer, dan biaya di shipment ini ikut terhapus.")) return;
    setLoading(true);
    const response = await fetch(`/api/shipments/${shipmentId}`, { method: "DELETE" });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Shipment gagal dihapus.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="inline-action">
      <button className="btn btn-danger" type="button" onClick={removeShipment} disabled={loading}>
        {loading ? "Menghapus..." : "Delete"}
      </button>
      {message && <small style={{ color: "var(--danger)", display: "block", marginTop: 6 }}>{message}</small>}
    </div>
  );
}
