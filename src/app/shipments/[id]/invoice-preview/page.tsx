import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays } from "date-fns";
import { allocateAdvanceDp, type InvoiceSplitMode, roundMoney, terbilang } from "@/lib/business";
import { db } from "@/lib/db";
import { rupiah, tanggal } from "@/lib/format";
import { previewShipmentInvoice } from "@/lib/invoice-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
};

function companyStampKey(companyId: string) {
  return `company:${companyId}:stampPath`;
}

export default async function InvoicePreviewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const requestedMode: InvoiceSplitMode = query.mode === "combine_jasa" ? "combine_jasa" : "split_by_bl";
  const { shipment, split } = await previewShipmentInvoice(id, requestedMode).catch(() => ({ shipment: null, split: null }));
  if (!shipment || !split) notFound();

  const company = await db.company.findFirst({ where: { isDefault: true }, include: { bankAccounts: { where: { status: "ACTIVE" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } })
    ?? await db.company.findFirst({ orderBy: { createdAt: "asc" }, include: { bankAccounts: { where: { status: "ACTIVE" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } });
  if (!company) notFound();
  const stampSetting = await db.appSetting.findUnique({ where: { key: companyStampKey(company.id) } });

  const groups = [...split.jasa, ...split.reimbursement];
  const totalGrand = groups.reduce((sum, group) => sum + group.grandTotal, 0);
  const advanceDpAmount = shipment.advanceDpAmount.toNumber();
  const allocations = allocateAdvanceDp(groups.map((group) => group.grandTotal), Math.min(advanceDpAmount, totalGrand));
  const invoiceDate = new Date();
  const dueDate = addDays(invoiceDate, shipment.client.paymentTermDays);
  const effectiveMode = shipment.shipmentDirection === "LAIN_LAIN" ? "combine_jasa" : requestedMode;

  return <main style={{ minHeight: "100vh", background: "#eef2f7", padding: "24px" }}>
    <div style={{ maxWidth: 940, margin: "0 auto 18px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <div>
        <h1 style={{ margin: 0, color: "#0b1739", fontSize: 24 }}>Preview visual invoice</h1>
        <p style={{ margin: "6px 0 0", color: "#667085" }}>Simulasi dari {shipment.jobNumber}. Belum membuat draft, nomor invoice, PDF, atau data baru.</p>
      </div>
      <Link href={`/shipments/${shipment.id}`} style={buttonStyle}>Kembali</Link>
    </div>

    <div style={{ maxWidth: 940, margin: "0 auto 18px", display: "flex", gap: 10, flexWrap: "wrap" }}>
      {shipment.shipmentDirection !== "LAIN_LAIN" && <>
        <Link href={`/shipments/${shipment.id}/invoice-preview?mode=split_by_bl`} style={effectiveMode === "split_by_bl" ? primaryPillStyle : pillStyle}>Pisah per B/L</Link>
        <Link href={`/shipments/${shipment.id}/invoice-preview?mode=combine_jasa`} style={effectiveMode === "combine_jasa" ? primaryPillStyle : pillStyle}>Gabung JASA</Link>
      </>}
      <span style={{ ...pillStyle, cursor: "default" }}>{groups.length} calon invoice</span>
      <span style={{ ...pillStyle, cursor: "default" }}>Total {rupiah.format(totalGrand)}</span>
      {advanceDpAmount > 0 && <span style={{ ...pillStyle, cursor: "default" }}>DP tersimpan {rupiah.format(advanceDpAmount)}</span>}
    </div>

    <div style={{ display: "grid", gap: 28 }}>
      {groups.map((group, index) => {
        const amountPaid = allocations[index] ?? 0;
        const outstandingAmount = roundMoney(group.grandTotal - amountPaid);
        const words = terbilang(amountPaid > 0 ? outstandingAmount : group.grandTotal);
        return <InvoicePaper
          key={`${group.type}-${group.billId || "combined"}-${index}`}
          company={company}
          hasStamp={Boolean(stampSetting?.value)}
          shipment={shipment}
          group={group}
          invoiceDate={invoiceDate}
          dueDate={dueDate}
          documentNumber={`PREVIEW/${shipment.jobNumber}/${String(index + 1).padStart(2, "0")}`}
          amountPaid={amountPaid}
          outstandingAmount={outstandingAmount}
          words={words}
        />;
      })}
    </div>
  </main>;
}

function InvoicePaper({
  company,
  hasStamp,
  shipment,
  group,
  invoiceDate,
  dueDate,
  documentNumber,
  amountPaid,
  outstandingAmount,
  words,
}: {
  company: any;
  hasStamp: boolean;
  shipment: any;
  group: any;
  invoiceDate: Date;
  dueDate: Date;
  documentNumber: string;
  amountPaid: number;
  outstandingAmount: number;
  words: string;
}) {
  const account = company.bankAccounts?.[0];
  const isOtherOrder = shipment.shipmentDirection === "LAIN_LAIN";
  const details = invoiceDetails(shipment, group);

  return <section style={paperStyle}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, maxWidth: 390 }}>
        {company.logoPath
          ? <img src={`/api/company-assets/logo?companyId=${company.id}`} alt="Logo perusahaan" style={{ width: 54, maxHeight: 42, objectFit: "contain" }} />
          : <div style={{ width: 42, height: 42, borderRadius: 8, background: "#0b63ce", color: "white", display: "grid", placeItems: "center", fontWeight: 800 }}>{company.name.slice(0, 2).toUpperCase()}</div>}
        <div>
          <h2 style={{ margin: 0, color: "#0b1739", fontSize: 20 }}>{company.name}</h2>
          <p style={{ margin: "4px 0 0", color: "#667085", fontSize: 11, lineHeight: 1.35 }}>{company.address}</p>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <h2 style={{ margin: 0, color: "#e11d2f", fontSize: 34, letterSpacing: 1 }}>INVOICE</h2>
        <p style={{ margin: "10px 0 0", color: "#0b1739", fontWeight: 800 }}>Invoice No {documentNumber}</p>
        <p style={{ margin: "6px 0 0", color: "#0b1739", fontWeight: 700 }}>{tanggal.format(invoiceDate)}</p>
        <p style={{ margin: "6px 0 0", color: "#0b1739", fontSize: 12 }}>Jatuh Tempo {tanggal.format(dueDate)}</p>
      </div>
    </header>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 42, marginTop: 36 }}>
      <InfoBox title="Ditagihkan Kepada">
        <h3 style={{ margin: "0 0 8px", color: "#0b1739", fontSize: 18 }}>{shipment.client.name}</h3>
        <p style={paragraphStyle}>{shipment.client.address}</p>
        {shipment.client.email && <p style={paragraphStyle}>Email: {shipment.client.email}</p>}
        {shipment.client.phone && <p style={paragraphStyle}>UP: {shipment.client.phone}</p>}
      </InfoBox>
      <InfoBox title="Detail Pekerjaan">
        {details.map(([label, value]) => <p key={label} style={{ ...paragraphStyle, fontWeight: 800 }}><span>{label}: </span>{value}</p>)}
      </InfoBox>
    </div>

    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 26, color: "#0b1739" }}>
      <thead>
        <tr style={{ background: "#0b1739", color: "white" }}>
          <th style={thLeft}>Deskripsi</th>
          <th style={thRight}>Harga</th>
          <th style={thRight}>Qty</th>
          <th style={thRight}>Total</th>
        </tr>
      </thead>
      <tbody>
        {group.items.map((item: any) => <tr key={item.id}>
          <td style={tdLeft}>{item.description || item.name}</td>
          <td style={tdRight}>{rupiah.format(item.unitPrice)}</td>
          <td style={tdRight}>{item.quantity}</td>
          <td style={tdRight}>{rupiah.format(item.totalAmount)}</td>
        </tr>)}
      </tbody>
    </table>

    {!isOtherOrder && shipment.containers.length > 0 && <div style={{ marginTop: 22, width: 270, minHeight: 112, padding: "10px 12px", background: "#f8fafc", border: "1px solid #d9e2ef" }}>
      <strong style={{ color: "#0b1739", fontSize: 10 }}>NO KONTAINER</strong>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 10px" }}>
        {shipment.containers.slice(0, 24).map((container: any) => <span key={container.id} style={{ color: "#0b1739", fontSize: 9 }}>{container.number}</span>)}
      </div>
    </div>}

    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 38, marginTop: isOtherOrder ? 34 : 20, alignItems: "start" }}>
      <div>
        <p style={{ margin: "0 0 22px", color: "#111", fontSize: 16, fontWeight: 800 }}>TERBILANG: {words}</p>
        <InfoBox title="Payment Info" narrow>
          {account ? <>
            <p style={paragraphStyle}>{account.bankName}</p>
            <p style={paragraphStyle}>{account.accountNumber}</p>
            <p style={paragraphStyle}>{account.accountName}</p>
          </> : <p style={paragraphStyle}>Belum ada rekening pembayaran.</p>}
        </InfoBox>
        <h2 style={{ margin: "40px 0 0", color: "#e11d2f", fontSize: 34 }}>Thank you!</h2>
      </div>
      <div>
        <SummaryRow label="Subtotal" value={rupiah.format(group.subtotal)} />
        <SummaryRow label="PPN" value={rupiah.format(group.taxAmount)} />
        <SummaryRow label="DP / Paid" value={rupiah.format(amountPaid)} />
        <SummaryRow label="Sisa Tagihan" value={rupiah.format(outstandingAmount)} />
        <div style={{ marginTop: 8, background: "#0b1739", color: "white", padding: "9px 12px", display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
          <span>Total</span><span>{rupiah.format(group.grandTotal)}</span>
        </div>
        <div style={{ position: "relative", textAlign: "center", marginTop: 84, color: "#0b1739", minHeight: 150 }}>
          {hasStamp && <img src={`/api/company-assets/stamp?companyId=${company.id}`} alt="Stampel perusahaan" style={{ position: "absolute", zIndex: 0, left: "50%", top: 22, transform: "translateX(-50%)", width: 150, maxHeight: 90, objectFit: "contain", opacity: .72 }} />}
          <p style={{ position: "relative", zIndex: 2, fontWeight: 800, margin: 0 }}>{company.closingGreeting || "Hormat Saya"}</p>
          <div style={{ position: "relative", zIndex: 2, height: 78, display: "grid", placeItems: "center" }}>
            {company.signaturePath && <img src={`/api/company-assets/signature?companyId=${company.id}`} alt="TTD perusahaan" style={{ maxWidth: 120, maxHeight: 58, objectFit: "contain" }} />}
          </div>
          <p style={{ position: "relative", zIndex: 2, fontWeight: 800, margin: 0 }}>{company.signerName || company.name}</p>
          {company.signerTitle && <p style={{ position: "relative", zIndex: 2, marginTop: 4 }}>{company.signerTitle}</p>}
        </div>
      </div>
    </div>
  </section>;
}

function InfoBox({ title, children, narrow = false }: { title: string; children: React.ReactNode; narrow?: boolean }) {
  return <div>
    <div style={{ background: "#0b1739", color: "white", padding: "8px 14px", fontWeight: 800, fontSize: 15, maxWidth: narrow ? 260 : undefined }}>{title}</div>
    <div style={{ padding: "14px 10px 0" }}>{children}</div>
  </div>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "5px 0", color: "#0b1739", fontSize: 13 }}>
    <strong>{label}</strong><span>{value}</span>
  </div>;
}

