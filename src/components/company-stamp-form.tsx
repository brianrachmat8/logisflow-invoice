"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CompanyStampForm({ companyId, hasStamp }: { companyId: string; hasStamp: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(form: FormData) {
    setMessage("");
    const response = await fetch("/api/company-assets/stamp", { method: "POST", body: form });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error?.message || "Upload stampel gagal.");
      return;
    }
    setMessage("Stampel berhasil disimpan.");
    router.refresh();
  }

  return (
    <form action={submit} className="field">
      <input type="hidden" name="companyId" value={companyId} />
      <label>Upload stampel</label>
      <input name="stamp" type="file" accept=".png" required />
      <small>Format PNG transparan. Stampel akan berada di belakang/ditiban oleh TTD pada PDF invoice.</small>
      {hasStamp && <small style={{ color: "var(--success)" }}>Stampel sudah tersimpan.</small>}
      {message && <small style={{ color: message.includes("berhasil") ? "var(--success)" : "var(--danger)" }}>{message}</small>}
      <button className="btn btn-secondary" type="submit">Simpan stampel</button>
    </form>
  );
}
