import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { calculateCharge } from "@/lib/business";
import { fail, ok, requireUser } from "@/lib/api";
import { syncDraftInvoicesForShipment } from "@/lib/invoice-service";

const schema = z.object({
  billId: z.string().optional().nullable(),
  chargeTypeId: z.string().optional().nullable(),
  name: z.string().min(2),
  description: z.string().optional(),
  category: z.enum(["JASA", "REIMBURSEMENT"]),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
  advanceDpAmount: z.coerce.number().nonnegative().optional(),
  advanceDpDate: z.string().optional(),
  advanceDpMethod: z.string().optional(),
  advanceDpReference: z.string().optional(),
  advanceDpNotes: z.string().optional(),
});

const updateSchema = schema.extend({
  id: z.string().min(1),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

async function assertChargeCanChange(shipmentId: string, chargeId: string) {
  const charge = await db.charge.findFirst({ where: { id: chargeId, shipmentId } });
  if (!charge) return { error: fail("Biaya tidak ditemukan.", 404) };

  const lockedInvoiceItems = await db.invoiceItem.count({
    where: {
      chargeId,
      invoice: { status: { notIn: ["DRAFT", "CANCELLED", "REVISED"] } },
    },
  });
  if (lockedInvoiceItems > 0) {
    return { error: fail("Biaya ini sudah masuk invoice final/berjalan. Buat revisi invoice dahulu sebelum mengubah biaya.", 422) };
  }

  return { charge };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    if (input.category === "JASA" && !input.billId) return fail("Biaya JASA wajib terkait dengan B/L.", 422);
    const tax = input.category === "JASA"
      ? await db.taxRate.findFirst({ where: { active: true }, orderBy: { effectiveDate: "desc" } })
      : null;
    if (input.category === "JASA" && !tax) return fail("Tarif PPN aktif belum dikonfigurasi.", 422);
    const calculated = calculateCharge({
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      category: input.category,
      taxRate: tax?.rate.toNumber() ?? 0,
    });
    const charge = await db.charge.create({
      data: {
        shipmentId: id,
        billId: input.billId || null,
        chargeTypeId: input.chargeTypeId || null,
        name: input.name,
        description: input.description,
        category: input.category,
        quantity: new Prisma.Decimal(input.quantity),
        unitPrice: new Prisma.Decimal(input.unitPrice),
        subtotal: new Prisma.Decimal(calculated.subtotal),
        taxRate: new Prisma.Decimal(calculated.taxRate),
        taxAmount: new Prisma.Decimal(calculated.taxAmount),
        totalAmount: new Prisma.Decimal(calculated.totalAmount),
        notes: input.notes,
      },
    });
    if (input.advanceDpAmount && input.advanceDpAmount > 0) {
      await db.shipment.update({
        where: { id },
        data: {
          advanceDpAmount: new Prisma.Decimal(input.advanceDpAmount),
          advanceDpDate: input.advanceDpDate ? new Date(input.advanceDpDate) : new Date(),
          advanceDpMethod: input.advanceDpMethod || "Transfer Bank",
          advanceDpReference: input.advanceDpReference || null,
          advanceDpNotes: input.advanceDpNotes || null,
        },
      });
      await audit({
        userId: access.user.id,
        module: "PAYMENT",
        action: "SET_ADVANCE_DP",
        referenceId: id,
        newValue: { amount: input.advanceDpAmount, method: input.advanceDpMethod || "Transfer Bank", reference: input.advanceDpReference || null },
      });
    }
    await audit({ userId: access.user.id, module: "CHARGE", action: "CREATE", referenceId: charge.id });
    await syncDraftInvoicesForShipment(id, access.user.id);
    return ok(charge);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal menyimpan biaya.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const input = updateSchema.parse(await request.json());
    const editable = await assertChargeCanChange(id, input.id);
    if (editable.error) return editable.error;

    if (input.category === "JASA" && !input.billId) return fail("Biaya JASA wajib terkait dengan B/L.", 422);
    const tax = input.category === "JASA"
      ? await db.taxRate.findFirst({ where: { active: true }, orderBy: { effectiveDate: "desc" } })
      : null;
    if (input.category === "JASA" && !tax) return fail("Tarif PPN aktif belum dikonfigurasi.", 422);

    const calculated = calculateCharge({
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      category: input.category,
      taxRate: tax?.rate.toNumber() ?? 0,
    });

    const charge = await db.charge.update({
      where: { id: input.id },
      data: {
        billId: input.billId || null,
        chargeTypeId: input.chargeTypeId || null,
        name: input.name,
        description: input.description,
        category: input.category,
        quantity: new Prisma.Decimal(input.quantity),
        unitPrice: new Prisma.Decimal(input.unitPrice),
        subtotal: new Prisma.Decimal(calculated.subtotal),
        taxRate: new Prisma.Decimal(calculated.taxRate),
        taxAmount: new Prisma.Decimal(calculated.taxAmount),
        totalAmount: new Prisma.Decimal(calculated.totalAmount),
        notes: input.notes,
      },
    });

    await audit({
      userId: access.user.id,
      module: "CHARGE",
      action: "UPDATE",
      referenceId: charge.id,
      oldValue: {
        name: editable.charge.name,
        category: editable.charge.category,
        quantity: editable.charge.quantity.toString(),
        unitPrice: editable.charge.unitPrice.toString(),
      },
      newValue: {
        name: charge.name,
        category: charge.category,
        quantity: charge.quantity.toString(),
        unitPrice: charge.unitPrice.toString(),
      },
    });
    await syncDraftInvoicesForShipment(id, access.user.id);
    return ok(charge);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal mengubah biaya.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const input = deleteSchema.parse(await request.json());
    const editable = await assertChargeCanChange(id, input.id);
    if (editable.error) return editable.error;

    await db.invoiceItem.deleteMany({ where: { chargeId: input.id, invoice: { status: "DRAFT" } } });
    await db.charge.delete({ where: { id: input.id } });
    await audit({
      userId: access.user.id,
      module: "CHARGE",
      action: "DELETE",
      referenceId: input.id,
      oldValue: {
        name: editable.charge.name,
        category: editable.charge.category,
        quantity: editable.charge.quantity.toString(),
        unitPrice: editable.charge.unitPrice.toString(),
      },
    });
    await syncDraftInvoicesForShipment(id, access.user.id);
    return ok({ id: input.id });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal menghapus biaya.");
  }
}