function invoiceDetails(shipment: any, group: any): [string, string][] {
  if (shipment.shipmentDirection === "LAIN_LAIN") {
    return [
      ["REFERENSI", shipment.doNumber || "-"],
      ["JENIS PEKERJAAN", cleanWorkLabel(shipment.vessel, shipment.voyage)],
      ["TAGIHAN", group.type === "JASA" ? "Jasa Gabungan" : "Reimbursement Gabungan"],
      ["JENIS ORDER", "Lain-lain"],
    ];
  }

  return [
    [shipment.shipmentDirection === "EXPORT" ? "DO NUMBER (EXPORT)" : "B/L NUMBER (IMPORT)", shipment.doNumber],
    ["VESSEL / VOYAGE", `${shipment.vessel} / ${shipment.voyage}`],
    ["CARRIER", shipment.carrier?.name || "-"],
    ["B/L NUMBER", group.billNumber || (group.type === "JASA" ? "Gabungan" : "Reimbursement Gabungan")],
    ["SIZE 20/40", summarizeContainerSizes(shipment.containers)],
  ];
}

function cleanWorkLabel(name?: string, reference?: string) {
  const left = name?.trim();
  const right = reference?.trim();
  if (left && right && right !== "-") return `${left} / ${right}`;
  return left || right || "-";
}

