export type ChargeInput = {
  id?: string;
  billId?: string | null;
  billNumber?: string | null;
  name: string;
  description?: string | null;
  category: "JASA" | "REIMBURSEMENT";
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export type InvoiceSplitMode = "split_by_bl" | "combine_jasa";

export function calculateCharge(input: Pick<ChargeInput, "quantity" | "unitPrice" | "category" | "taxRate">) {
  const subtotal = roundMoney(input.quantity * input.unitPrice);
  const taxRate = input.category === "JASA" ? input.taxRate : 0;
  const taxAmount = roundMoney(subtotal * (taxRate / 100));
  return { subtotal, taxRate, taxAmount, totalAmount: subtotal + taxAmount };
}

export function previewSplit(charges: ChargeInput[], mode: InvoiceSplitMode = "split_by_bl") {
  const jasa = new Map<string, ChargeInput[]>();
  const combinedJasa: ChargeInput[] = [];
  const reimbursement: ChargeInput[] = [];
  for (const charge of charges) {
    if (charge.category === "JASA") {
      if (mode === "combine_jasa") {
        combinedJasa.push(charge);
        continue;
      }
      if (!charge.billId) throw new Error(`Biaya JASA "${charge.name}" belum terkait B/L.`);
      const group = jasa.get(charge.billId) ?? [];
      group.push(charge);
      jasa.set(charge.billId, group);
    } else {
      reimbursement.push(charge);
    }
  }
  return {
    jasa: mode === "combine_jasa"
      ? (combinedJasa.length ? [summarizeGroup("JASA", null, combinedJasa)] : [])
      : [...jasa.entries()].map(([billId, items]) => summarizeGroup("JASA", billId, items)),
    reimbursement: reimbursement.length
      ? [summarizeGroup("REIMBURSEMENT", null, reimbursement)]
      : [],
  };
}

function summarizeGroup(type: "JASA" | "REIMBURSEMENT", billId: string | null, items: ChargeInput[]) {
  const calculated = items.map((item) => ({ ...item, ...calculateCharge(item) }));
  const subtotal = calculated.reduce((sum, item) => sum + item.subtotal, 0);
  const taxAmount = calculated.reduce((sum, item) => sum + item.taxAmount, 0);
  return {
    type,
    billId,
    billNumber: items[0]?.billNumber ?? null,
    items: calculated,
    subtotal,
    taxRate: type === "JASA" ? items[0]?.taxRate ?? 0 : 0,
    taxAmount,
    grandTotal: subtotal + taxAmount,
  };
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function agingBucket(dueDate: Date, now = new Date()) {
  const day = 86_400_000;
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((today - due) / day);
  if (days < 0) return { key: "NOT_DUE", label: "Belum jatuh tempo", days };
  if (days === 0) return { key: "DUE_TODAY", label: "Jatuh tempo hari ini", days };
  if (days <= 7) return { key: "OVERDUE_1_7", label: "Terlambat 1-7 hari", days };
  if (days <= 14) return { key: "OVERDUE_8_14", label: "Terlambat 8-14 hari", days };
  if (days <= 30) return { key: "OVERDUE_15_30", label: "Terlambat 15-30 hari", days };
  return { key: "OVERDUE_30_PLUS", label: "Terlambat >30 hari", days };
}

const SATUAN = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

function spell(value: number): string {
  if (value < 12) return SATUAN[value];
  if (value < 20) return `${spell(value - 10)} Belas`;
  if (value < 100) return `${spell(Math.floor(value / 10))} Puluh ${spell(value % 10)}`.trim();
  if (value < 200) return `Seratus ${spell(value - 100)}`.trim();
  if (value < 1_000) return `${spell(Math.floor(value / 100))} Ratus ${spell(value % 100)}`.trim();
  if (value < 2_000) return `Seribu ${spell(value - 1_000)}`.trim();
  if (value < 1_000_000) return `${spell(Math.floor(value / 1_000))} Ribu ${spell(value % 1_000)}`.trim();
  if (value < 1_000_000_000) return `${spell(Math.floor(value / 1_000_000))} Juta ${spell(value % 1_000_000)}`.trim();
  if (value < 1_000_000_000_000) return `${spell(Math.floor(value / 1_000_000_000))} Miliar ${spell(value % 1_000_000_000)}`.trim();
  return `${spell(Math.floor(value / 1_000_000_000_000))} Triliun ${spell(value % 1_000_000_000_000)}`.trim();
}

export function terbilang(value: number) {
  if (value === 0) return "Nol Rupiah";
  return `${spell(Math.floor(Math.abs(value))).replace(/\s+/g, " ").trim()} Rupiah`;
}

export function invoiceNumber(type: "JASA" | "REIMBURSEMENT", date: Date, sequence: number) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `INV/${type === "JASA" ? "JASA" : "REIM"}/${year}/${month}/${String(sequence).padStart(4, "0")}`;
}
