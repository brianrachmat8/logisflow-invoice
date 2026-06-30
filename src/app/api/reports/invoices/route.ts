import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { fail, requireUser } from "@/lib/api";

export async function GET() {
  const access = await requireUser();
  if (access.error) return access.error;
  try {
    const invoices = await db.invoice.findMany({ include: { client: true, shipment: true, bill: true }, orderBy: { invoiceDate: "desc" } });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Laporan Invoice");
    sheet.columns = [
      { header: "Nomor Invoice", key: "number", width: 28 }, { header: "Tanggal", key: "date", width: 15 },
      { header: "Klien", key: "client", width: 30 }, { header: "Job / Referensi", key: "job", width: 28 },
      { header: "B/L", key: "bill", width: 18 }, { header: "Tipe", key: "type", width: 18 },
      { header: "Subtotal", key: "subtotal", width: 18 }, { header: "PPN", key: "tax", width: 18 },
      { header: "Grand Total", key: "total", width: 18 }, { header: "Outstanding", key: "outstanding", width: 18 },
      { header: "Status", key: "status", width: 18 },
    ];
    invoices.forEach((invoice) => {
      const isManual = invoice.type === "LAIN_LAIN";
      sheet.addRow({
        number: invoice.invoiceNumber || invoice.draftNumber,
        date: invoice.invoiceDate,
        client: invoice.client.name,
        job: isManual ? invoice.manualReference || invoice.manualTitle || "Invoice Lain-lain" : invoice.shipment?.jobNumber || "-",
        bill: isManual ? "Non-trucking" : invoice.bill?.number || "-",
        type: isManual ? "LAIN-LAIN" : invoice.type,
        subtotal: invoice.subtotal.toNumber(),
        tax: invoice.taxAmount.toNumber(),
        total: invoice.grandTotal.toNumber(),
        outstanding: invoice.outstandingAmount.toNumber(),
        status: invoice.status,
      });
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1739" } };
    ["G","H","I","J"].forEach((col) => sheet.getColumn(col).numFmt = '"Rp" #,##0');
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="laporan-invoice.xlsx"',
    }});
  } catch {
    return fail("Laporan gagal dibuat.", 500);
  }
}
