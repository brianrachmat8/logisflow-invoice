"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PaymentProofForm({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(form: FormData) {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/payments/${paymentId}/proof`, { method: "POST", body: form });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) return setMessage(payload.error?.message || "Bukti pembayaran gagal diupload.");
    setMessage("Bukti pembayaran berhasil diupload.");
    router.refresh();
  }

  return (
    <form action={submit} className="actions" style={{ gap: 8, flexWrap: "wrap" }}>
      <input name="proof" type="file" accept=".jpg,.jpeg,.png,.pdf" required style={{ maxWidth: 220 }} />
      <button className="btn btn-secondary" disabled={loading}>{loading ? "Upload..." : "Upload bukti"}</button>
      {message && <small style={{ color: message.includes("berhasil") ? "var(--success)" : "var(--danger)", width: "100%" }}>{message}</small>}
    </form>
  );
}
