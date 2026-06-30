import { Prisma, type InvoiceStatus, type InvoiceType } from "@prisma/client";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { allocateAdvanceDp, invoiceDirectionCode, invoiceNumber, type InvoiceSplitMode, previewSplit, roundMoney, terbilang } from "@/lib/business";
import { generateInvoiceDocuments } from "@/lib/documents";

export async function getShipmentForInvoice(shipmentId: string) {
  return db.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      client: true,
      carrier: true,
      fieldTeam: true,
      bills: { include: { containers: true } },
      containers: true,
      charges: { include: { bill: true } },
      invoices: true,
    },
  });
}

export async function previewShipmentInvoice(shipmentId: string, mode: InvoiceSplitMode = "split_by_bl") {
  const shipment = await getShipmentForInvoice(shipmentId);
  if (!shipment) throw new Error("Shipment tidak ditemukan.");
  validateShipment(shipment, { allowDraftInvoices: true });
  const effectiveMode: InvoiceSplitMode = shipment.shipmentDirection === "LAIN_LAIN" ? "combine_jasa" : mode;
  return {
    shipment,
    split: previewSplit(
      shipment.charges.map((charge) => ({
        id: charge.id,
        billId: charge.billId,
        billNumber: charge.bill?.number,
        name: charge.name,
        description: charge.description,
        category: charge.category,
        quantity: charge.quantity.toNumber(),
        unitPrice: charge.unitPrice.toNumber(),
        taxRate: charge.taxRate.toNumber(),
      })),
      effectiveMode,
    ),
  };
}

function validateShipment(
  shipment: NonNullable<Awaited<ReturnType<typeof getShipmentForInvoice>>>,
  options: { allowDraftInvoices?: boolean } = {},
) {
  const isOtherOrder = shipment.shipmentDirection === "LAIN_LAIN";
  if (shipment.status === "CANCELLED") throw new Error("Shipment telah dibatalkan.");
  if (!shipment.doNumber) throw new Error(isOtherOrder ? "Nomor referensi wajib diisi." : "Nomor DO wajib diisi.");
  if (!isOtherOrder && !shipment.bills.length) throw new Error("Minimal satu B/L wajib tersedia.");
  if (!isOtherOrder && !shipment.containers.length) throw new Error("Minimal satu kontainer wajib tersedia.");
  if (!shipment.charges.length) throw new Error("Minimal satu biaya wajib tersedia.");
  if (!isOtherOrder && shipment.charges.some((charge) => charge.category === "JASA" && !charge.billId)) {
    throw new Error("Semua biaya JASA wajib terkait dengan B/L.");
  }
  const activeInvoices = shipment.invoices.filter((invoice) => invoice.status !== "CANCELLED" && invoice.status !== "REVISED");
  const lockedInvoice = activeInvoices.find((invoice) => invoice.status !== "DRAFT");
  if (lockedInvoice) {
    throw new Error("Shipment ini sudah memiliki invoice final/berjalan. Gunakan fitur revisi sebelum mengubah draft.");
  }
  if (!options.allowDraftInvoices && activeInvoices.length) {
    throw new Error("Shipment ini sudah memiliki draft invoice. Gunakan update draft.");
  }
}

