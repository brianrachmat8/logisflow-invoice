import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { db } from "@/lib/db";
import { numberValue, rupiah } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const grouped = await db.invoice.groupBy({ by: ["type"], where: { status: { not: "CANCELLED" } }, _count: true, _sum: { grandTotal: true, taxAmount: true, outstandingAmount: true } });
  return <AppShell title="Laporan"><PageHead title="Laporan invoice" description="Ringkasan invoice, pajak, dan outstanding yang siap diekspor.">
    <a href="/api/reports/invoices?format=xlsx" className="btn btn-primary"><Download size={16}/> Export Excel</a>
  </PageHead>
    <div className="card"><div className="filters"><select className="filter-input"><option>Laporan invoice per tipe</option><option>Laporan PPN</option><option>Outstanding piutang</option></select><input type="date" className="filter-input"/><input type="date" className="filter-input"/></div>
      <div className="table-wrap"><table><thead><tr><th>Tipe invoice</th><th>Jumlah</th><th>Total tagihan</th><th>Total PPN</th><th>Outstanding</th></tr></thead><tbody>
        {grouped.map((item) => <tr key={item.type}><td><span className={`badge ${item.type === "JASA" ? "blue" : item.type === "LAIN_LAIN" ? "green" : "orange"}`}>{item.type === "LAIN_LAIN" ? "LAIN-LAIN" : item.type}</span></td><td>{item._count}</td><td className="money">{rupiah.format(numberValue(item._sum.grandTotal))}</td><td>{rupiah.format(numberValue(item._sum.taxAmount))}</td><td>{rupiah.format(numberValue(item._sum.outstandingAmount))}</td></tr>)}
        {!grouped.length && <tr><td colSpan={5} className="empty">Belum ada data laporan.</td></tr>}</tbody></table></div>
    </div>
  </AppShell>;
}