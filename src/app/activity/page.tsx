import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { db } from "@/lib/db";
import { tanggal } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const logs = await db.activityLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 200 });
  return <AppShell title="Activity Log"><PageHead title="Jejak aktivitas" description="Catatan perubahan penting dan tindakan pengguna." />
    <div className="card"><div className="table-wrap"><table><thead><tr><th>Waktu</th><th>User</th><th>Modul</th><th>Aksi</th><th>Referensi</th></tr></thead><tbody>
      {logs.map((log) => <tr key={log.id}><td>{tanggal.format(log.createdAt)}<br/><small style={{ color: "var(--muted)" }}>{log.createdAt.toLocaleTimeString("id-ID")}</small></td><td>{log.user?.name || "System"}</td><td>{log.module}</td><td><span className="badge blue">{log.action}</span></td><td>{log.referenceId || "-"}</td></tr>)}
      {!logs.length && <tr><td colSpan={5} className="empty">Belum ada aktivitas.</td></tr>}</tbody></table></div></div>
  </AppShell>;
}
