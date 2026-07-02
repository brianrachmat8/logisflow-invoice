import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/lib/db";
import { numberValue, rupiah, tanggal } from "@/lib/format";
import { invoiceDisplayStatus } from "@/lib/invoice-status";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const invoices = await db.invoice.findMany({
    where: { status: { in: ["FINAL", "SENT", "PARTIAL_PAID", "PAID", "OVERDUE"] } },
    include: {
      client: true,
      payments: { select: { id: true, proofFilePath: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { dueDate: "asc" },
  });
  return <AppShell title="Pembayaran"><PageHead title="Monitoring pembayaran" description="Lihat pembayaran, sisa tagihan, dan status pelunasan." />
    <div className="card"><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Klien</th><th>Jatuh tempo</th><th>Total</th><th>Dibayar</th><th>Sisa</th><th>Transaksi</th><th>Bukti</th><th>Status</th></tr></thead><tbody>
      {invoices.map((item) => {
        const proofCount = item.payments.filter((payment) => payment.proofFilePath).length;
        const latestProof = item.payments.find((payment) => payment.proofFilePath);
        return <tr key={item.id}>
          <td><Link href={`/invoices/${item.id}`}><strong>{item.invoiceNumber}</strong></Link></td>
          <td>{item.client.name}</td>
          <td>{tanggal.format(item.dueDate)}</td>
          <td>{rupiah.format(numberValue(item.grandTotal))}</td>
          <td>{rupiah.format(numberValue(item.amountPaid))}</td>
          <td className="money">{rupiah.format(numberValue(item.outstandingAmount))}</td>
          <td>{item.payments.length ? `${item.payments.length} pembayaran` : "-"}</td>
          <td>
            {latestProof
              ? <a className="btn btn-secondary" href={`/api/payments/${latestProof.id}/proof`} target="_blank">{proofCount} bukti</a>
              : item.payments.length
                ? <small style={{ color: "var(--danger)" }}>Belum ada bukti</small>
                : <small style={{ color: "var(--muted)" }}>Belum bayar</small>}
          </td>
          <td><StatusBadge status={invoiceDisplayStatus(item)}/></td>
        </tr>;
      })}
      {!invoices.length && <tr><td colSpan={9} className="empty">Belum ada invoice final.</td></tr>}</tbody></table></div></div>
  </AppShell>;
}
