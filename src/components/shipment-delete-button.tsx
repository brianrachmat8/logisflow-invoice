"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ShipmentDeleteButton({
  shipmentId,
  disabled,
  redirectTo,
  lockedReason = "Shipment ini sudah punya invoice final/lunas/berjalan. Batalkan invoice dahulu jika data memang salah.",
}: {
  shipmentId: string;
  disabled?: boolean;
  redirectTo?: string;
  lockedReason?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const buttonLabel = disabled ? "Terkunci" : "Hapus trial";

  async function removeShipment() {
    setMessage("");
    if (disabled) {
      setMessage(lockedReason);
      return;
    }
    if (!window.confirm("Hapus data trial shipment ini? Draft invoice, B/L, kontainer, biaya, dan file draft di shipment ini ikut terhapus. Invoice final/lunas tidak bisa dihapus dari sini.")) return;
    setLoading(true);
    const response = await fetch(`/api/shipments/${shipmentId}`, { method: "DELETE" });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Shipment gagal dihapus.");
      return;
    }
    if (redirectTo) {
      router.push(redirectTo);
      router.refresh();
      return;
    }
    router.refresh();
  }

  return (
    <div className="inline-action">
      <button className={`btn ${disabled ? "btn-secondary" : "btn-danger"}`} type="button" onClick={removeShipment} disabled={loading} title={disabled ? lockedReason : "Hapus data trial shipment"}>
        {loading ? "Menghapus..." : buttonLabel}
      </button>
      {message && <small style={{ color: disabled ? "var(--muted)" : "var(--danger)", display: "block", marginTop: 6, maxWidth: 260 }}>{message}</small>}
    </div>
  );
}
