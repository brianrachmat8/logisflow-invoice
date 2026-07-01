import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { terbilang } from "@/lib/business";
import { db } from "@/lib/db";
import { rupiah, tanggal } from "@/lib/format";

const storageRoot =
  process.env.STORAGE_PATH ||
  path.join(/* turbopackIgnore: true */ process.cwd(), "storage");

export async function generateInvoiceDocuments(invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      company: { include: { bankAccounts: { where: { status: "ACTIVE" }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } },
      client: true,
      shipment: { include: { carrier: true, containers: true } },
      bill: true,
      items: true,
    },
  });
  if (!invoice?.invoiceNumber) throw new Error("Invoice final tidak ditemukan.");
  await fs.mkdir(storageRoot, { recursive: true });
  const safeName = invoice.invoiceNumber.replaceAll("/", "-");
  const pdfPath = path.join(storageRoot, `${safeName}.pdf`);
  const excelPath = path.join(storageRoot, `${safeName}.xlsx`);

  await Promise.all([
    buildPdf(invoice, pdfPath),
    buildExcel(invoice, excelPath),
  ]);
  await db.generatedFile.createMany({
    data: [
      { invoiceId, type: "PDF", path: pdfPath },
      { invoiceId, type: "EXCEL", path: excelPath },
    ],
  });
  return { pdfPath, excelPath };
}

type InvoiceDocument = Prisma.InvoiceGetPayload<{
  include: {
    company: { include: { bankAccounts: true } };
    client: true;
    shipment: { include: { carrier: true; containers: true } };
    bill: true;
    items: true;
  };
}>;

