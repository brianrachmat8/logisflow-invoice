import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), "storage");
const MAX_COMPANIES = 3;

type SettingsSearchParams = { companyId?: string };

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

async function redirectToCompany(companyId: string) {
  revalidatePath("/settings");
  redirect(`/settings?companyId=${companyId}`);
}

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<SettingsSearchParams> | SettingsSearchParams }) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const [companies, taxes] = await Promise.all([
    db.company.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: { bankAccounts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
    }),
    db.taxRate.findMany({ orderBy: { effectiveDate: "desc" } }),
  ]);
  const isCreatingNew = resolvedSearchParams.companyId === "new" || companies.length === 0;
  const selectedCompany = isCreatingNew
    ? null
    : companies.find((item) => item.id === resolvedSearchParams.companyId) ?? companies[0] ?? null;
  const canAddCompany = companies.length < MAX_COMPANIES;
  const selectedCompanyId = selectedCompany?.id ?? "";

  async function saveCompany(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;

    const companyId = String(form.get("companyId") || "");
    const shouldBeDefault = String(form.get("isDefault") || "") === "on";
    const data = {
      name: String(form.get("name") || "").trim(),
      address: String(form.get("address") || "").trim(),
      npwp: String(form.get("npwp") || "") || null,
      phone: String(form.get("phone") || "") || null,
      email: String(form.get("email") || "") || null,
      signerName: String(form.get("signerName") || "") || null,
      signerTitle: String(form.get("signerTitle") || "") || null,
      closingGreeting: String(form.get("closingGreeting") || "") || null,
    };
    if (!data.name || !data.address) throw new Error("Nama dan alamat perusahaan wajib diisi.");

    const savedCompany = await db.$transaction(async (tx) => {
      const companyCount = await tx.company.count();
      const existingCompany = companyId ? await tx.company.findUnique({ where: { id: companyId } }) : null;
      if (companyId && !existingCompany) throw new Error("Perusahaan tidak ditemukan.");
      if (!companyId && companyCount >= MAX_COMPANIES) throw new Error("Maksimal 3 perusahaan dapat disimpan.");

      const result = existingCompany
        ? await tx.company.update({ where: { id: existingCompany.id }, data })
        : await tx.company.create({ data: { ...data, isDefault: companyCount === 0 } });

      if (shouldBeDefault || companyCount === 0) {
        await tx.company.updateMany({ where: { id: { not: result.id } }, data: { isDefault: false } });
        await tx.company.update({ where: { id: result.id }, data: { isDefault: true } });
      }

      return result;
    });

    const [logoPath, signaturePath] = await Promise.all([
      saveUpload(form.get("logo"), `logo-${savedCompany.id}`, ["image/png", "image/jpeg"]),
      saveUpload(form.get("signature"), `signature-${savedCompany.id}`, ["image/png"]),
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
    await redirectToCompany(savedCompany.id);
  }

  async function setDefaultCompany(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    const companyId = String(form.get("companyId") || "");
    if (!companyId) return;
    await db.$transaction(async (tx) => {
      await tx.company.updateMany({ data: { isDefault: false } });
      await tx.company.update({ where: { id: companyId }, data: { isDefault: true } });
    });
    await redirectToCompany(companyId);
  }

  async function addBankAccount(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    const companyId = String(form.get("companyId") || "");
    if (!companyId) return;
    const currentCompany = await db.company.findUnique({ where: { id: companyId } });
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
    await redirectToCompany(currentCompany.id);
  }

  async function setBankAccountStatus(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    const id = String(form.get("id"));
    const account = await db.companyBankAccount.update({
      where: { id },
      data: { status: String(form.get("status")) === "ACTIVE" ? "ACTIVE" : "INACTIVE" },
    });
    await redirectToCompany(account.companyId);
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
    await redirectToCompany(account.companyId);
  }

  async function deleteBankAccount(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    const id = String(form.get("id"));
    const account = await db.companyBankAccount.findUnique({ where: { id } });
    if (!account) return;
    await db.companyBankAccount.delete({ where: { id } });
    await redirectToCompany(account.companyId);
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
    <PageHead title="Konfigurasi sistem" description="Atur beberapa identitas perusahaan, rekening pembayaran, penandatangan, dan tarif pajak." />

    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-head"><h3>Daftar perusahaan</h3></div>
      <div className="card-body form-stack">
        <div className="actions" style={{ alignItems: "stretch", flexWrap: "wrap" }}>
          {companies.map((item) => <a
            key={item.id}
            href={`/settings?companyId=${item.id}`}
            className={`btn ${selectedCompany?.id === item.id ? "btn-primary" : "btn-secondary"}`}
            style={{ justifyContent: "space-between", minWidth: 220 }}
          >
            <span>{item.name}</span>
            {item.isDefault && <span className="badge green">Default</span>}
          </a>)}
          {canAddCompany && <a href="/settings?companyId=new" className="btn btn-secondary">+ Tambah perusahaan</a>}
        </div>
        <small style={{ color: "var(--muted)" }}>{companies.length}/{MAX_COMPANIES} perusahaan tersimpan. Invoice baru memakai perusahaan yang ditandai Default.</small>
      </div>
    </div>

    <div className="grid-equal">
      <form action={saveCompany} className="card" encType="multipart/form-data">
        <input type="hidden" name="companyId" value={selectedCompanyId} />
        <div className="card-head"><h3>{selectedCompany ? "Edit identitas perusahaan" : "Tambah perusahaan"}</h3></div>
        <div className="card-body form-stack">
          <div className="brand-preview">
            {selectedCompany?.logoPath ? <img src={`/api/company-assets/logo?companyId=${selectedCompany.id}`} alt="Logo perusahaan" /> : <span className="brand-mark">LF</span>}
            <div>
              <strong>{selectedCompany?.name || "Nama perusahaan"}</strong>
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
          <div className="field"><label>Nama perusahaan</label><input name="name" required defaultValue={selectedCompany?.name}/></div>
          <div className="field"><label>Alamat</label><textarea name="address" rows={3} required defaultValue={selectedCompany?.address}/></div>
          <div className="grid-equal">
            <div className="field"><label>NPWP</label><input name="npwp" defaultValue={selectedCompany?.npwp || ""}/></div>
            <div className="field"><label>Telepon</label><input name="phone" defaultValue={selectedCompany?.phone || ""}/></div>
          </div>
          <div className="field"><label>Email</label><input name="email" type="email" defaultValue={selectedCompany?.email || ""}/></div>
          <div className="grid-equal">
            <div className="field"><label>Penandatangan</label><input name="signerName" defaultValue={selectedCompany?.signerName || ""}/></div>
            <div className="field"><label>Jabatan</label><input name="signerTitle" defaultValue={selectedCompany?.signerTitle || ""}/></div>
          </div>
          <div className="field">
            <label>Salam penutup</label>
            <input name="closingGreeting" defaultValue={selectedCompany?.closingGreeting || "Hormat kami"} placeholder="Hormat kami" />
            <small>Teks ini tampil di bagian tanda tangan invoice dan PDF.</small>
          </div>
          <label className="check-row"><input name="isDefault" type="checkbox" defaultChecked={selectedCompany?.isDefault || !companies.length} /> Jadikan perusahaan default</label>
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
        {selectedCompany && !selectedCompany.isDefault && <form action={setDefaultCompany} className="card" style={{ marginTop: 20 }}>
          <input type="hidden" name="companyId" value={selectedCompany.id} />
          <div className="card-head"><h3>Perusahaan default</h3></div>
          <div className="card-body form-stack">
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Jadikan perusahaan ini sebagai identitas yang dipakai saat membuat invoice baru.</p>
            <button className="btn btn-secondary">Jadikan default</button>
          </div>
        </form>}
      </div>
    </div>

    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-head"><h3>Rekening pembayaran invoice</h3></div>
      <div className="card-body form-stack">
        {selectedCompany ? <>
          <form action={addBankAccount} className="grid-equal">
            <input type="hidden" name="companyId" value={selectedCompany.id} />
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
                {selectedCompany.bankAccounts.map((account) => <tr key={account.id}>
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
                {!selectedCompany.bankAccounts.length && <tr><td colSpan={5} className="empty">Belum ada rekening. Tambahkan rekening untuk ditampilkan di invoice perusahaan ini.</td></tr>}
              </tbody>
            </table>
          </div>
        </> : <div className="empty">Simpan perusahaan terlebih dahulu, lalu tambahkan rekening pembayarannya.</div>}
      </div>
    </div>
  </AppShell>;
}