function summarizeContainerSizes(containers: { size: string }[]) {
  if (!containers.length) return "-";
  const groups = containers.reduce<Record<string, number>>((acc, container) => {
    const key = container.size.includes("20") ? "20" : container.size.includes("40") ? "40" : container.size;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(groups).map(([size, count]) => `${size}: ${count}`).join(" | ");
}

const paperStyle: React.CSSProperties = {
  width: 794,
  minHeight: 1122,
  margin: "0 auto",
  background: "white",
  padding: "54px 54px 42px",
  boxShadow: "0 16px 42px rgba(15, 23, 42, .14)",
  fontFamily: "Inter, Arial, sans-serif",
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 16px",
  borderRadius: 8,
  background: "#2563eb",
  color: "white",
  textDecoration: "none",
  fontWeight: 800,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  background: "white",
  color: "#0b1739",
  textDecoration: "none",
  fontWeight: 700,
  border: "1px solid #d9e2ef",
};

const primaryPillStyle: React.CSSProperties = {
  ...pillStyle,
  background: "#0b1739",
  color: "white",
  borderColor: "#0b1739",
};

const paragraphStyle: React.CSSProperties = { margin: "0 0 6px", color: "#0b1739", fontSize: 13, lineHeight: 1.35 };
const thLeft: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontSize: 13 };
const thRight: React.CSSProperties = { padding: "9px 12px", textAlign: "right", fontSize: 13 };
const tdLeft: React.CSSProperties = { padding: "13px 12px", borderBottom: "1px solid #a8b2c4", fontSize: 13 };
const tdRight: React.CSSProperties = { padding: "13px 12px", borderBottom: "1px solid #a8b2c4", textAlign: "right", fontSize: 13 };