async function buildPdf(invoice: InvoiceDocument, filePath: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await embedPdfImage(pdf, invoice.company.logoPath);
  const signatureImage = await embedPdfImage(pdf, invoice.company.signaturePath);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const teal = rgb(0.23, 0.48, 0.62);
  const tealDark = rgb(0.05, 0.13, 0.28);
  const cream = rgb(1, 0.93, 0.78);
  const accent = rgb(0.95, 0.43, 0.29);
  const navy = rgb(0.04, 0.09, 0.22);
  const muted = rgb(0.32, 0.39, 0.48);
  const white = rgb(1, 1, 1);
  const drawRight = (text: string, rightX: number, y: number, size = 9, font = regular, color = navy) => {
    const safe = sanitize(text);
    page.drawText(safe, { x: rightX - font.widthOfTextAtSize(safe, size), y, size, font, color });
  };
  const drawCentered = (text: string, centerX: number, y: number, size: number, font = bold, color = white) => {
    const safe = sanitize(text);
    page.drawText(safe, { x: centerX - font.widthOfTextAtSize(safe, size) / 2, y, size, font, color });
  };

  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: cream });
  page.drawRectangle({ x: 0, y: 592, width: pageWidth, height: 250, color: teal });
  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 34, color: teal });

  [0, 48, 105].forEach((x, index) => {
    page.drawRectangle({ x, y: 804, width: 32, height: 8, color: accent });
    page.drawRectangle({ x: x + 48, y: 784, width: 40, height: 8, color: accent });
    if (index !== 1) page.drawRectangle({ x: x + 8, y: 764, width: 40, height: 8, color: accent });
  });
  [250, 308].forEach((x) => {
    page.drawRectangle({ x, y: 804, width: 40, height: 8, color: accent });
    page.drawRectangle({ x: x + 16, y: 784, width: 40, height: 8, color: accent });
    page.drawRectangle({ x: x + 58, y: 764, width: 40, height: 8, color: accent });
  });

  if (logoImage) {
    const logoSize = fitImage(logoImage.width, logoImage.height, 74, 48);
    page.drawImage(logoImage, { x: 468, y: 770, width: logoSize.width, height: logoSize.height });
  } else {
    page.drawCircle({ x: 508, y: 795, size: 24, color: white });
    page.drawCircle({ x: 508, y: 795, size: 9, color: teal });
  }
  drawRight(invoice.company.name, 544, 748, 14, bold, white);

  page.drawRectangle({ x: 207, y: 657, width: 181, height: 20, color: accent });
  drawCentered("INVOICE", pageWidth / 2, 672, 38, bold, white);

  page.drawText(`INVOICE NO. ${invoice.invoiceNumber}`, { x: 84, y: 622, size: 11, font: bold, color: white });
  page.drawText(`DATE ${tanggal.format(invoice.invoiceDate)}`, { x: 84, y: 606, size: 11, font: bold, color: white });
  page.drawText(`DUE ${tanggal.format(invoice.dueDate)}`, { x: 84, y: 590, size: 9, font: regular, color: white });

  page.drawText(`INVOICE TO: ${sanitize(invoice.client.name).toUpperCase()}`, { x: 345, y: 622, size: 11, font: bold, color: white });
  wrapText(invoice.client.address, 185, 8, regular).slice(0, 3).forEach((line, index) => {
    page.drawText(line, { x: 345, y: 607 - index * 12, size: 8, font: regular, color: white });
  });

  const meta = invoiceDocumentMeta(invoice).slice(0, 4);
  page.drawRectangle({ x: 0, y: 552, width: pageWidth, height: 40, color: cream });
  meta.forEach(([label, value], index) => {
    const x = 56 + index * 130;
    page.drawText(label, { x, y: 576, size: 6.5, font: bold, color: teal });
    page.drawText(sanitize(value).slice(0, 22), { x, y: 563, size: 8, font: bold, color: navy });
  });

  page.drawRectangle({ x: 0, y: 514, width: pageWidth, height: 38, color: teal });
  page.drawText("NO.", { x: 82, y: 529, size: 12, font: bold, color: white });
  page.drawText("DESKRIPSI", { x: 135, y: 529, size: 12, font: bold, color: white });
  page.drawText("HARGA", { x: 318, y: 529, size: 12, font: bold, color: white });
  page.drawText("QTY", { x: 400, y: 529, size: 12, font: bold, color: white });
  page.drawText("TOTAL", { x: 470, y: 529, size: 12, font: bold, color: white });

  let y = 486;
  invoice.items.slice(0, 8).forEach((item, index) => {
    page.drawText(String(index + 1).padStart(2, "0"), { x: 86, y, size: 10, font: bold, color: navy });
    wrapText(item.description, 170, 9, regular).slice(0, 2).forEach((line, lineIndex) => {
      page.drawText(line, { x: 135, y: y - lineIndex * 11, size: 9, font: regular, color: navy });
    });
    drawRight(formatNumber(item.unitPrice.toNumber()), 362, y, 9, regular, navy);
    drawRight(String(item.quantity), 420, y, 9, regular, navy);
    drawRight(formatNumber(item.totalAmount.toNumber()), 520, y, 9, bold, navy);
    y -= 32;
  });

  const totalsY = Math.max(y - 4, 208);
  drawRight(`SUB TOTAL: ${formatNumber(invoice.subtotal.toNumber())}`, 505, totalsY, 11, bold, teal);
  drawRight(`PPN ${invoice.taxRate}%: ${formatNumber(invoice.taxAmount.toNumber())}`, 505, totalsY - 18, 9, bold, muted);
  page.drawRectangle({ x: 390, y: totalsY - 43, width: 115, height: 18, color: accent });
  drawRight(`TOTAL: ${formatNumber(invoice.grandTotal.toNumber())}`, 500, totalsY - 38, 11, bold, white);
  let paidY = totalsY - 60;
  if (invoice.amountPaid.toNumber() > 0) {
    drawRight(`DP / PAID: ${formatNumber(invoice.amountPaid.toNumber())}`, 505, paidY, 9, bold, muted);
    paidY -= 16;
    drawRight(`SISA: ${formatNumber(invoice.outstandingAmount.toNumber())}`, 505, paidY, 9, bold, navy);
  }

  const words = paymentAwareWords(invoice);
  page.drawText(words.label, { x: 46, y: 204, size: 8, font: bold, color: teal });
  page.drawLine({ start: { x: 46, y: 199 }, end: { x: 232, y: 199 }, thickness: 1.2, color: teal });
  wrapText(words.text, 210, 9, bold).slice(0, 2).forEach((line, index) => {
    page.drawText(line, { x: 46, y: 185 - index * 12, size: 9, font: bold, color: navy });
  });

  const accounts = paymentAccounts(invoice);
  page.drawText("Payment details:", { x: 46, y: 146, size: 12, font: regular, color: navy });
  page.drawLine({ start: { x: 46, y: 140 }, end: { x: 230, y: 140 }, thickness: 1.4, color: teal });
  page.drawText(`Invoice no: ${invoice.invoiceNumber}`, { x: 46, y: 126, size: 9, font: regular, color: navy });
  accounts.slice(0, 2).forEach((account, index) => {
    page.drawText(`${sanitize(account.bankName)}: ${sanitize(account.accountNumber)}`, { x: 46, y: 112 - index * 12, size: 9, font: regular, color: navy });
    page.drawText(`a.n. ${sanitize(account.accountName)}`, { x: 46, y: 100 - index * 12, size: 9, font: regular, color: navy });
  });
  if (!accounts.length) {
    page.drawText("Belum ada rekening pembayaran.", { x: 46, y: 112, size: 9, font: regular, color: navy });
  }

  page.drawText(invoice.company.name, { x: 46, y: 72, size: 11, font: bold, color: navy });
  page.drawLine({ start: { x: 46, y: 66 }, end: { x: 230, y: 66 }, thickness: 1.4, color: teal });
  wrapText(invoice.company.address, 235, 8, regular).slice(0, 2).forEach((line, index) => {
    page.drawText(line, { x: 46, y: 52 - index * 11, size: 8, font: regular, color: navy });
  });

  page.drawText(sanitize(invoice.company.closingGreeting || "Hormat kami"), { x: 410, y: 140, size: 9, font: regular, color: navy });
  if (signatureImage) {
    const signatureSize = fitImage(signatureImage.width, signatureImage.height, 120, 55);
    page.drawImage(signatureImage, { x: 395, y: 78, width: signatureSize.width, height: signatureSize.height });
  }
  page.drawLine({ start: { x: 390, y: 74 }, end: { x: 505, y: 74 }, thickness: 1.2, color: navy });
  drawCentered(invoice.company.signerName || invoice.company.name, 447, 58, 11, bold, navy);
  if (invoice.company.signerTitle) {
    drawCentered(invoice.company.signerTitle, 447, 44, 9, regular, navy);
  }

  drawCentered("Logisflow Smart Logistics Flow", pageWidth / 2, 13, 8, regular, white);
  const bytes = await pdf.save();
  await fs.writeFile(filePath, bytes);
}

