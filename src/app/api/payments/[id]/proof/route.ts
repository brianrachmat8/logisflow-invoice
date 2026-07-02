import fs from "node:fs/promises";
import path from "node:path";
import { fail, ok, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

const allowed = new Set(["image/jpeg", "image/png", "application/pdf"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser();
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const payment = await db.payment.findUnique({ where: { id }, select: { proofFilePath: true } });
    if (!payment?.proofFilePath) return fail("Bukti pembayaran belum tersedia.", 404);
    const bytes = await fs.readFile(payment.proofFilePath);
    const ext = path.extname(payment.proofFilePath).toLowerCase();
    const contentType = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${path.basename(payment.proofFilePath)}"`,
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Bukti pembayaran gagal dibuka.", 404);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("proof");
    if (!(file instanceof File) || !file.size) return fail("Pilih file bukti pembayaran terlebih dahulu.", 422);
    if (!allowed.has(file.type) || file.size > 5 * 1024 * 1024) {
      return fail("Bukti pembayaran harus JPG, PNG, atau PDF maksimal 5 MB.", 422);
    }
    const payment = await db.payment.findUnique({ where: { id }, select: { id: true } });
    if (!payment) return fail("Pembayaran tidak ditemukan.", 404);

    const root = path.resolve(process.env.STORAGE_PATH || "./storage", "payments");
    await fs.mkdir(root, { recursive: true });
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const proofFilePath = path.join(root, safeName);
    await fs.writeFile(proofFilePath, Buffer.from(await file.arrayBuffer()));

    const updated = await db.payment.update({ where: { id }, data: { proofFilePath } });
    return ok(updated);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Bukti pembayaran gagal diupload.", 422);
  }
}
