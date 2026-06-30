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
  const isManual = invoice.type === "LAIN_LAIN";
  let y = 780;
  const draw = (text: string, x: number, size = 9, font = regular, color = navy) => {
    page.drawText(sanitize(text), { x, y, size, font, color });
  };
  const drawTextAt = (text: string, x: number, yy: number, size = 9, font = regular, color = navy) => {
    page.drawText(sanitize(text), { x, y: yy, size, font, color });
  };
  const drawRight = (text: string, rightX: number, yy: number, size = 9, font = regular, color = navy) => {
    const safe = sanitize(text);
    page.drawText(safe, { x: rightX - font.widthOfTextAtSize(safe, size), y: yy, size, font, color });
  };
  page.drawRectangle({ x: 0, y: 805, width: 595.28, height: 37, color: navy });
  if (logoImage) {
    const logoSize = fitImage(logoImage.width, logoImage.height, 54, 40);
    page.drawImage(logoImage, { x: 38, y: 758 + (42 - logoSize.height) / 2, width: logoSize.width, height: logoSize.height });
  } else {
    page.drawRectangle({ x: 38, y: 758, width: 42, height: 42, color: blue });
  }
  draw(invoice.company.name, 94, 15, bold); y -= 18;
  wrapText(invoice.company.address, 300, 8, regular).slice(0, 2).forEach((line, index) => {
    drawTextAt(line, 94, 762 - index * 11, 8, regular, muted);
  });
  drawRight("INVOICE", 557, 775, 20, bold, navy);
  y = 720;
  draw("DITAGIHKAN KEPADA", 38, 8, bold, muted); y -= 19;
  draw(invoice.client.name, 38, 12, bold); y -= 16;
  wrapText(invoice.client.address, 300, 8, regular).slice(0, 3).forEach((line, index) => {
    drawTextAt(line, 38, 694 - index * 12, 8, regular, muted);
  });
  page.drawText(`No: ${invoice.invoiceNumber}`, { x: 350, y: 720, size: 9, font: bold, color: navy });
  page.drawText(`Tanggal: ${tanggal.format(invoice.invoiceDate)}`, { x: 350, y: 704, size: 8, font: regular, color: muted });
  page.drawText(`Jatuh tempo: ${tanggal.format(invoice.dueDate)}`, { x: 350, y: 689, size: 8, font: regular, color: muted });

  y = 640;
  const meta = isManual
    ? [
        ["JENIS INVOICE", "Lain-lain / Non-trucking"],
        ["JUDUL", invoice.manualTitle || "Invoice Lain-lain"],
        ["REFERENSI", invoice.manualReference || "-"],
        ["CATATAN", invoice.manualNotes || "-"],
      ]
    : [
        [invoice.shipment?.shipmentDirection === "EXPORT" ? "DO NUMBER (EXPORT)" : "B/L NUMBER (IMPORT)", invoice.shipment?.doNumber || "-"],
        ["VESSEL / VOYAGE", invoice.shipment ? `${invoice.shipment.vessel} / ${invoice.shipment.voyage}` : "-"],
        ["CARRIER", invoice.shipment?.carrier?.name || "-"],
        ["B/L NUMBER (IMPOR)", invoiceBlLabel(invoice)],
        ["SIZE 20/40", summarizeContainerSizes(invoice.shipment?.containers || [])],
      ];
  page.drawRectangle({ x: 38, y: 556, width: 519, height: 101, color: rgb(.97, .98, 1) });
  meta.forEach(([label, value], index) => {
    const x = 52 + (index % 2) * 255;
    const yy = 634 - Math.floor(index / 2) * 31;
    page.drawText(label, { x, y: yy, size: 7, font: bold, color: muted });
    page.drawText(sanitize(value).slice(0, 31), { x, y: yy - 13, size: 9, font: bold, color: navy });
  });

  y = 520;
  page.drawRectangle({ x: 38, y: y - 5, width: 519, height: 26, color: navy });
  const headers = isManual ? ["URAIAN", "QTY", "SATUAN", "HARGA", "TOTAL"] : ["DESKRIPSI", "QTY", "HARGA", "TOTAL"];
  const cols = isManual ? [48, 246, 300, 370, 545] : [48, 260, 345, 430, 545];
  headers.forEach((label, i) => {
    page.drawText(label, { x: cols[i], y: y + 5, size: 7, font: bold, color: rgb(1,1,1) });
  });
  y -= 30;
  for (const item of invoice.items.slice(0, 14)) {
    page.drawText(sanitize(item.description).slice(0, isManual ? 38 : 48), { x: 48, y, size: 8, font: regular, color: navy });
    drawRight(String(item.quantity), isManual ? 260 : 270, y, 8, regular, navy);
    if (isManual) page.drawText(sanitize(item.unit).slice(0, 12), { x: 300, y, size: 8, font: regular, color: navy });
    drawRight(formatNumber(item.unitPrice.toNumber()), isManual ? 430 : 395, y, 8, regular, navy);
    drawRight(formatNumber(item.totalAmount.toNumber()), 545, y, 8, bold, navy);
    page.drawLine({ start: { x: 38, y: y - 8 }, end: { x: 557, y: y - 8 }, thickness: .4, color: rgb(.88,.9,.94) });
    y -= 24;
  }
  y -= 12;
  const totals = [
    ["Subtotal", invoice.subtotal.toNumber()],
    [`PPN ${invoice.taxRate}%`, invoice.taxAmount.toNumber()],
    ["Grand Total", invoice.grandTotal.toNumber()],
    ...(invoice.amountPaid.toNumber() > 0 ? [["DP / Paid", invoice.amountPaid.toNumber()]] as [string, number][] : []),
    ...(invoice.outstandingAmount.toNumber() > 0 && invoice.amountPaid.toNumber() > 0 ? [["Sisa Tagihan", invoice.outstandingAmount.toNumber()]] as [string, number][] : []),
  ];
  totals.forEach(([label, amount], index) => {
    page.drawText(String(label), { x: 365, y: y - index * 22, size: index === 2 ? 10 : 8, font: index === 2 ? bold : regular, color: navy });
    drawRight(formatNumber(Number(amount)), 520, y - index * 22, index === 2 ? 10 : 8, bold, index === 2 ? blue : navy);
  });
  const words = paymentAwareWords(invoice);
  page.drawText(words.label, { x: 38, y, size: 7, font: bold, color: muted });
  wrapText(words.text, 300, 8, bold).slice(0, 2).forEach((line, index) => {
    page.drawText(sanitize(line), { x: 38, y: y - 18 - index * 12, size: 8, font: bold, color: navy });
  });
  const accounts = paymentAccounts(invoice);
  page.drawText("Rekening pembayaran:", { x: 38, y: 118, size: 8, font: bold, color: muted });
  accounts.slice(0, 3).forEach((account, index) => {
    page.drawText(`${sanitize(account.bankName)}${account.isPrimary ? " (Utama)" : ""}: ${sanitize(account.accountNumber)} a.n. ${sanitize(account.accountName)}`, {
      x: 38, y: 104 - index * 12, size: 8, font: regular, color: muted,
    });
  });
  if (!accounts.length) {
    page.drawText("Belum ada rekening pembayaran.", { x: 38, y: 104, size: 8, font: regular, color: muted });
  }
  page.drawText(sanitize(invoice.company.closingGreeting || "Hormat kami"), { x: 405, y: 126, size: 8, font: regular, color: navy });
  if (signatureImage) {
    const signatureSize = fitImage(signatureImage.width, signatureImage.height, 120, 48);
    page.drawImage(signatureImage, { x: 395, y: 68, width: signatureSize.width, height: signatureSize.height });
  }
  page.drawText(sanitize(invoice.company.signerName || invoice.company.name), { x: 385, y: 45, size: 8, font: bold, color: navy });
  if (invoice.company.signerTitle) {
    page.drawText(sanitize(invoice.company.signerTitle), { x: 385, y: 33, size: 7, font: regular, color: muted });
  }
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
  const isManual = invoice.type === "LAIN_LAIN";
  sheet.columns = [
    { key: "a", width: 6 }, { key: "b", width: 34 }, { key: "c", width: 12 },
    { key: "d", width: 14 }, { key: "e", width: 18 }, { key: "f", width: 20 },
  ];
  sheet.mergeCells("A1:C2");
  sheet.getCell("A1").value = invoice.company.name;
  sheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF0B1739" } };
  sheet.mergeCells("E1:F2");
  sheet.getCell("E1").value = "INVOICE";
  sheet.getCell("E1").font = { bold: true, size: 20, color: { argb: "FF1967FF" } };
  sheet.getCell("E1").alignment = { horizontal: "right" };
  sheet.mergeCells("A3:C3");
  sheet.getCell("A3").value = invoice.company.address;
  sheet.getCell("E3").value = "Nomor";
  sheet.getCell("F3").value = invoice.invoiceNumber;
  sheet.getCell("E4").value = "Tanggal";
  sheet.getCell("F4").value = tanggal.format(invoice.invoiceDate);
  sheet.getCell("E5").value = "Jatuh tempo";
  sheet.getCell("F5").value = tanggal.format(invoice.dueDate);
  sheet.getCell("A7").value = "Kepada";
  sheet.getCell("B7").value = invoice.client.name;
  if (isManual) {
    sheet.getCell("A8").value = "Jenis";
    sheet.getCell("B8").value = "Invoice Lain-lain";
    sheet.getCell("A9").value = "Judul";
    sheet.getCell("B9").value = invoice.manualTitle || "Invoice Lain-lain";
    sheet.getCell("E8").value = "Referensi";
    sheet.getCell("F8").value = invoice.manualReference || "-";
  } else {
    sheet.getCell("A8").value = invoice.shipment?.shipmentDirection === "EXPORT" ? "DO Number (Export)" : "B/L Number (Import)";
    sheet.getCell("B8").value = invoice.shipment?.doNumber || "-";
    sheet.getCell("A9").value = "Vessel/Voyage";
    sheet.getCell("B9").value = invoice.shipment ? `${invoice.shipment.vessel} / ${invoice.shipment.voyage}` : "-";
    sheet.getCell("E8").value = "B/L Number (Impor)";
    sheet.getCell("F8").value = invoiceBlLabel(invoice);
    sheet.getCell("E9").value = "Size 20/40";
    sheet.getCell("F9").value = summarizeContainerSizes(invoice.shipment?.containers || []);
  }

  const headerRow = sheet.getRow(11);
  headerRow.values = isManual
    ? ["No", "Uraian", "Qty", "Satuan", "Harga Satuan", "Total"]
    : ["No", "Deskripsi", "Qty", "", "Harga Satuan", "Total"];
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1739" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center" };
  });
  invoice.items.forEach((item, index) => {
    sheet.addRow(isManual
      ? [index + 1, item.description, item.quantity.toNumber(), item.unit, item.unitPrice.toNumber(), item.totalAmount.toNumber()]
      : [index + 1, item.description, item.quantity.toNumber(), "", item.unitPrice.toNumber(), item.totalAmount.toNumber()]);
  });
  const totalStart = 12 + invoice.items.length;
  sheet.getCell(`E${totalStart}`).value = "Subtotal";
  sheet.getCell(`F${totalStart}`).value = invoice.subtotal.toNumber();
  sheet.getCell(`E${totalStart + 1}`).value = `PPN ${invoice.taxRate}%`;
  sheet.getCell(`F${totalStart + 1}`).value = invoice.taxAmount.toNumber();
  sheet.getCell(`E${totalStart + 2}`).value = "Grand Total";
  sheet.getCell(`F${totalStart + 2}`).value = invoice.grandTotal.toNumber();
  sheet.getCell(`E${totalStart + 2}`).font = { bold: true };
  sheet.getCell(`F${totalStart + 2}`).font = { bold: true, color: { argb: "FF1967FF" } };
  let afterTotalRow = totalStart + 3;
  if (invoice.amountPaid.toNumber() > 0) {
    sheet.getCell(`E${afterTotalRow}`).value = "DP / Paid";
    sheet.getCell(`F${afterTotalRow}`).value = invoice.amountPaid.toNumber();
    afterTotalRow += 1;
    if (invoice.outstandingAmount.toNumber() > 0) {
      sheet.getCell(`E${afterTotalRow}`).value = "Sisa Tagihan";
      sheet.getCell(`F${afterTotalRow}`).value = invoice.outstandingAmount.toNumber();
      afterTotalRow += 1;
    }
  }
  sheet.mergeCells(`A${afterTotalRow + 1}:F${afterTotalRow + 1}`);
  const words = paymentAwareWords(invoice);
  sheet.getCell(`A${afterTotalRow + 1}`).value = `${words.label}: ${words.text}`;
  if (invoice.manualNotes) {
    sheet.mergeCells(`A${afterTotalRow + 2}:F${afterTotalRow + 2}`);
    sheet.getCell(`A${afterTotalRow + 2}`).value = `Catatan: ${invoice.manualNotes}`;
    afterTotalRow += 1;
  }
  const accounts = paymentAccounts(invoice);
  sheet.mergeCells(`A${afterTotalRow + 3}:F${afterTotalRow + 3}`);
  sheet.getCell(`A${afterTotalRow + 3}`).value = "Rekening pembayaran";
  sheet.getCell(`A${afterTotalRow + 3}`).font = { bold: true };
  accounts.forEach((account, index) => {
    sheet.mergeCells(`A${afterTotalRow + 4 + index}:F${afterTotalRow + 4 + index}`);
    sheet.getCell(`A${afterTotalRow + 4 + index}`).value = `${account.bankName}${account.isPrimary ? " (Utama)" : ""}: ${account.accountNumber} a.n. ${account.accountName}`;
  });
  if (!accounts.length) {
    sheet.mergeCells(`A${afterTotalRow + 4}:F${afterTotalRow + 4}`);
    sheet.getCell(`A${afterTotalRow + 4}`).value = "Belum ada rekening pembayaran.";
  }
  sheet.getColumn(5).numFmt = '"Rp" #,##0';
  sheet.getColumn(6).numFmt = '"Rp" #,##0';
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

function invoiceBlLabel(invoice: InvoiceDocument) {
  if (invoice.bill?.number) return invoice.bill.number;
  return invoice.type === "JASA" ? "Gabungan" : invoice.type === "REIMBURSEMENT" ? "Reimbursement Gabungan" : "-";
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
