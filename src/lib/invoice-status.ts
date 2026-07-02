type MoneyLike = number | string | { toNumber: () => number } | null | undefined;

type InvoiceStatusInput = {
  status: string;
  amountPaid?: MoneyLike;
  outstandingAmount?: MoneyLike;
  dueDate?: Date | string | null;
};

function moneyValue(value: MoneyLike) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toNumber" in value) return value.toNumber();
  return 0;
}

function isPastDue(dueDate?: Date | string | null) {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function invoiceDisplayStatus(invoice: InvoiceStatusInput) {
  if (["DRAFT", "CANCELLED", "REVISED"].includes(invoice.status)) return invoice.status;

  const amountPaid = moneyValue(invoice.amountPaid);
  const outstandingAmount = moneyValue(invoice.outstandingAmount);

  if (amountPaid > 0 && outstandingAmount <= 0) return "PAID";
  if (amountPaid > 0 && outstandingAmount > 0) return "PARTIAL_PAID";
  if (outstandingAmount > 0 && isPastDue(invoice.dueDate)) return "OVERDUE";

  return invoice.status;
}
