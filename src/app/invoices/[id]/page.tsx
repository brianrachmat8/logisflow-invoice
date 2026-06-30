import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileCheck2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ActionButton } from "@/components/action-button";
import { PaymentForm } from "@/components/payment-form";
import { StatusBadge } from "@/components/status-badge";
import { terbilang } from "@/lib/business";
import { db } from "@/lib/db";
import { numberValue, rupiah, tanggal } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      company: { include: { bankAccounts: { where: { status: "ACTIVE" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } },
      client: true,
      bill: true,
      items: true,
      payments: { orderBy: { paymentDate: "desc" } },
      shipment: { include: { carrier: true, containers: true } },
    },
  });
  if (!invoice) notFound();

  const isManual = invoice.type === "LAIN_LAIN";
  const paidAmount = numberValue(invoice.amountPaid);
  const outstandingAmount = numberValue(invoice.outstandingAmount);
  const wordsAmount = paidAmount > 0 ? outstandingAmount : numberValue(invoice.grandTotal);
  const wordsLabel = paidAmount > 0 ? "TERBILANG SISA TAGIHAN" : "TERBILANG";
  const paymentLabel = invoice.status === "PAID"
    ? "PAID / Lunas"
    : paidAmount > 0
      ? `DP / Terbayar sebagian ${rupiah.format(paidAmount)}`
      : "Belum ada pembayaran";
  const paymentAccounts = invoice.company.bankAccounts.length
    ? invoice.company.bankAccounts.map((account) => ({
        id: account.id,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        isPrimary: account.isPrimary,
      }))
    : invoice.company.bankName || invoice.company.bankAccountNumber
      ? [{
          id: "legacy",
          bankName: invoice.company.bankName || "-",
          accountNumber: invoice.company.bankAccountNumber || "-",
          accountName: invoice.company.bankAccountName || invoice.company.name,
          isPrimary: true,
        }]
      : [];

  return <AppShell title="Detail invoice">
    <div className="page-head">
      <div>
        <Link href={invoice.shipmentId ? `/shipments/${invoice.shipmentId}` : "/invoices"} className="btn btn-ghost" style={{ marginBottom: 12 }}>
          <ArrowLeft size={16} /> {invoice.shipmentId ? "Kembali ke shipment" : "Kembali ke invoice"}
        </Link>
        <div>
          <StatusBadge status={invoice.status} />
          <h2 style={{ marginTop: 10 }}>{invoice.invoiceNumber || invoice.draftNumber}</h2>
          <p>{isManual ? "LAIN-LAIN" : invoice.type} · {invoice.client.name}</p>
        </div>
      </div>
      <div className="actions">
        {invoice.status === "DRAFT" && <ActionButton endpoint={`/api/invoices/${id}/finalize`} label="Finalkan invoice" confirm="Invoice final tidak dapat diedit langsung. Lanjutkan?" />}
        {invoice.invoiceNumber && <>
          <a className="btn btn-secondary" href={`/api/invoices/${id}/export/pdf`}><Download size={16}/> PDF</a>
          <a className="btn btn-secondary" href={`/api/invoices/${id}/export/xlsx`}><Download size={16}/> Excel</a>
        </>}
      </div>
    </div>

    <div className="invoice-paper">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
        <div>
          <div className="brand" style={{ color: "var(--navy)" }}>
            {invoice.company.logoPath
              ? <img className="brand-logo" src="/api/company-assets/logo" alt="Logo perusahaan" />
              : <span className="brand-mark"><FileCheck2 size={20}/></span>}
            {invoice.company.name}
          </div>
          <p style={{ color: "var(--muted)", maxWidth: 350, fontSize: 12 }}>{invoice.company.address}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <h1 style={{ fontFamily: "Manrope", margin: 0, color: "var(--navy)" }}>INVOICE</h1>
          <strong>{invoice.invoiceNumber || invoice.draftNumber}</strong>
          <p style={{ color: "var(--muted)", fontSize: 12 }}>{tanggal.format(invoice.invoiceDate)}</p>
        </div>
      </div>

      <div className="grid-equal" style={{ margin: "36px 0 26px", background: "#f7f9fd", padding: 18, borderRadius: 10 }}>
        <div>
          <small style={{ color: "var(--muted)" }}>DITAGIHKAN KEPADA</small>
          <h3 style={{ margin: "6px 0" }}>{invoice.client.name}</h3>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{invoice.client.address}</span>
        </div>
        <div className="summary-stack">
          {isManual ? <>
            <div className="summary-line"><span>Jenis invoice</span><strong>Lain-lain / Non-trucking</strong></div>
            <div className="summary-line"><span>Judul</span><strong>{invoice.manualTitle || "Invoice Lain-lain"}</strong></div>
            <div className="summary-line"><span>Referensi</span><strong>{invoice.manualReference || "-"}</strong></div>
            <div className="summary-line"><span>Jatuh tempo</span><strong>{tanggal.format(invoice.dueDate)}</strong></div>
          </> : <>
            <div className="summary-line"><span>{invoice.shipment?.shipmentDirection === "EXPORT" ? "DO Number (Export)" : "B/L Number (Import)"}</span><strong>{invoice.shipment?.doNumber || "-"}</strong></div>
            <div className="summary-line"><span>Vessel/Voyage</span><strong>{invoice.shipment ? `${invoice.shipment.vessel} / ${invoice.shipment.voyage}` : "-"}</strong></div>
            <div className="summary-line"><span>B/L Number</span><strong>{invoice.bill?.number || "Gabungan"}</strong></div>
            <div className="summary-line"><span>Size 20/40</span><strong>{summarizeContainerSizes(invoice.shipment?.containers || [])}</strong></div>
          </>}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>{isManual ? "Uraian" : "Deskripsi"}</th><th>Qty</th>{isManual && <th>Satuan</th>}<th>Harga</th><th>Total</th></tr></thead>
          <tbody>
            {invoice.items.map((item) => <tr key={item.id}>
              <td>{item.description}</td>
              <td>{numberValue(item.quantity)}</td>
              {isManual && <td>{item.unit}</td>}
              <td>{rupiah.format(numberValue(item.unitPrice))}</td>
              <td className="money">{rupiah.format(numberValue(item.totalAmount))}</td>
            </tr>)}
          </tbody>
        </table>
      </div>

      <div style={{ width: 360, margin: "24px 0 0 auto" }} className="summary-stack">
        <div className="summary-line"><span>Subtotal</span><strong>{rupiah.format(numberValue(invoice.subtotal))}</strong></div>
        <div className="summary-line"><span>PPN {numberValue(invoice.taxRate)}%</span><strong>{rupiah.format(numberValue(invoice.taxAmount))}</strong></div>
        <div className="summary-line total"><span>Grand total</span><strong style={{ color: "var(--blue)" }}>{rupiah.format(numberValue(invoice.grandTotal))}</strong></div>
        <div className="summary-line"><span>Status pembayaran</span><strong>{paymentLabel}</strong></div>
        {paidAmount > 0 && <div className="summary-line"><span>Paid</span><strong>{rupiah.format(paidAmount)}</strong></div>}
        {outstandingAmount > 0 && <div className="summary-line"><span>Sisa tagihan</span><strong>{rupiah.format(outstandingAmount)}</strong></div>}
      </div>

      {invoice.manualNotes && <div style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
        <small style={{ color: "var(--muted)" }}>CATATAN</small>
        <p>{invoice.manualNotes}</p>
      </div>}
      <div style={{ marginTop: 28, borderTop: "1px solid var(--line)", paddingTop: 18 }}>
        <small style={{ color: "var(--muted)" }}>{wordsLabel}</small>
        <strong style={{ display: "block", marginTop: 5 }}>{terbilang(wordsAmount)}</strong>
      </div>
      <div style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 18 }} className="summary-stack">
        <small style={{ color: "var(--muted)" }}>INFORMASI PEMBAYARAN</small>
        {paymentAccounts.map((account) => <div className="summary-line" key={account.id}>
          <span>{account.bankName}{account.isPrimary ? " (Utama)" : ""}</span>
          <strong>{account.accountNumber} a.n. {account.accountName}</strong>
        </div>)}
        {!paymentAccounts.length && <div className="empty">Belum ada rekening pembayaran. Tambahkan di Settings.</div>}
      </div>
      <div style={{ marginTop: 28, display: "grid", justifyContent: "end", textAlign: "center", minWidth: 220 }}>
        <span>{invoice.company.closingGreeting || "Hormat kami"}</span>
        {invoice.company.signaturePath && <img src="/api/company-assets/signature" alt="TTD perusahaan" style={{ maxWidth: 150, maxHeight: 70, objectFit: "contain", margin: "10px auto" }} />}
        <strong>{invoice.company.signerName || invoice.company.name}</strong>
        {invoice.company.signerTitle && <small style={{ color: "var(--muted)" }}>{invoice.company.signerTitle}</small>}
      </div>
    </div>

    {!["DRAFT", "PAID", "CANCELLED", "REVISED"].includes(invoice.status) && <div className="grid-equal" style={{ marginTop: 20 }}>
      <div className="card">
        <div className="card-head"><h3>Catat DP / pembayaran</h3></div>
        <div className="card-body"><PaymentForm invoiceId={id} max={outstandingAmount} /></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Riwayat pembayaran</h3></div>
        <div className="card-body summary-stack">
          {invoice.payments.map((payment) => <div className="summary-line" key={payment.id}>
            <span>{tanggal.format(payment.paymentDate)} · {payment.method}</span>
            <strong>{rupiah.format(numberValue(payment.amount))}</strong>
          </div>)}
          {!invoice.payments.length && <div className="empty">Belum ada pembayaran.</div>}
        </div>
      </div>
    </div>}
  </AppShell>;
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
