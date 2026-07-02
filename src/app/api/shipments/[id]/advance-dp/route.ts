import { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok, requireUser } from "@/lib/api";
import { db } from "@/lib/db";
import { syncDraftInvoicesForShipment } from "@/lib/invoice-service";

const schema = z.object({
  amount: z.coerce.number().nonnegative(),
  paymentDate: z.string().optional(),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;

  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    const shipment = await db.shipment.findUnique({
      where: { id },
      include: { invoices: { select: { status: true } } },
    });
    if (!shipment) return fail("Shipment tidak ditemukan.", 404);

    const hasLockedInvoice = shipment.invoices.some((invoice) => !["DRAFT", "CANCELLED", "REVISED"].includes(invoice.status));
    if (hasLockedInvoice) {
      return fail("DP tidak dapat diedit karena invoice sudah final/berjalan. Batalkan invoice dahulu jika data memang harus dikoreksi.", 422);
    }

    const previousAdvanceDp = shipment.advanceDpAmount.toNumber();
    const updated = await db.shipment.update({
      where: { id },
      data: {
        advanceDpAmount: new Prisma.Decimal(input.amount),
        advanceDpDate: input.amount > 0 && input.paymentDate ? new Date(input.paymentDate) : null,
        advanceDpMethod: input.amount > 0 ? input.method || "Transfer Bank" : null,
        advanceDpReference: input.amount > 0 ? input.reference || null : null,
        advanceDpNotes: input.amount > 0 ? input.notes || null : null,
      },
    });

    await audit({
      userId: access.user.id,
      module: "PAYMENT",
      action: "UPDATE_ADVANCE_DP",
      referenceId: id,
      oldValue: { amount: previousAdvanceDp },
      newValue: { amount: input.amount, method: input.method || null, reference: input.reference || null },
    });
    await syncDraftInvoicesForShipment(id, access.user.id);

    return ok(updated);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal mengubah DP awal.", 422);
  }
}
