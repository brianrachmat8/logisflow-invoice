import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { numberValue, rupiah, tanggal } from "@/lib/format";
import { invoiceDisplayStatus } from "@/lib/invoice-status";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const invoices = await db.invoice.findMany({
    include: { client: true, shipment: true, bill: true },
    orderBy: { createdAt: "desc" },
  });
  return <AppShell title="Invoice">
    <PageHead title="Semua invoice" description="Review draft, finalisasi, dan unduh dokumen tagihan." />
    <div className="card">
      <div className="filters"><input className="filter-input search" placeholder="Cari nomor invoice atau klien..." /><select className="filter-input"><option>Semua tipe</option><option>JASA</option><option>REIMBURSEMENT</option></select><select className="filter-input"><option>Semua status</option></select></div>
      <div className="table-wrap"><table><thead><tr><th>Nomor invoice</th><th>Klien</th><th>Job / B/L</th><th>Tanggal</th><th>Tipe</th><th>Total</th><th>Status</th></tr></thead><tbody>
        {invoices.map((item) => <tr key={item.id}>
          <td className="primary-cell"><Link href={`/invoices/${item.id}`}><strong>{item.invoiceNumber || item.draftNumber}</strong><span>{item.invoiceNumber ? "Nomor final" : "Nomor sementara"}</span></Link></td>
          <td>{item.client.name}</td><td>{item.shipment.jobNumber}<br/><small style={{ color: "var(--muted)" }}>{item.bill?.number || "Gabungan"}</small></td>
          <td>{tanggal.format(item.invoiceDate)}</td><td>{item.type}</td><td className="money">{rupiah.format(numberValue(item.grandTotal))}</td><td><StatusBadge status={invoiceDisplayStatus(item)} /></td>
        </tr>)}
        {!invoices.length && <tr><td colSpan={7} className="empty">Belum ada invoice.</td></tr>}</tbody></table></div>
    </div>
  </AppShell>;
}