export async function generateDraftInvoices(
  shipmentId: string,
  userId: string,
  options: { mode?: InvoiceSplitMode; replaceDraft?: boolean; action?: string } = {},
) {
  const requestedMode = options.mode ?? "split_by_bl";
  const { shipment, split } = await previewShipmentInvoice(shipmentId, requestedMode);
  const mode: InvoiceSplitMode = shipment.shipmentDirection === "LAIN_LAIN" ? "combine_jasa" : requestedMode;
  const company = await db.company.findFirst({ where: { isDefault: true } })
    ?? await db.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!company) throw new Error("Identitas perusahaan belum dikonfigurasi.");
  const groups = [...split.jasa, ...split.reimbursement];
  const now = new Date();
  const totalGrand = groups.reduce((sum, group) => sum + group.grandTotal, 0);
  const advanceDpAmount = shipment.advanceDpAmount.toNumber();
  if (advanceDpAmount > totalGrand) {
    throw new Error("DP/lunas awal lebih besar dari total biaya yang sudah diinput. Tambahkan semua biaya terlebih dahulu atau cek kembali nominal pembayaran.");
  }
  const advanceDpAllocations = allocateAdvanceDp(groups.map((group) => group.grandTotal), advanceDpAmount);

  return db.$transaction(async (tx) => {
    const existing = await tx.invoice.findMany({
      where: { shipmentId, status: { notIn: ["CANCELLED", "REVISED"] } },
      select: { id: true, status: true },
    });
    if (existing.some((invoice) => invoice.status !== "DRAFT")) {
      throw new Error("Invoice sudah final/berjalan, draft tidak dapat digenerate ulang.");
    }
    if (existing.length && !options.replaceDraft) throw new Error("Draft invoice untuk shipment ini sudah tersedia. Gunakan update draft.");
    if (existing.length) {
      await tx.invoice.deleteMany({ where: { id: { in: existing.map((invoice) => invoice.id) } } });
    }

    const invoices = [];
    for (const [index, group] of groups.entries()) {
      const draftNumber = `DRAFT/${now.getFullYear()}/${shipment.jobNumber}/${String(index + 1).padStart(2, "0")}`;
      const paidFromAdvanceDp = advanceDpAllocations[index] ?? 0;
      const outstandingAmount = roundMoney(group.grandTotal - paidFromAdvanceDp);
      const invoice = await tx.invoice.create({
        data: {
          draftNumber,
          type: group.type,
          companyId: company.id,
          shipmentId,
          billId: group.billId,
          clientId: shipment.clientId,
          invoiceDate: now,
          dueDate: addDays(now, shipment.client.paymentTermDays),
          subtotal: new Prisma.Decimal(group.subtotal),
          taxRate: new Prisma.Decimal(group.taxRate),
          taxAmount: new Prisma.Decimal(group.taxAmount),
          grandTotal: new Prisma.Decimal(group.grandTotal),
          amountPaid: new Prisma.Decimal(paidFromAdvanceDp),
          outstandingAmount: new Prisma.Decimal(outstandingAmount),
          amountInWords: terbilang(group.grandTotal),
          createdById: userId,
          items: {
            create: group.items.map((item) => ({
              chargeId: item.id,
              description: item.description || item.name,
              quantity: new Prisma.Decimal(item.quantity),
              unitPrice: new Prisma.Decimal(item.unitPrice),
              subtotal: new Prisma.Decimal(item.subtotal),
              taxAmount: new Prisma.Decimal(item.taxAmount),
              totalAmount: new Prisma.Decimal(item.totalAmount),
            })),
          },
        },
        include: { items: true },
      });
      invoices.push(invoice);
    }
    await tx.shipment.update({ where: { id: shipmentId }, data: { status: "INVOICED" } });
    await audit(
      {
        userId,
        module: "INVOICE",
        action: options.action ?? (existing.length ? "REGENERATE_DRAFT" : "GENERATE_DRAFT"),
        referenceId: shipmentId,
        newValue: { invoiceIds: invoices.map((invoice) => invoice.id), count: invoices.length, mode, advanceDpAmount },
      },
      tx,
    );
    return invoices;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function syncDraftInvoicesForShipment(shipmentId: string, userId: string) {
  const drafts = await db.invoice.findMany({
    where: { shipmentId, status: { notIn: ["CANCELLED", "REVISED"] } },
    select: { type: true, billId: true, status: true, shipment: { select: { shipmentDirection: true } } },
  });
  if (!drafts.length) return null;
  if (drafts.some((invoice) => invoice.status !== "DRAFT")) return null;

  const isOtherOrder = drafts[0]?.shipment.shipmentDirection === "LAIN_LAIN";
  const jasaDrafts = drafts.filter((invoice) => invoice.type === "JASA");
  const mode: InvoiceSplitMode = isOtherOrder || (jasaDrafts.length === 1 && !jasaDrafts[0]?.billId) ? "combine_jasa" : "split_by_bl";
  return generateDraftInvoices(shipmentId, userId, {
    mode,
    replaceDraft: true,
    action: "SYNC_DRAFT_AFTER_CHARGE_CHANGE",
  });
}

export async function finalizeInvoice(invoiceId: string, userId: string) {
  const finalized = await db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { shipment: true, client: true, payments: true } });
    if (!invoice) throw new Error("Invoice tidak ditemukan.");
    if (invoice.status !== "DRAFT") throw new Error("Hanya invoice Draft yang dapat difinalisasi.");
    const amountPaid = invoice.amountPaid.toNumber();
    const outstandingAmount = invoice.outstandingAmount.toNumber();
    const finalStatus: InvoiceStatus = amountPaid <= 0 ? "FINAL" : outstandingAmount <= 0 ? "PAID" : "PARTIAL_PAID";

    const date = new Date();
    const prefix = `${invoice.client.code}/${invoiceDirectionCode(invoice.shipment.shipmentDirection)}`;
    const number = await nextInvoiceNumber(tx, prefix, date);
    const result = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceNumber: number,
        status: finalStatus,
        approvedById: userId,
        approvedAt: date,
      },
    });
    if (amountPaid > 0 && !invoice.payments.length) {
      await tx.payment.create({
        data: {
          invoiceId,
          paymentDate: invoice.shipment.advanceDpDate || date,
          amount: new Prisma.Decimal(amountPaid),
          method: invoice.shipment.advanceDpMethod || "Transfer Bank",
          bankReference: invoice.shipment.advanceDpReference || undefined,
          notes: invoice.shipment.advanceDpNotes
            ? `DP awal shipment - ${invoice.shipment.advanceDpNotes}`
            : "DP awal shipment",
          createdById: userId,
        },
      });
    }
    await audit(
      {
        userId,
        module: "INVOICE",
        action: "FINALIZE",
        referenceId: invoiceId,
        newValue: { invoiceNumber: number, status: finalStatus, advanceDpApplied: amountPaid },
      },
      tx,
    );
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await generateInvoiceDocuments(finalized.id);
  return finalized;
}

