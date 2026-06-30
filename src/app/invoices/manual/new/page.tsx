import { redirect } from "next/navigation";
import { addDays } from "date-fns";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { db } from "@/lib/db";
import { createManualInvoice } from "@/lib/invoice-service";

export const dynamic = "force-dynamic";

export default async function NewManualInvoicePage() {
  const [clients, activeTax] = await Promise.all([
    db.client.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    db.taxRate.findFirst({ where: { active: true }, orderBy: { effectiveDate: "desc" } }),
  ]);
  const today = new Date();
  const todayValue = today.toISOString().slice(0, 10);
  const dueValue = addDays(today, 30).toISOString().slice(0, 10);
  const defaultTax = activeTax?.rate.toString() ?? "0";

  async function createInvoice(form: FormData) {
    "use server";
    const session = await auth();
    if (!session?.user || !["SUPER_ADMIN", "ADMIN_INVOICING", "DIRECTOR"].includes(session.user.role)) return;
    const descriptions = form.getAll("description").map(String);
    const units = form.getAll("unit").map(String);
    const quantities = form.getAll("quantity").map((value) => Number(value));
    const unitPrices = form.getAll("unitPrice").map((value) => Number(value));
    const items = descriptions.map((description, index) => ({
      description,
      unit: units[index] || "Unit",
      quantity: quantities[index] || 0,
      unitPrice: unitPrices[index] || 0,
    }));
    const invoice = await createManualInvoice({
      clientId: String(form.get("clientId")),
      title: String(form.get("title")),
      reference: String(form.get("reference") || ""),
      notes: String(form.get("notes") || ""),
      invoiceDate: new Date(String(form.get("invoiceDate"))),
      dueDate: new Date(String(form.get("dueDate"))),
      taxRate: Number(form.get("taxRate") || 0),
      items,
    }, session.user.id);
    redirect(`/invoices/${invoice.id}`);
  }

  return <AppShell title="Invoice Lain-lain">
    <PageHead title="Buat invoice lain-lain" description="Invoice manual untuk pekerjaan non-trucking seperti handling, dokumen, sewa alat, atau jasa tambahan lain." />
    <form action={createInvoice} className="card">
      <div className="card-head"><h3>Informasi invoice</h3></div>
      <div className="card-body form-stack">
        <div className="grid-equal">
          <div className="field">
            <label>Klien</label>
            <select name="clientId" required>
              <option value="">Pilih klien</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Judul pekerjaan</label><input name="title" required placeholder="Jasa handling dokumen" /></div>
        </div>
        <div className="grid-equal">
          <div className="field"><label>Referensi</label><input name="reference" placeholder="PO / referensi internal" /></div>
          <div className="field"><label>PPN (%)</label><input name="taxRate" type="number" min="0" max="100" step=".01" defaultValue={defaultTax} required /></div>
        </div>
        <div className="grid-equal">
          <div className="field"><label>Tanggal invoice</label><input name="invoiceDate" type="date" defaultValue={todayValue} required /></div>
          <div className="field"><label>Jatuh tempo</label><input name="dueDate" type="date" defaultValue={dueValue} required /></div>
        </div>
        <div className="field"><label>Catatan</label><textarea name="notes" rows={3} placeholder="Catatan opsional untuk internal atau keterangan pekerjaan" /></div>
      </div>

      <div className="card-head"><h3>Item pekerjaan</h3></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Uraian</th><th>Satuan</th><th>Qty</th><th>Harga satuan</th></tr></thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, index) => <tr key={index}>
              <td><input name="description" placeholder={index === 0 ? "Jasa handling dokumen" : ""} required={index === 0} /></td>
              <td><input name="unit" placeholder="Unit" defaultValue={index === 0 ? "Unit" : ""} /></td>
              <td><input name="quantity" type="number" min="0" step=".01" defaultValue={index === 0 ? "1" : ""} required={index === 0} /></td>
              <td><input name="unitPrice" type="number" min="0" step="1" placeholder="0" required={index === 0} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="card-body">
        <button className="btn btn-primary">Buat draft invoice</button>
      </div>
    </form>
  </AppShell>;
}
