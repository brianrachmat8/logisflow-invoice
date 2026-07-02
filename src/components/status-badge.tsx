const colors: Record<string, string> = {
  DRAFT: "gray",
  READY_TO_GENERATE: "blue",
  INVOICED: "blue",
  COMPLETED: "green",
  FINAL: "blue",
  SENT: "orange",
  PARTIAL_PAID: "orange",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "red",
  REVISED: "gray",
};

const labels: Record<string, string> = {
  PARTIAL_PAID: "DP",
  PAID: "LUNAS",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${colors[status] ?? "gray"}`}>{labels[status] ?? status.replaceAll("_", " ")}</span>;
}
