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
  const navy = rgb(0.04, 0.09, 0.22);
  const blue = rgb(0.1, 0.4, 1);
  const muted = rgb(0.42, 0.46, 0.55);
  const border = rgb(.86, .89, .94);
  const soft = rgb(.97, .98, 1);
  const labelColor = rgb(.43, .49, .61);
  const white = rgb(1, 1, 1);
  const marginX = 32;
  const pageRight = 563;

  const drawTextAt = (text: string, x: number, yy: number, size = 9, font = regular, color = navy) => {
    page.drawText(sanitize(text), { x, y: yy, size, font, color });
  };
  const drawRight = (text: string, rightX: number, yy: number, size = 9, font = regular, color = navy) => {
    const safe = sanitize(text);
    page.drawText(safe, { x: rightX - font.widthOfTextAtSize(safe, size), y: yy, size, font, color });
  };
  const drawWrapped = (text: string, x: number, yy: number, maxWidth: number, size = 8, font = regular, color = muted, maxLines = 3, lineGap = 11) => {
    const lines = wrapText(text, maxWidth, size, font).slice(0, maxLines);
    lines.forEach((line, index) => drawTextAt(line, x, yy - index * lineGap, size, font, color));
    return lines.length;
  };

  if (logoImage) {
    const logoSize = fitImage(logoImage.width, logoImage.height, 48, 42);
    page.drawImage(logoImage, { x: marginX, y: 758 + (42 - logoSize.height) / 2, width: logoSize.width, height: logoSize.height });
  } else {
    page.drawRectangle({ x: marginX, y: 758, width: 42, height: 42, color: blue });
    drawTextAt("LF", marginX + 13, 774, 11, bold, white);
  }

  drawTextAt(invoice.company.name, 90, 782, 12, bold, navy);
  drawWrapped(invoice.company.address, 90, 764, 240, 7.5, regular, muted, 3, 10);
  drawRight("INVOICE", pageRight, 782, 21, bold, navy);
  drawRight(invoice.invoiceNumber || invoice.draftNumber, pageRight, 759, 10, bold, navy);
  drawRight(tanggal.format(invoice.invoiceDate), pageRight, 741, 8, regular, muted);

  const panelTop = 704;
  const panelHeight = 118;
  page.drawRectangle({ x: marginX, y: panelTop - panelHeight, width: 531, height: panelHeight, color: soft, borderColor: border, borderWidth: .4 });
  drawTextAt("DITAGIHKAN KEPADA", 48, 674, 7.5, bold, labelColor);
  drawTextAt(invoice.client.name, 48, 653, 12, bold, navy);
  drawWrapped(invoice.client.address, 48, 632, 240, 7.5, regular, muted, 4, 11);

  const meta = pdfMetaRows(invoice);
  meta.forEach(([label, value], index) => {
    const rowY = 675 - index * 24;
    drawTextAt(label, 320, rowY, 7.2, bold, labelColor);
    drawRight(sanitize(value).slice(0, 34), 545, rowY - 13, 8.2, bold, navy);
  });

  let tableY = 545;
  page.drawRectangle({ x: marginX, y: tableY - 4, width: 531, height: 28, color: navy });
  drawTextAt("DESKRIPSI", 44, tableY + 6, 7, bold, white);
  drawRight("QTY", 348, tableY + 6, 7, bold, white);
  drawRight("HARGA", 443, tableY + 6, 7, bold, white);
  drawRight("TOTAL", 552, tableY + 6, 7, bold, white);
  tableY -= 30;

  for (const item of invoice.items.slice(0, 14)) {
    const lines = wrapText(item.description, 250, 8, regular).slice(0, 3);
    const rowHeight = Math.max(26, 13 + lines.length * 11);
    lines.forEach((line, index) => drawTextAt(line, 44, tableY - index * 10, 8, regular, navy));
    drawRight(String(item.quantity), 348, tableY, 8, regular, navy);
    drawRight(formatNumber(item.unitPrice.toNumber()), 443, tableY, 8, regular, navy);
    drawRight(formatNumber(item.totalAmount.toNumber()), 552, tableY, 8, bold, navy);
    page.drawLine({ start: { x: marginX, y: tableY - rowHeight + 8 }, end: { x: 563, y: tableY - rowHeight + 8 }, thickness: .4, color: border });
    tableY -= rowHeight;
  }

  const totalsTop = Math.min(tableY - 8, 420);
  const totalsX = 342;
  const totalsRight = 552;
  const totals = [
    ["Subtotal", invoice.subtotal.toNumber()],
    [`PPN ${invoice.taxRate}%`, invoice.taxAmount.toNumber()],
    ["Grand total", invoice.grandTotal.toNumber()],
    ...(invoice.amountPaid.toNumber() > 0 ? [["DP / Paid", invoice.amountPaid.toNumber()]] as [string, number][] : []),
    ...(invoice.outstandingAmount.toNumber() > 0 ? [["Sisa tagihan", invoice.outstandingAmount.toNumber()]] as [string, number][] : []),
  ];
  totals.forEach(([label, amount], index) => {
    const yy = totalsTop - index * 21;
    const isGrandTotal = String(label).toLowerCase() === "grand total";
    if (isGrandTotal) page.drawLine({ start: { x: totalsX, y: yy + 15 }, end: { x: totalsRight, y: yy + 15 }, thickness: .6, color: border });
    drawTextAt(String(label), totalsX, yy, isGrandTotal ? 9 : 8, isGrandTotal ? bold : regular, isGrandTotal ? navy : muted);
    drawRight(formatNumber(Number(amount)), totalsRight, yy, isGrandTotal ? 10 : 8, bold, isGrandTotal ? blue : navy);
  });

  const words = paymentAwareWords(invoice);
  const wordsY = Math.min(totalsTop - totals.length * 21 - 24, 315);
  page.drawLine({ start: { x: marginX, y: wordsY + 22 }, end: { x: 563, y: wordsY + 22 }, thickness: .5, color: border });
  drawTextAt(words.label, marginX, wordsY, 7.5, bold, labelColor);
  drawWrapped(words.text, marginX, wordsY - 20, 300, 10, bold, navy, 3, 13);

  const accounts = paymentAccounts(invoice);
  const paymentY = 138;
  drawTextAt("REKENING PEMBAYARAN", marginX, paymentY, 7.5, bold, labelColor);
  accounts.slice(0, 3).forEach((account, index) => {
    drawWrapped(`${account.bankName}${account.isPrimary ? " (Utama)" : ""}: ${account.accountNumber} a.n. ${account.accountName}`, marginX, paymentY - 17 - index * 14, 285, 7.8, regular, muted, 1, 10);
  });
  if (!accounts.length) drawTextAt("Belum ada rekening pembayaran.", marginX, paymentY - 17, 7.8, regular, muted);

  drawTextAt(sanitize(invoice.company.closingGreeting || "Hormat kami"), 405, 136, 8, regular, navy);
  if (signatureImage) {
    const signatureSize = fitImage(signatureImage.width, signatureImage.height, 120, 48);
    page.drawImage(signatureImage, { x: 395, y: 75, width: signatureSize.width, height: signatureSize.height });
  }
  drawTextAt(sanitize(invoice.company.signerName || invoice.company.name), 385, 52, 8, bold, navy);
  if (invoice.company.signerTitle) drawTextAt(sanitize(invoice.company.signerTitle), 385, 40, 7, regular, muted);

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
  excelMetaRows(invoice).forEach(([label, value], index) => {
    const row = 8 + index;
    const labelColumn = index < 2 ? "A" : "D";
    const valueColumn = index < 2 ? "B" : "E";
    const normalizedRow = index < 2 ? row : row - 2;
    sheet.getCell(`${labelColumn}${normalizedRow}`).value = label;
    sheet.getCell(`${valueColumn}${normalizedRow}`).value = value;
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

function pdfMetaRows(invoice: InvoiceDocument): [string, string][] {
  if (invoice.shipment.shipmentDirection === "LAIN_LAIN") {
    return [
      ["REFERENSI", invoice.shipment.doNumber || "-"],
      ["PEKERJAAN", `${invoice.shipment.vessel || "-"}${invoice.shipment.voyage ? ` / ${invoice.shipment.voyage}` : ""}`],
      ["TIPE ORDER", "Lain-lain"],
      ["CARRIER", invoice.shipment.carrier?.name || "-"],
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

function excelMetaRows(invoice: InvoiceDocument): [string, string][] {
  if (invoice.shipment.shipmentDirection === "LAIN_LAIN") {
    return [
      ["Referensi", invoice.shipment.doNumber || "-"],
      ["Pekerjaan", `${invoice.shipment.vessel || "-"}${invoice.shipment.voyage ? ` / ${invoice.shipment.voyage}` : ""}`],
      ["Tipe order", "Lain-lain"],
      ["Carrier", invoice.shipment.carrier?.name || "-"],
    ];
  }
  return [
    [invoice.shipment.shipmentDirection === "EXPORT" ? "DO Number (Export)" : "B/L Number (Import)", invoice.shipment.doNumber],
    ["Vessel/Voyage", `${invoice.shipment.vessel} / ${invoice.shipment.voyage}`],
    ["B/L Number (Impor)", invoiceBlLabel(invoice)],
    ["Size 20/40", summarizeContainerSizes(invoice.shipment.containers)],
  ];
}

function invoiceBlLabel(invoice: InvoiceDocument) {
  if (invoice.shipment.shipmentDirection === "LAIN_LAIN") return invoice.shipment.doNumber || "-";
  if (invoice.bill?.number) return invoice.bill.number;
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
