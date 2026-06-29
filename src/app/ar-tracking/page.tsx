import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { StatusBadge } from "@/components/status-badge";
import { agingBucket } from "@/lib/business";
import { db } from "@/lib/db";
import { numberValue, rupiah, tanggal } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ArTrackingPage() {
  const invoices = await db.invoice.findMany({
    where: { outstandingAmount: { gt: 0 }, status: { in: ["FINAL", "SENT", "PARTIAL_PAID", "OVERDUE"] } },
    include: { client: true },
    orderBy: { dueDate: "asc" },
  });
  const buckets = invoices.reduce<Record<string, number>>((acc, invoice) => {
    const key = agingBucket(invoice.dueDate).key;
    acc[key] = (acc[key] || 0) + numberValue(invoice.outstandingAmount);
    return acc;
  }, {});
  return <AppShell title="AR Tracking"><PageHead title="Aging piutang" description="Prioritaskan tagihan berdasarkan umur jatuh tempo." />
    <section className="metrics">
      <Bucket label="Belum jatuh tempo" value={buckets.NOT_DUE || 0} />
      <Bucket label="Jatuh tempo hari ini" value={buckets.DUE_TODAY || 0} />
      <Bucket label="Terlambat 1-14 hari" value={(buckets.OVERDUE_1_7 || 0) + (buckets.OVERDUE_8_14 || 0)} kind="warning" />
      <Bucket label="Terlambat >14 hari" value={(buckets.OVERDUE_15_30 || 0) + (buckets.OVERDUE_30_PLUS || 0)} kind="danger" />
    </section>
    <div className="card"><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Klien</th><th>Due date</th><th>Aging</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>
      {invoices.map((item) => { const aging = agingBucket(item.dueDate); return <tr key={item.id}><td><Link href={`/invoices/${item.id}`}><strong>{item.invoiceNumber}</strong></Link></td><td>{item.client.name}</td><td>{tanggal.format(item.dueDate)}</td><td><span className={`badge ${aging.days > 14 ? "red" : aging.days > 0 ? "orange" : "green"}`}>{aging.label}</span></td><td className="money">{rupiah.format(numberValue(item.outstandingAmount))}</td><td><StatusBadge status={item.status}/></td></tr>; })}
      {!invoices.length && <tr><td colSpan={6} className="empty">Tidak ada piutang outstanding.</td></tr>}</tbody></table></div></div>
  </AppShell>;
}
function Bucket({ label, value, kind = "" }: { label: string; value: number; kind?: string }) { return <div className={`metric ${kind}`}><div className="metric-label">{label}</div><div className="metric-value">{rupiah.format(value)}</div></div>; }
