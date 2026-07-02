import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { ShipmentDeleteButton } from "@/components/shipment-delete-button";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { tanggal } from "@/lib/format";

export const dynamic = "force-dynamic";

const deletableInvoiceStatuses = ["DRAFT", "CANCELLED", "REVISED"];

export default async function ShipmentsPage() {
  const shipments = await db.shipment.findMany({
    include: {
      client: true,
      carrier: true,
      invoices: {
        select: {
          status: true,
          invoiceNumber: true,
          _count: { select: { payments: true } },
        },
      },
      _count: { select: { bills: true, containers: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return <AppShell title="Shipment / Job Order">
    <PageHead title="Daftar shipment" description="Kelola pekerjaan pengiriman sebelum menjadi invoice.">
      <Link href="/shipments/new" className="btn btn-primary"><Plus size={17} /> Shipment baru</Link>
    </PageHead>
    <div className="card">
      <div className="filters"><input className="filter-input search" placeholder="Cari job, DO, referensi, atau klien..." /><select className="filter-input"><option>Semua status</option></select></div>
      <div className="table-wrap"><table><thead><tr><th>Job order</th><th>Klien</th><th>Pekerjaan</th><th>B/L</th><th>Kontainer</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>{shipments.map((item) => {
          const hasLockedInvoice = item.invoices.some((invoice) => Boolean(invoice.invoiceNumber) || invoice._count.payments > 0 || !deletableInvoiceStatuses.includes(invoice.status));
          const isOtherOrder = item.shipmentDirection === "LAIN_LAIN";
          return <tr key={item.id}>
            <td className="primary-cell"><Link href={`/shipments/${item.id}`}><strong>{item.jobNumber}</strong><span>{orderLabel(item.shipmentDirection)} {item.doNumber}</span></Link></td>
            <td>{item.client.name}</td>
            <td>{item.vessel}{item.voyage && item.voyage !== "-" ? ` / ${item.voyage}` : ""}<br /><small style={{ color: "var(--muted)" }}>{isOtherOrder ? "Tanpa B/L dan kontainer" : item.carrier?.name || "Carrier belum ditentukan"}</small></td>
            <td>{isOtherOrder ? "-" : item._count.bills}</td><td>{isOtherOrder ? "-" : item._count.containers}</td><td>{tanggal.format(item.shipmentDate)}</td><td><StatusBadge status={item.status} /></td>
            <td><ShipmentDeleteButton shipmentId={item.id} disabled={hasLockedInvoice} /></td>
          </tr>;
        })}
        {!shipments.length && <tr><td colSpan={8} className="empty">Belum ada shipment.</td></tr>}</tbody></table></div>
    </div>
  </AppShell>;
}

function orderLabel(direction: string) {
  if (direction === "EXPORT") return "Export DO";
  if (direction === "IMPORT") return "Import B/L";
  return "Lain-lain Ref";
}
