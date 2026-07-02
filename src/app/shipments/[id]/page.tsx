import { notFound } from "next/navigation";
import { Box, FileText, Ship, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ChargeManager } from "@/components/charge-manager";
import { GenerateInvoicePanel } from "@/components/generate-invoice-panel";
import { ShipmentWorkspace } from "@/components/shipment-workspace";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { numberValue, rupiah, tanggal } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shipment = await db.shipment.findUnique({
    where: { id },
    include: {
      client: true,
      carrier: true,
      fieldTeam: true,
      bills: { include: { containers: true }, orderBy: { number: "asc" } },
      charges: { include: { bill: true }, orderBy: { createdAt: "asc" } },
      invoices: { include: { bill: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!shipment) notFound();

  const isOtherOrder = shipment.shipmentDirection === "LAIN_LAIN";
  const totalJasa = shipment.charges.filter((charge) => charge.category === "JASA").reduce((sum, charge) => sum + numberValue(charge.totalAmount), 0);
  const totalReimb = shipment.charges.filter((charge) => charge.category === "REIMBURSEMENT").reduce((sum, charge) => sum + numberValue(charge.totalAmount), 0);
  const totalCharges = totalJasa + totalReimb;
  const advanceDpAmount = numberValue(shipment.advanceDpAmount);
  const appliedAdvanceDp = Math.min(advanceDpAmount, totalCharges);
  const excessAdvanceDp = Math.max(advanceDpAmount - totalCharges, 0);
  const estimatedOutstanding = Math.max(totalCharges - appliedAdvanceDp, 0);
  const activeInvoices = shipment.invoices.filter((invoice) => invoice.status !== "CANCELLED" && invoice.status !== "REVISED");
  const hasDraft = activeInvoices.some((invoice) => invoice.status === "DRAFT");
  const hasLockedInvoice = activeInvoices.some((invoice) => invoice.status !== "DRAFT");
  const bills = shipment.bills.map(({ id: billId, number }) => ({ id: billId, number }));

  return <AppShell title="Detail shipment">
    <div className="detail-hero">
      <div>
        <StatusBadge status={shipment.status} />
        <h2 style={{ marginTop: 12 }}>{shipment.jobNumber}</h2>
        <p>{shipment.client.name} · {orderLabel(shipment.shipmentDirection)} · {documentLabel(shipment.shipmentDirection)} {shipment.doNumber}</p>
        <div className="detail-meta">
          <div><span>{isOtherOrder ? "Pekerjaan / Kode" : "Vessel / Voyage"}</span><strong>{shipment.vessel} / {shipment.voyage}</strong></div>
          <div><span>Carrier</span><strong>{shipment.carrier?.name || "-"}</strong></div>
          <div><span>Tanggal</span><strong>{tanggal.format(shipment.shipmentDate)}</strong></div>
          <div><span>Tim lapangan</span><strong>{shipment.fieldTeam?.name || "-"}</strong></div>
          <div><span>{isOtherOrder ? "Jenis order" : "Size kontainer"}</span><strong>{isOtherOrder ? "Lain-lain" : summarizeContainerSizes(shipment.bills.flatMap((bill) => bill.containers))}</strong></div>
        </div>
      </div>
      {!hasLockedInvoice && <GenerateInvoicePanel shipmentId={id} hasDraft={hasDraft} isOtherOrder={isOtherOrder} />}
    </div>

    <section className="metrics">
      <MiniMetric label={isOtherOrder ? "Referensi" : "Bill of Lading"} value={isOtherOrder ? shipment.doNumber : `${shipment.bills.length}`} icon={<FileText />} />
      <MiniMetric label={isOtherOrder ? "Jenis order" : "Kontainer"} value={isOtherOrder ? "Lain-lain" : `${shipment.bills.reduce((sum, bill) => sum + bill.containers.length, 0)}`} icon={<Box />} />
      <MiniMetric label="Total JASA" value={rupiah.format(totalJasa)} icon={<Ship />} />
      <MiniMetric label="Reimbursement" value={rupiah.format(totalReimb)} icon={<WalletCards />} />
    </section>

    <ShipmentWorkspace
      shipmentId={id}
      bills={bills}
      isOtherOrder={isOtherOrder}
      advanceDp={{
        amount: advanceDpAmount,
        paymentDate: shipment.advanceDpDate ? shipment.advanceDpDate.toISOString().slice(0, 10) : "",
        method: shipment.advanceDpMethod || "Transfer Bank",
        reference: shipment.advanceDpReference || "",
        notes: shipment.advanceDpNotes || "",
      }}
    />

    <div className="section-grid">
      {!isOtherOrder && <div className="card">
        <div className="card-head"><h3>B/L dan kontainer</h3></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>B/L Number (Impor)</th><th>Kontainer</th><th>Size 20/40</th><th>Daftar nomor</th></tr></thead>
            <tbody>
              {shipment.bills.map((bill) => <tr key={bill.id}>
                <td><strong>{bill.number}</strong></td>
                <td>{bill.containers.length}</td>
                <td>{summarizeContainerSizes(bill.containers)}</td>
                <td>{bill.containers.slice(0, 3).map((container) => container.number).join(", ")}{bill.containers.length > 3 ? "…" : ""}</td>
              </tr>)}
              {!shipment.bills.length && <tr><td colSpan={4} className="empty">Tambahkan B/L untuk memulai.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}

      <div className="card">
        <div className="card-head"><h3>Ringkasan biaya</h3></div>
        <div className="card-body summary-stack">
          <div className="summary-line"><span>Biaya JASA</span><strong>{rupiah.format(totalJasa)}</strong></div>
          <div className="summary-line"><span>Reimbursement</span><strong>{rupiah.format(totalReimb)}</strong></div>
          <div className="summary-line total"><span>Total keseluruhan</span><strong>{rupiah.format(totalCharges)}</strong></div>
          {advanceDpAmount > 0 && <>
            <div className="summary-line"><span>DP awal tersimpan</span><strong>{rupiah.format(advanceDpAmount)}</strong></div>
            <div className="summary-line"><span>DP diterapkan</span><strong>{rupiah.format(appliedAdvanceDp)}</strong></div>
            {excessAdvanceDp > 0 && <>
              <div className="summary-line"><span>DP belum terpakai</span><strong>{rupiah.format(excessAdvanceDp)}</strong></div>
              <small style={{ color: "var(--danger)", lineHeight: 1.5 }}>DP awal lebih besar dari total biaya saat ini. Jika ini karena biaya sempat dihapus, edit DP awal di panel atas agar tidak ikut terbawa saat invoice dibuat.</small>
            </>}
            <div className="summary-line"><span>Estimasi sisa tagihan</span><strong>{rupiah.format(estimatedOutstanding)}</strong></div>
          </>}
        </div>
      </div>
    </div>

    <ChargeManager
      shipmentId={id}
      bills={bills}
      charges={shipment.charges.map((charge) => ({
        id: charge.id,
        billId: charge.billId,
        billNumber: charge.bill?.number || null,
        name: charge.name,
        description: charge.description,
        category: charge.category,
        quantity: numberValue(charge.quantity),
        unitPrice: numberValue(charge.unitPrice),
        taxAmount: numberValue(charge.taxAmount),
        totalAmount: numberValue(charge.totalAmount),
      }))}
    />

    {!!shipment.invoices.length && <div className="card" style={{ marginTop: 20 }}>
      <div className="card-head"><h3>Invoice hasil generate</h3></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nomor</th><th>Tipe</th><th>{isOtherOrder ? "Referensi" : "B/L Number (Impor)"}</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {shipment.invoices.map((invoice) => <tr key={invoice.id}>
              <td>{invoice.invoiceNumber || invoice.draftNumber}</td>
              <td>{invoice.type}</td>
              <td>{isOtherOrder ? shipment.doNumber : invoice.bill?.number || "Gabungan"}</td>
              <td>{rupiah.format(numberValue(invoice.grandTotal))}</td>
              <td><StatusBadge status={invoice.status} /></td>
              <td><a className="btn btn-secondary" href={`/invoices/${invoice.id}`}>Buka</a></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}
  </AppShell>;
}

function MiniMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="metric"><div className="metric-top"><div><div className="metric-label">{label}</div><div className="metric-value">{value}</div></div><span className="metric-icon">{icon}</span></div></div>;
}

function orderLabel(direction: string) {
  if (direction === "EXPORT") return "Export";
  if (direction === "IMPORT") return "Import";
  return "Lain-lain";
}

function documentLabel(direction: string) {
  if (direction === "EXPORT") return "DO Number (Export)";
  if (direction === "IMPORT") return "B/L Number (Import)";
  return "Referensi";
}

function summarizeContainerSizes(containers: { size: string }[]) {
  if (!containers.length) return "-";
  const groups = containers.reduce<Record<string, number>>((acc, container) => {
    const key = container.size.includes("20") ? "20" : container.size.includes("40") ? "40" : container.size;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(groups).map(([size, count]) => `${size}: ${count}`).join(" · ");
}
