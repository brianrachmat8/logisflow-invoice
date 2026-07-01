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
  const navy = rgb(0.06, 0.11, 0.31);
  const red = rgb(0.86, 0.07, 0.14);
  const line = rgb(0.66, 0.7, 0.8);
  const white = rgb(1, 1, 1);
  const pageWidth = 595.28;
  const marginX = 34;
  const contentWidth = pageWidth - marginX * 2;

  const drawText = (text: string, x: number, y: number, size = 9, font = regular, color = navy) => {
    page.drawText(sanitize(text), { x, y, size, font, color });
  };
  const drawRight = (text: string, rightX: number, y: number, size = 9, font = regular, color = navy) => {
    const safe = sanitize(text);
    page.drawText(safe, { x: rightX - font.widthOfTextAtSize(safe, size), y, size, font, color });
  };
  const sectionHeader = (title: string, x: number, y: number, width: number) => {
    page.drawRectangle({ x, y, width, height: 18, color: navy });
    drawText(title, x + 10, y + 4, 11, bold, white);
  };

  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 841.89, color: white });

  if (logoImage) {
    const logoSize = fitImage(logoImage.width, logoImage.height, 112, 54);
    page.drawImage(logoImage, { x: marginX, y: 764, width: logoSize.width, height: logoSize.height });
  } else {
    page.drawRectangle({ x: marginX, y: 782, width: 22, height: 22, color: red });
    drawText(invoice.company.name, marginX + 36, 779, 20, bold, navy);
  }
  drawRight("INVOICE", pageWidth - marginX, 778, 25, bold, red);

  drawText(`Invoice No ${invoice.invoiceNumber}`, marginX + 4, 728, 11, bold, navy);
  drawText(tanggal.format(invoice.invoiceDate), marginX + 4, 708, 12, bold, navy);
  drawText(`Jatuh Tempo ${tanggal.format(invoice.dueDate)}`, marginX + 4, 688, 9, bold, navy);

  const leftX = marginX;
  const rightX = 316;
  const panelY = 650;
  const panelW = 226;
  sectionHeader("Ditagihkan Kepada", leftX, panelY, panelW);
  sectionHeader("Detail Pekerjaan", rightX, panelY, panelW);

  drawText(invoice.client.name, leftX + 10, panelY - 24, 12, bold, navy);
  wrapText(invoice.client.address, panelW - 20, 9, regular).slice(0, 4).forEach((row, index) => {
    drawText(row, leftX + 10, panelY - 41 - index * 11, 9, regular, navy);
  });
  if (invoice.client.email) drawText(`Email: ${invoice.client.email}`, leftX + 10, panelY - 94, 9, regular, navy);
  if (invoice.client.phone) drawText(`UP: ${invoice.client.phone}`, leftX + 10, panelY - 108, 9, regular, navy);

  invoiceDocumentMeta(invoice).slice(0, 5).forEach(([label, value], index) => {
    const rowY = panelY - 24 - index * 18;
    drawText(`${label}: ${value}`.slice(0, 46), rightX + 18, rowY, index === 4 ? 11 : 9, bold, navy);
  });

  const tableTop = 520;
  page.drawRectangle({ x: marginX, y: tableTop, width: contentWidth, height: 18, color: navy });
  drawText("Deskripsi", marginX + 10, tableTop + 4, 11, bold, white);
  drawText("Harga", 365, tableTop + 4, 11, bold, white);
  drawText("Qty", 431, tableTop + 4, 11, bold, white);
  drawText("Total", 493, tableTop + 4, 11, bold, white);

  let y = tableTop - 22;
  invoice.items.slice(0, 7).forEach((item) => {
    wrapText(item.description, 285, 10, regular).slice(0, 2).forEach((row, index) => {
      drawText(row, marginX + 12, y - index * 11, 10, regular, navy);
    });
    drawRight(formatNumber(item.unitPrice.toNumber()), 393, y, 10, regular, navy);
    drawRight(String(item.quantity), 452, y, 10, regular, navy);
    drawRight(formatNumber(item.totalAmount.toNumber()), pageWidth - marginX - 16, y, 10, regular, navy);
    page.drawLine({ start: { x: marginX, y: y - 13 }, end: { x: pageWidth - marginX, y: y - 13 }, thickness: .6, color: line });
    y -= 31;
  });

  const totalsX = 356;
  const totalsValueX = pageWidth - marginX - 18;
  const totalsY = Math.max(y - 16, 252);
  drawText("Subtotal", totalsX, totalsY, 11, bold, navy);
  drawRight(formatNumber(invoice.subtotal.toNumber()), totalsValueX, totalsY, 11, regular, navy);
  drawText("PPN", totalsX, totalsY - 20, 11, bold, navy);
  drawRight(formatNumber(invoice.taxAmount.toNumber()), totalsValueX, totalsY - 20, 11, regular, navy);
  drawText("DP / Paid", totalsX, totalsY - 40, 11, bold, navy);
  drawRight(formatNumber(invoice.amountPaid.toNumber()), totalsValueX, totalsY - 40, 11, regular, navy);

  const totalBarY = totalsY - 72;
  page.drawRectangle({ x: totalsX - 22, y: totalBarY, width: 224, height: 20, color: navy });
  drawText("Total", totalsX, totalBarY + 5, 11, bold, white);
  drawRight(formatNumber(invoice.grandTotal.toNumber()), totalsValueX, totalBarY + 5, 11, bold, white);
  const outstandingY = totalBarY - 20;
  drawText("Sisa Tagihan", totalsX - 22, outstandingY, 10, bold, navy);
  drawRight(formatNumber(invoice.outstandingAmount.toNumber()), totalsValueX, outstandingY, 10, regular, navy);

  const words = paymentAwareWords(invoice);
  const wordsY = Math.max(outstandingY - 34, 136);
  drawText(`${words.label}: ${words.text}`, marginX - 10, wordsY, 12, bold, rgb(0, 0, 0));

  const payY = Math.max(wordsY - 48, 88);
  sectionHeader("Payment Info", marginX - 10, payY, 226);
  const accounts = paymentAccounts(invoice);
  if (accounts.length) {
    const account = accounts[0];
    drawText(account.bankName, marginX, payY - 24, 10, regular, navy);
    drawText(account.accountNumber, marginX, payY - 38, 10, regular, navy);
    drawText(account.accountName, marginX, payY - 52, 10, regular, navy);
  } else {
    drawText("Belum ada rekening pembayaran.", marginX, payY - 24, 10, regular, navy);
  }

  const signY = Math.max(payY - 4, 74);
  drawText(sanitize(invoice.company.closingGreeting || "Hormat kami"), 420, signY, 11, bold, navy);
  if (signatureImage) {
    const signatureSize = fitImage(signatureImage.width, signatureImage.height, 112, 42);
    page.drawImage(signatureImage, { x: 398, y: signY - 48, width: signatureSize.width, height: signatureSize.height });
  }
  drawText(sanitize(invoice.company.signerName || invoice.company.name), 390, signY - 60, 10, bold, navy);
  if (invoice.company.signerTitle) drawText(sanitize(invoice.company.signerTitle), 390, signY - 74, 9, regular, navy);

  drawText("Thank you!", marginX - 6, 28, 24, bold, red);

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
  return {
    label: "TERBILANG",
    text: terbilang(invoice.grandTotal.toNumber()),
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