async function buildExcel(invoice: InvoiceDocument, filePath: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LogisFlow";
  const sheet = workbook.addWorksheet("Invoice", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    properties: { defaultRowHeight: 19 },
  });
  sheet.columns = [
    { key: "a", width: 6 }, { key: "b", width: 34 }, { key: "c", width: 12 },
    { key: "d", width: 18 }, { key: "e", width: 20 },
  ];
  sheet.mergeCells("A1:C2");
  sheet.getCell("A1").value = invoice.company.name;
  sheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF0B1739" } };
  sheet.mergeCells("D1:E2");
  sheet.getCell("D1").value = "INVOICE";
  sheet.getCell("D1").font = { bold: true, size: 20, color: { argb: "FF1967FF" } };
  sheet.getCell("D1").alignment = { horizontal: "right" };
  sheet.mergeCells("A3:C3");
  sheet.getCell("A3").value = invoice.company.address;
  sheet.getCell("D3").value = "Nomor";
  sheet.getCell("E3").value = invoice.invoiceNumber;
  sheet.getCell("D4").value = "Tanggal";
  sheet.getCell("E4").value = tanggal.format(invoice.invoiceDate);
  sheet.getCell("D5").value = "Jatuh tempo";
  sheet.getCell("E5").value = tanggal.format(invoice.dueDate);
  sheet.getCell("A7").value = "Kepada";
  sheet.getCell("B7").value = invoice.client.name;
  invoiceDocumentMeta(invoice).slice(0, 4).forEach(([label, value], index) => {
    const row = 8 + (index % 2);
    const labelColumn = index < 2 ? "A" : "D";
    const valueColumn = index < 2 ? "B" : "E";
    sheet.getCell(`${labelColumn}${row}`).value = label;
    sheet.getCell(`${valueColumn}${row}`).value = value;
  });

  const headerRow = sheet.getRow(11);
  headerRow.values = ["No", "Deskripsi", "Qty", "Harga Satuan", "Total"];
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1739" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center" };
  });
  invoice.items.forEach((item, index) => {
    sheet.addRow([index + 1, item.description, item.quantity.toNumber(), item.unitPrice.toNumber(), item.totalAmount.toNumber()]);
  });
  const totalStart = 12 + invoice.items.length;
  sheet.getCell(`D${totalStart}`).value = "Subtotal";
  sheet.getCell(`E${totalStart}`).value = invoice.subtotal.toNumber();
  sheet.getCell(`D${totalStart + 1}`).value = `PPN ${invoice.taxRate}%`;
  sheet.getCell(`E${totalStart + 1}`).value = invoice.taxAmount.toNumber();
  sheet.getCell(`D${totalStart + 2}`).value = "Grand Total";
  sheet.getCell(`E${totalStart + 2}`).value = invoice.grandTotal.toNumber();
  sheet.getCell(`D${totalStart + 2}`).font = { bold: true };
  sheet.getCell(`E${totalStart + 2}`).font = { bold: true, color: { argb: "FF1967FF" } };
  let afterTotalRow = totalStart + 3;
  if (invoice.amountPaid.toNumber() > 0) {
    sheet.getCell(`D${afterTotalRow}`).value = "DP / Paid";
    sheet.getCell(`E${afterTotalRow}`).value = invoice.amountPaid.toNumber();
    afterTotalRow += 1;
    if (invoice.outstandingAmount.toNumber() > 0) {
      sheet.getCell(`D${afterTotalRow}`).value = "Sisa Tagihan";
      sheet.getCell(`E${afterTotalRow}`).value = invoice.outstandingAmount.toNumber();
      afterTotalRow += 1;
    }
  }
  sheet.mergeCells(`A${afterTotalRow + 1}:E${afterTotalRow + 1}`);
  const words = paymentAwareWords(invoice);
  sheet.getCell(`A${afterTotalRow + 1}`).value = `${words.label}: ${words.text}`;
  const accounts = paymentAccounts(invoice);
  sheet.mergeCells(`A${afterTotalRow + 3}:E${afterTotalRow + 3}`);
  sheet.getCell(`A${afterTotalRow + 3}`).value = "Rekening pembayaran";
  sheet.getCell(`A${afterTotalRow + 3}`).font = { bold: true };
  accounts.forEach((account, index) => {
    sheet.mergeCells(`A${afterTotalRow + 4 + index}:E${afterTotalRow + 4 + index}`);
    sheet.getCell(`A${afterTotalRow + 4 + index}`).value = `${account.bankName}${account.isPrimary ? " (Utama)" : ""}: ${account.accountNumber} a.n. ${account.accountName}`;
  });
  if (!accounts.length) {
    sheet.mergeCells(`A${afterTotalRow + 4}:E${afterTotalRow + 4}`);
    sheet.getCell(`A${afterTotalRow + 4}`).value = "Belum ada rekening pembayaran.";
  }
  sheet.getColumn(4).numFmt = '"Rp" #,##0';
  sheet.getColumn(5).numFmt = '"Rp" #,##0';
  sheet.protect("logisflow", { selectLockedCells: true, selectUnlockedCells: true });
  await workbook.xlsx.writeFile(filePath);
}

