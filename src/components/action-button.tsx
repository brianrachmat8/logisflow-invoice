"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";

export function ActionButton({
  endpoint,
  label,
  confirm,
  className = "btn btn-primary",
}: {
  endpoint: string;
  label: string;
  confirm?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setLoading(true);
    setMessage("");
    const response = await fetch(endpoint, { method: "POST" });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Tindakan gagal.");
      return;
    }
    router.refresh();
  }
  return (
    <span>
      <button className={className} onClick={run} disabled={loading}>
        {loading && <LoaderCircle size={16} className="spin" />}
        {loading ? "Memproses..." : label}
      </button>
      {message && <small style={{ display: "block", color: "var(--danger)", marginTop: 6 }}>{message}</small>}
    </span>
  );
}
