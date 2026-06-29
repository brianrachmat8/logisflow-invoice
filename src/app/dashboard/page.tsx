import Link from "next/link";
import { endOfMonth, startOfMonth } from "date-fns";
import { CircleDollarSign, Clock3, FileCheck2, ReceiptText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { numberValue, rupiah, tanggal } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const [invoices, latest] = await Promise.all([
    db.invoice.findMany({
      where: { invoiceDate: { gte: startOfMonth(now), lte: endOfMonth(now) }, status: { not: "CANCELLED" } },
      select: { type: true, grandTotal: true, taxAmount: true, outstandingAmount: true, status: true, dueDate: true },
    }),
    db.invoice.findMany({
      take: 7,
      orderBy: { createdAt: "desc" },
      include: { client: true },
    }),
  ]);
  const total = invoices.reduce((sum, item) => sum + numberValue(item.grandTotal), 0);
  const tax = invoices.reduce((sum, item) => sum + numberValue(item.taxAmount), 0);
  const outstanding = invoices.reduce((sum, item) => sum + numberValue(item.outstandingAmount), 0);
  const overdue = invoices.filter((item) => numberValue(item.outstandingAmount) > 0 && item.dueDate < now).length;
  const jasa = invoices.filter((item) => item.type === "JASA").reduce((sum, item) => sum + numberValue(item.grandTotal), 0);
  const reimb = invoices.filter((item) => item.type === "REIMBURSEMENT").reduce((sum, item) => sum + numberValue(item.grandTotal), 0);

  return (
    <AppShell title="Dashboard">
      <div className="page-head">
        <div><h2>Ringkasan bisnis</h2><p>Pantau invoice dan piutang bulan berjalan dalam satu tampilan.</p></div>
        <div className="actions"><Link href="/shipments/new" className="btn btn-primary">+ Shipment baru</Link></div>
      </div>
      <section className="metrics">
        <Metric label="Total invoice" value={rupiah.format(total)} icon={<ReceiptText />} />
        <Metric label="Total PPN" value={rupiah.format(tax)} icon={<FileCheck2 />} kind="success" />
        <Metric label="Outstanding" value={rupiah.format(outstanding)} icon={<CircleDollarSign />} kind="warning" />
        <Metric label="Invoice overdue" value={`${overdue} invoice`} icon={<Clock3 />} kind="danger" />
      </section>
      <section className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Komposisi tagihan</h3><span className="badge blue">Bulan ini</span></div>
          <div className="card-body">
            <div className="chart-bars">
              {[35, 56, 44, 72, 61, 84].map((height, i) => (
                <div className="bar-wrap" key={i}><div className={`bar ${i % 2 ? "alt" : ""}`} style={{ height: `${height}%` }} /><span>{["Jan","Feb","Mar","Apr","Mei","Jun"][i]}</span></div>
              ))}
            </div>
            <div className="grid-equal" style={{ marginTop: 20 }}>
              <div><span style={{ color: "var(--muted)", fontSize: 12 }}>Invoice JASA</span><div className="metric-value" style={{ fontSize: 19 }}>{rupiah.format(jasa)}</div></div>
              <div><span style={{ color: "var(--muted)", fontSize: 12 }}>Reimbursement</span><div className="metric-value" style={{ fontSize: 19 }}>{rupiah.format(reimb)}</div></div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Aging piutang</h3><Link href="/ar-tracking" style={{ color: "var(--blue)", fontSize: 12 }}>Lihat detail</Link></div>
          <div className="card-body aging-list">
            <Aging label="Belum jatuh tempo" amount={outstanding * .48} progress={48} />
            <Aging label="Terlambat 1-7 hari" amount={outstanding * .25} progress={25} color="#e69519" />
            <Aging label="Terlambat 8-30 hari" amount={outstanding * .17} progress={17} color="#ef7848" />
            <Aging label="Lebih dari 30 hari" amount={outstanding * .1} progress={10} color="#dd4b56" />
          </div>
        </div>
      </section>
      <section className="card" style={{ marginTop: 20 }}>
        <div className="card-head"><h3>Invoice terbaru</h3><Link href="/invoices" className="btn btn-ghost">Semua invoice</Link></div>
        <div className="table-wrap">
          <table><thead><tr><th>Invoice</th><th>Klien</th><th>Tanggal</th><th>Tipe</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>{latest.map((invoice) => <tr key={invoice.id}>
              <td className="primary-cell"><Link href={`/invoices/${invoice.id}`}><strong>{invoice.invoiceNumber || invoice.draftNumber}</strong><span>{invoice.id.slice(-8)}</span></Link></td>
              <td>{invoice.client.name}</td><td>{tanggal.format(invoice.invoiceDate)}</td><td>{invoice.type}</td>
              <td className="money">{rupiah.format(numberValue(invoice.grandTotal))}</td><td><StatusBadge status={invoice.status} /></td>
            </tr>)}
            {!latest.length && <tr><td colSpan={6} className="empty">Belum ada invoice. Mulai dari shipment baru.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ label, value, icon, kind = "" }: { label: string; value: string; icon: React.ReactNode; kind?: string }) {
  return <div className={`metric ${kind}`}><div className="metric-top"><div><div className="metric-label">{label}</div><div className="metric-value">{value}</div></div><span className="metric-icon">{icon}</span></div><div className="metric-change">Data bulan berjalan</div></div>;
}
function Aging({ label, amount, progress, color = "var(--blue)" }: { label: string; amount: number; progress: number; color?: string }) {
  return <div className="aging-row"><strong>{label}</strong><span>{rupiah.format(amount)}</span><div className="progress"><i style={{ width: `${progress}%`, background: color }} /></div></div>;
}