async function nextInvoiceNumber(tx: Prisma.TransactionClient, prefix: string, date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const invoicePrefix = `${prefix}/${year}/${month}/`;
  const latest = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: invoicePrefix } },
    select: { invoiceNumber: true },
    orderBy: { invoiceNumber: "desc" },
  });
  const latestSequence = latest?.invoiceNumber ? Number(latest.invoiceNumber.split("/").at(-1)) || 0 : 0;
  return invoiceNumber(prefix, date, latestSequence + 1);
}

export async function recordPayment(
  invoiceId: string,
  userId: string,
  input: {
    paymentDate: Date;
    amount: number;
    method: string;
    bankReference?: string;
    proofFilePath?: string;
    notes?: string;
  },
) {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new Error("Invoice tidak ditemukan.");
    if (!["FINAL", "SENT", "PARTIAL_PAID", "OVERDUE"].includes(invoice.status)) {
      throw new Error("Invoice ini tidak dapat menerima pembayaran.");
    }
    if (input.amount <= 0) throw new Error("Nominal pembayaran harus lebih dari nol.");
    const outstanding = invoice.outstandingAmount.toNumber();
    if (input.amount > outstanding) throw new Error("Pembayaran melebihi sisa tagihan.");

    const newPaid = invoice.amountPaid.toNumber() + input.amount;
    const newOutstanding = invoice.grandTotal.toNumber() - newPaid;
    const status = newOutstanding === 0 ? "PAID" : "PARTIAL_PAID";
    const payment = await tx.payment.create({
      data: {
        invoiceId,
        paymentDate: input.paymentDate,
        amount: new Prisma.Decimal(input.amount),
        method: input.method,
        bankReference: input.bankReference,
        proofFilePath: input.proofFilePath,
        notes: input.notes,
        createdById: userId,
      },
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: new Prisma.Decimal(newPaid),
        outstandingAmount: new Prisma.Decimal(newOutstanding),
        status,
      },
    });
    await audit(
      {
        userId,
        module: "PAYMENT",
        action: "CREATE",
        referenceId: payment.id,
        newValue: { invoiceId, amount: input.amount, status },
      },
      tx,
    );
    return payment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function typePrefix(type: InvoiceType) {
  return type === "JASA" ? "JASA" : "REIM";
}