function sanitize(value: string) {
  return value.replace(/[^\x20-\x7E]/g, " ");
}
function formatNumber(value: number) {
  return rupiah.format(value).replace("Rp", "Rp ");
}

function wrapText(text: string, maxWidth: number, size: number, font: { widthOfTextAtSize(value: string, size: number): number }) {
  const words = sanitize(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function embedPdfImage(pdf: PDFDocument, filePath?: string | null) {
  if (!filePath) return null;
  try {
    const bytes = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".png") return pdf.embedPng(bytes);
    if (ext === ".jpg" || ext === ".jpeg") return pdf.embedJpg(bytes);
    return null;
  } catch {
    return null;
  }
}

function fitImage(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

function invoiceDocumentMeta(invoice: InvoiceDocument): [string, string][] {
  if (invoice.shipment.shipmentDirection === "LAIN_LAIN") {
    return [
      ["REFERENSI", invoice.shipment.doNumber || "-"],
      ["JENIS PEKERJAAN", shipmentWorkLabel(invoice)],
      ["CARRIER / TIM", invoice.shipment.carrier?.name || "-"],
      ["TAGIHAN", invoiceBlLabel(invoice)],
      ["JENIS ORDER", "Lain-lain"],
    ];
  }

  return [
    [invoice.shipment.shipmentDirection === "EXPORT" ? "DO NUMBER (EXPORT)" : "B/L NUMBER (IMPORT)", invoice.shipment.doNumber],
    ["VESSEL / VOYAGE", `${invoice.shipment.vessel} / ${invoice.shipment.voyage}`],
    ["CARRIER", invoice.shipment.carrier?.name || "-"],
    ["B/L NUMBER (IMPOR)", invoiceBlLabel(invoice)],
    ["SIZE 20/40", summarizeContainerSizes(invoice.shipment.containers)],
  ];
}

function shipmentWorkLabel(invoice: InvoiceDocument) {
  const name = invoice.shipment.vessel?.trim();
  const reference = invoice.shipment.voyage?.trim();
  if (name && reference) return `${name} / ${reference}`;
  return name || reference || "-";
}

function invoiceBlLabel(invoice: InvoiceDocument) {
  if (invoice.bill?.number) return invoice.bill.number;
  if (invoice.shipment.shipmentDirection === "LAIN_LAIN") return invoice.type === "JASA" ? "Jasa Gabungan" : "Reimbursement Gabungan";
  return invoice.type === "JASA" ? "Gabungan" : "Reimbursement Gabungan";
}

function paymentAccounts(invoice: InvoiceDocument) {
  if (invoice.company.bankAccounts.length) {
    return invoice.company.bankAccounts.map((account) => ({
      bankName: account.bankName,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      isPrimary: account.isPrimary,
    }));
  }
  if (invoice.company.bankName || invoice.company.bankAccountNumber) {
    return [{
      bankName: invoice.company.bankName || "-",
      accountNumber: invoice.company.bankAccountNumber || "-",
      accountName: invoice.company.bankAccountName || invoice.company.name,
      isPrimary: true,
    }];
  }
  return [];
}

function paymentAwareWords(invoice: InvoiceDocument) {
  const amountPaid = invoice.amountPaid.toNumber();
  const amount = amountPaid > 0 ? invoice.outstandingAmount.toNumber() : invoice.grandTotal.toNumber();
  return {
    label: amountPaid > 0 ? "TERBILANG SISA TAGIHAN" : "TERBILANG",
    text: terbilang(amount),
  };
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
