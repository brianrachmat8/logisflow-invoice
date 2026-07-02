import { db } from "@/lib/db";
import { fail, ok, requireUser } from "@/lib/api";
import { audit } from "@/lib/audit";

const deletableInvoiceStatuses = ["DRAFT", "CANCELLED", "REVISED"];

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser();
  if (access.error) return access.error;
  const { id } = await params;
  const shipment = await db.shipment.findUnique({
    where: { id },
    include: {
      client: true,
      carrier: true,
      fieldTeam: true,
      bills: { include: { containers: true } },
      charges: { include: { bill: true } },
      invoices: { include: { payments: true, bill: true } },
    },
  });
  if (!shipment) return fail("Shipment tidak ditemukan.", 404);
  return ok(shipment);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const shipment = await db.shipment.findUnique({
      where: { id },
      include: {
        invoices: {
          select: {
            id: true,
            status: true,
            invoiceNumber: true,
            draftNumber: true,
            _count: { select: { payments: true } },
          },
        },
      },
    });
    if (!shipment) return fail("Shipment tidak ditemukan.", 404);

    const lockedInvoice = shipment.invoices.find((invoice) => {
      const hasOfficialNumber = Boolean(invoice.invoiceNumber);
      const hasPayment = invoice._count.payments > 0;
      const hasLockedStatus = !deletableInvoiceStatuses.includes(invoice.status);
      return hasOfficialNumber || hasPayment || hasLockedStatus;
    });
    if (lockedInvoice) {
      return fail(
        `Shipment tidak bisa dihapus karena sudah memiliki invoice resmi/berbayar (${lockedInvoice.invoiceNumber || lockedInvoice.draftNumber}). Gunakan Batalkan invoice jika data perlu dikoreksi.`,
        422,
      );
    }

    await db.$transaction(async (tx) => {
      const invoiceIds = shipment.invoices.map((invoice) => invoice.id);
      if (invoiceIds.length) {
        await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.generatedFile.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }
      await audit({
        userId: access.user.id,
        module: "SHIPMENT",
        action: "DELETE_TRIAL",
        referenceId: id,
        oldValue: { jobNumber: shipment.jobNumber, draftInvoiceCount: invoiceIds.length },
      }, tx);
      await tx.shipment.delete({ where: { id } });
    });

    return ok({ id });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal menghapus shipment.", 422);
  }
}
