import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), "storage");

async function saveUpload(file: FormDataEntryValue | null, prefix: string, allowed: string[]) {
  if (!(file instanceof File) || !file.size) return null;
  if (!allowed.includes(file.type)) throw new Error(`Format ${prefix} tidak didukung.`);
  const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "bin";
  const root = path.join(storageRoot, "company");
  await fs.mkdir(root, { recursive: true });
  const target = path.join(root, `${prefix}-${Date.now()}.${ext}`);
  await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));
  return target;
}

export default async function SettingsPage() {
  const [company, taxes] = await Promise.all([
    db.company.findFirst({ include: { bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } } }),
    db.taxRate.findMany({ orderBy: { effectiveDate: "desc" } }),
  ]);

  async function saveCompany(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    const data = {
      name: String(form.get("name")),
      address: String(form.get("address")),
      npwp: String(form.get("npwp") || "") || null,
      phone: String(form.get("phone") || "") || null,
      email: String(form.get("email") || "") || null,
      signerName: String(form.get("signerName") || "") || null,
      signerTitle: String(form.get("signerTitle") || "") || null,
      closingGreeting: String(form.get("closingGreeting") || "") || null,
      bankName: company?.bankName || null,
      bankAccountNumber: company?.bankAccountNumber || null,
      bankAccountName: company?.bankAccountName || null,
    };
    const savedCompany = company
      ? await db.company.update({ where: { id: company.id }, data })
      : await db.company.create({ data });
    const [logoPath, signaturePath] = await Promise.all([
      saveUpload(form.get("logo"), "logo", ["image/png", "image/jpeg"]),
      saveUpload(form.get("signature"), "signature", ["image/png"]),
    ]);
    if (logoPath || signaturePath) {
      await db.company.update({
        where: { id: savedCompany.id },
        data: {
          ...(logoPath ? { logoPath } : {}),
          ...(signaturePath ? { signaturePath } : {}),
        },
      });
    }
    revalidatePath("/settings");
  }

  async function addBankAccount(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    const currentCompany = await db.company.findFirst();
    if (!currentCompany) return;
    const existingCount = await db.companyBankAccount.count({ where: { companyId: currentCompany.id } });
    const isPrimary = String(form.get("isPrimary") || "") === "on" || existingCount === 0;
    await db.$transaction(async (tx) => {
      if (isPrimary) await tx.companyBankAccount.updateMany({ where: { companyId: currentCompany.id }, data: { isPrimary: false } });
      await tx.companyBankAccount.create({
        data: {
          companyId: currentCompany.id,
          bankName: String(form.get("bankName")),
          accountNumber: String(form.get("accountNumber")),
          accountName: String(form.get("accountName")),
          isPrimary,
        },
      });
    });
    revalidatePath("/settings");
  }

  async function setBankAccountStatus(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    await db.companyBankAccount.update({
      where: { id: String(form.get("id")) },
      data: { status: String(form.get("status")) === "ACTIVE" ? "ACTIVE" : "INACTIVE" },
    });
    revalidatePath("/settings");
  }

  async function setPrimaryBankAccount(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    const id = String(form.get("id"));
    const account = await db.companyBankAccount.findUnique({ where: { id } });
    if (!account) return;
    await db.$transaction(async (tx) => {
      await tx.companyBankAccount.updateMany({ where: { companyId: account.companyId }, data: { isPrimary: false } });
      await tx.companyBankAccount.update({ where: { id }, data: { isPrimary: true, status: "ACTIVE" } });
    });
    revalidatePath("/settings");
  }

  async function deleteBankAccount(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    await db.companyBankAccount.delete({ where: { id: String(form.get("id")) } });
    revalidatePath("/settings");
  }

  async function addTax(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    await db.$transaction(async (tx) => {
      await tx.taxRate.updateMany({ data: { active: false } });
      await tx.taxRate.create({
        data: {
          name: "PPN",
          rate: new Prisma.Decimal(Number(form.get("rate"))),
          effectiveDate: new Date(String(form.get("effectiveDate"))),
          active: true,
        },
      });
    });
    revalidatePath("/settings");
  }

  return <AppShell title="Settings">
    <PageHead title="Konfigurasi sistem" description="Atur identitas perusahaan, beberapa rekening pembayaran, penandatangan, dan tarif pajak." />

    <div className="grid-equal">
      <form action={saveCompany} className="card" encType="multipart/form-data">
        <div className="card-head"><h3>Identitas perusahaan</h3></div>
        <div className="card-body form-stack">
          <div className="brand-preview">
            {company?.logoPath ? <img src="/api/company-assets/logo" alt="Logo perusahaan" /> : <span className="brand-mark">LF</span>}
            <div>
              <strong>{company?.name || "Nama perusahaan"}</strong>
              <small>Logo akan tampil di samping nama perusahaan dan PDF invoice.</small>
            </div>
          </div>
          <div className="grid-equal">
            <div className="field">
              <label>Upload logo perusahaan</label>
              <input name="logo" type="file" accept=".png,.jpg,.jpeg" />
              <small>Format PNG/JPG. Disarankan logo horizontal atau square.</small>
            </div>
            <div className="field">
              <label>Upload TTD</label>
              <input name="signature" type="file" accept=".png" />
              <small>Format PNG transparan agar rapi di salam penutup invoice.</small>
            </div>
          </div>
          <div className="field"><label>Nama perusahaan</label><input name="name" required defaultValue={company?.name}/></div>
          <div className="field"><label>Alamat</label><textarea name="address" rows={3} required defaultValue={company?.address}/></div>
          <div className="grid-equal">
            <div className="field"><label>NPWP</label><input name="npwp" defaultValue={company?.npwp || ""}/></div>
            <div className="field"><label>Telepon</label><input name="phone" defaultValue={company?.phone || ""}/></div>
          </div>
          <div className="field"><label>Email</label><input name="email" type="email" defaultValue={company?.email || ""}/></div>
          <div className="grid-equal">
            <div className="field"><label>Penandatangan</label><input name="signerName" defaultValue={company?.signerName || ""}/></div>
            <div className="field"><label>Jabatan</label><input name="signerTitle" defaultValue={company?.signerTitle || ""}/></div>
          </div>
          <div className="field">
            <label>Salam penutup</label>
            <input name="closingGreeting" defaultValue={company?.closingGreeting || "Hormat kami"} placeholder="Hormat kami" />
            <small>Teks ini tampil di bagian tanda tangan invoice dan PDF.</small>
          </div>
          <button className="btn btn-primary">Simpan identitas</button>
        </div>
      </form>

      <div>
        <form action={addTax} className="card">
          <div className="card-head"><h3>Tarif pajak aktif</h3></div>
          <div className="card-body form-stack">
            <div className="grid-equal">
              <div className="field"><label>Tarif PPN (%)</label><input name="rate" type="number" min="0" max="100" step=".01" required /></div>
              <div className="field"><label>Tanggal berlaku</label><input name="effectiveDate" type="date" required /></div>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Tarif baru hanya berlaku untuk biaya baru. Invoice lama tetap memakai snapshot tarif sebelumnya.</p>
            <button className="btn btn-primary">Aktifkan tarif</button>
          </div>
        </form>
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head"><h3>Riwayat tarif</h3></div>
          <div className="card-body summary-stack">
            {taxes.map((tax) => <div className="summary-line" key={tax.id}><span>{tax.effectiveDate.toLocaleDateString("id-ID")}</span><strong>{tax.rate.toString()}% {tax.active && "· Aktif"}</strong></div>)}
            {!taxes.length && <div className="empty">Tarif belum dikonfigurasi.</div>}
          </div>
        </div>
      </div>
    </div>

    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-head"><h3>Rekening pembayaran invoice</h3></div>
      <div className="card-body form-stack">
        <form action={addBankAccount} className="grid-equal">
          <div className="field"><label>Bank</label><input name="bankName" required placeholder="BCA" /></div>
          <div className="field"><label>Nomor rekening</label><input name="accountNumber" required placeholder="1234567890" /></div>
          <div className="field"><label>Atas nama</label><input name="accountName" required placeholder="PT ..." /></div>
          <label className="check-row"><input name="isPrimary" type="checkbox" /> Jadikan rekening utama</label>
          <button className="btn btn-primary">Tambah rekening</button>
        </form>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Bank</th><th>No. rekening</th><th>Atas nama</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {company?.bankAccounts.map((account) => <tr key={account.id}>
                <td>{account.bankName} {account.isPrimary && <span className="badge blue">Utama</span>}</td>
                <td>{account.accountNumber}</td>
                <td>{account.accountName}</td>
                <td><span className={`badge ${account.status === "ACTIVE" ? "green" : "gray"}`}>{account.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</span></td>
                <td><div className="actions compact-actions">
                  <form action={setBankAccountStatus}>
                    <input type="hidden" name="id" value={account.id} />
                    <input type="hidden" name="status" value={account.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                    <button className="btn btn-secondary">{account.status === "ACTIVE" ? "Disable" : "Aktifkan"}</button>
                  </form>
                  {!account.isPrimary && <form action={setPrimaryBankAccount}>
                    <input type="hidden" name="id" value={account.id} />
                    <button className="btn btn-secondary">Jadikan utama</button>
                  </form>}
                  <form action={deleteBankAccount}>
                    <input type="hidden" name="id" value={account.id} />
                    <button className="btn btn-danger">Delete</button>
                  </form>
                </div></td>
              </tr>)}
              {!company?.bankAccounts.length && <tr><td colSpan={5} className="empty">Belum ada rekening. Tambahkan rekening untuk ditampilkan di invoice.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </AppShell>;
}
