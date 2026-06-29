import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { fail, requireUser } from "@/lib/api";
import { generateInvoiceDocuments } from "@/lib/documents";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const access = await requireUser();
  if (access.error) return access.error;
  const { id, format } = await params;
  if (!["pdf", "xlsx"].includes(format)) return fail("Format tidak didukung.", 404);
  let file = await db.generatedFile.findFirst({
    where: { invoiceId: id, type: format === "pdf" ? "PDF" : "EXCEL" },
    orderBy: { generatedAt: "desc" },
  });
  if (!file) {
    await generateInvoiceDocuments(id);
    file = await db.generatedFile.findFirst({
      where: { invoiceId: id, type: format === "pdf" ? "PDF" : "EXCEL" },
      orderBy: { generatedAt: "desc" },
    });
  }
  if (!file) return fail("Dokumen gagal dibuat.", 500);
  const bytes = await fs.readFile(file.path);
  return new Response(bytes, {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${path.basename(file.path)}"`,
    },
  });
}
