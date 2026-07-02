import { ok, fail, requireUser } from "@/lib/api";
import { allocateAdvanceDp, type InvoiceSplitMode, roundMoney, terbilang } from "@/lib/business";
import { previewShipmentInvoice } from "@/lib/invoice-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const mode: InvoiceSplitMode = body.mode === "combine_jasa" ? "combine_jasa" : "split_by_bl";
    const { shipment, split } = await previewShipmentInvoice(id, mode);
    const groups = [...split.jasa, ...split.reimbursement];
    const totalGrand = groups.reduce((sum, group) => sum + group.grandTotal, 0);
    const advanceDpAmount = shipment.advanceDpAmount.toNumber();
    if (advanceDpAmount > totalGrand) {
      return fail("DP/lunas awal lebih besar dari total biaya yang sudah diinput. Koreksi DP tersimpan sebelum generate invoice.", 422);
    }

    const allocations = allocateAdvanceDp(groups.map((group) => group.grandTotal), advanceDpAmount);
    return ok({
      shipment: {
        jobNumber: shipment.jobNumber,
        direction: shipment.shipmentDirection,
        reference: shipment.doNumber,
      },
      totalGrand,
      advanceDpAmount,
      invoices: groups.map((group, index) => {
        const amountPaid = allocations[index] ?? 0;
        const outstandingAmount = roundMoney(group.grandTotal - amountPaid);
        return {
          key: `${group.type}-${group.billId || "combined"}-${index}`,
          type: group.type,
          billNumber: group.billNumber || null,
          reference: group.billNumber || (shipment.shipmentDirection === "LAIN_LAIN" ? shipment.doNumber : "Gabungan"),
          itemCount: group.items.length,
          subtotal: group.subtotal,
          taxAmount: group.taxAmount,
          grandTotal: group.grandTotal,
          amountPaid,
          outstandingAmount,
          amountInWords: terbilang(amountPaid > 0 ? outstandingAmount : group.grandTotal),
          items: group.items.map((item) => ({
            id: item.id,
            description: item.description || item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
          })),
        };
      }),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Preview invoice gagal.", 422);
  }
}
