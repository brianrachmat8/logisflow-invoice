import fs from "node:fs/promises";
import path from "node:path";
import { fail, ok, requireUser } from "@/lib/api";
import { recordPayment } from "@/lib/invoice-service";

const allowed = new Set(["image/jpeg", "image/png", "application/pdf"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("proof");
    let proofFilePath: string | undefined;
    if (file instanceof File && file.size) {
      if (!allowed.has(file.type) || file.size > 5 * 1024 * 1024) {
        return fail("Bukti pembayaran harus JPG, PNG, atau PDF maksimal 5 MB.", 422);
      }
      const root = path.resolve(process.env.STORAGE_PATH || "./storage", "payments");
      await fs.mkdir(root, { recursive: true });
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      proofFilePath = path.join(root, safeName);
      await fs.writeFile(proofFilePath, Buffer.from(await file.arrayBuffer()));
    }
    const paymentKind = String(form.get("paymentKind") || "");
    const rawNotes = String(form.get("notes") || "");
    const notes = [
      paymentKind ? `Keterangan: ${paymentKind === "PELUNASAN" ? "Pelunasan / Paid" : "DP / Partial"}` : "",
      rawNotes,
    ].filter(Boolean).join(" - ");
    const payment = await recordPayment(id, access.user.id, {
      paymentDate: new Date(String(form.get("paymentDate"))),
      amount: Number(form.get("amount")),
      method: String(form.get("method")),
      bankReference: String(form.get("bankReference") || "") || undefined,
      notes: notes || undefined,
      proofFilePath,
    });
    return ok(payment);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Pembayaran gagal disimpan.", 422);
  }
}
