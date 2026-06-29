import { Fragment } from "react";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const canManageMaster = ["SUPER_ADMIN", "ADMIN_INVOICING"];

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function statusBadge(status: "ACTIVE" | "INACTIVE") {
  return <span className={`badge ${status === "ACTIVE" ? "green" : "gray"}`}>{status === "ACTIVE" ? "Aktif" : "Nonaktif"}</span>;
}

async function ensureMasterAccess() {
  const session = await auth();
  if (!session?.user || !canManageMaster.includes(session.user.role)) return null;
  return session;
}

async function addClient(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const client = await db.client.create({
    data: {
      code: clean(form.get("code")).toUpperCase(),
      name: clean(form.get("name")),
      address: clean(form.get("address")),
      paymentTermDays: Number(form.get("paymentTermDays") || 30),
      email: clean(form.get("email")) || null,
      picName: clean(form.get("picName")) || null,
    },
  });
  await audit({
    userId: session.user.id,
    module: "MASTER_CLIENT",
    action: "CREATE",
    referenceId: client.id,
    newValue: { code: client.code, name: client.name },
  });
  revalidatePath("/master/clients");
}

async function updateClient(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const id = clean(form.get("id"));
  const oldValue = await db.client.findUnique({ where: { id } });
  if (!oldValue) return;

  const client = await db.client.update({
    where: { id },
    data: {
      code: clean(form.get("code")).toUpperCase(),
      name: clean(form.get("name")),
      address: clean(form.get("address")),
      paymentTermDays: Number(form.get("paymentTermDays") || 30),
      email: clean(form.get("email")) || null,
      picName: clean(form.get("picName")) || null,
    },
  });
  await audit({
    userId: session.user.id,
    module: "MASTER_CLIENT",
    action: "UPDATE",
    referenceId: client.id,
    oldValue: { code: oldValue.code, name: oldValue.name },
    newValue: { code: client.code, name: client.name },
  });
  revalidatePath("/master/clients");
}

async function setClientStatus(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const id = clean(form.get("id"));
  const status = clean(form.get("status")) === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  const client = await db.client.update({ where: { id }, data: { status } });
  await audit({
    userId: session.user.id,
    module: "MASTER_CLIENT",
    action: status === "ACTIVE" ? "ENABLE" : "DISABLE",
    referenceId: client.id,
    newValue: { status: client.status },
  });
  revalidatePath("/master/clients");
}

async function deleteClient(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const id = clean(form.get("id"));
  const related = await db.client.findUnique({
    where: { id },
    select: { _count: { select: { shipments: true, invoices: true } } },
  });
  if (!related) return;

  if (related._count.shipments > 0 || related._count.invoices > 0) {
    const client = await db.client.update({ where: { id }, data: { status: "INACTIVE" } });
    await audit({
      userId: session.user.id,
      module: "MASTER_CLIENT",
      action: "DISABLE_INSTEAD_OF_DELETE",
      referenceId: client.id,
      newValue: { reason: "Klien sudah dipakai shipment/invoice" },
    });
  } else {
    await db.client.delete({ where: { id } });
    await audit({ userId: session.user.id, module: "MASTER_CLIENT", action: "DELETE", referenceId: id });
  }
  revalidatePath("/master/clients");
}

async function addCarrier(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const code = clean(form.get("code")).toUpperCase();
  const name = clean(form.get("name"));
  if (!code || !name) return;

  const carrier = await db.carrier.create({ data: { code, name } });
  await audit({
    userId: session.user.id,
    module: "MASTER_CARRIER",
    action: "CREATE",
    referenceId: carrier.id,
    newValue: { code: carrier.code, name: carrier.name },
  });
  revalidatePath("/master/clients");
}

async function updateCarrier(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const id = clean(form.get("id"));
  const oldValue = await db.carrier.findUnique({ where: { id } });
  if (!oldValue) return;

  const carrier = await db.carrier.update({
    where: { id },
    data: { code: clean(form.get("code")).toUpperCase(), name: clean(form.get("name")) },
  });
  await audit({
    userId: session.user.id,
    module: "MASTER_CARRIER",
    action: "UPDATE",
    referenceId: carrier.id,
    oldValue: { code: oldValue.code, name: oldValue.name },
    newValue: { code: carrier.code, name: carrier.name },
  });
  revalidatePath("/master/clients");
}

async function setCarrierStatus(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const id = clean(form.get("id"));
  const status = clean(form.get("status")) === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  const carrier = await db.carrier.update({ where: { id }, data: { status } });
  await audit({
    userId: session.user.id,
    module: "MASTER_CARRIER",
    action: status === "ACTIVE" ? "ENABLE" : "DISABLE",
    referenceId: carrier.id,
    newValue: { status: carrier.status },
  });
  revalidatePath("/master/clients");
}

async function deleteCarrier(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const id = clean(form.get("id"));
  const related = await db.carrier.findUnique({
    where: { id },
    select: { _count: { select: { shipments: true } } },
  });
  if (!related) return;

  if (related._count.shipments > 0) {
    const carrier = await db.carrier.update({ where: { id }, data: { status: "INACTIVE" } });
    await audit({
      userId: session.user.id,
      module: "MASTER_CARRIER",
      action: "DISABLE_INSTEAD_OF_DELETE",
      referenceId: carrier.id,
      newValue: { reason: "Carrier sudah dipakai shipment" },
    });
  } else {
    await db.carrier.delete({ where: { id } });
    await audit({ userId: session.user.id, module: "MASTER_CARRIER", action: "DELETE", referenceId: id });
  }
  revalidatePath("/master/clients");
}

async function addFieldTeam(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const team = await db.fieldTeam.create({
    data: {
      name: clean(form.get("name")),
      picName: clean(form.get("picName")) || null,
      phone: clean(form.get("phone")) || null,
    },
  });
  await audit({
    userId: session.user.id,
    module: "MASTER_FIELD_TEAM",
    action: "CREATE",
    referenceId: team.id,
    newValue: { name: team.name, picName: team.picName },
  });
  revalidatePath("/master/clients");
}

async function updateFieldTeam(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const id = clean(form.get("id"));
  const oldValue = await db.fieldTeam.findUnique({ where: { id } });
  if (!oldValue) return;

  const team = await db.fieldTeam.update({
    where: { id },
    data: {
      name: clean(form.get("name")),
      picName: clean(form.get("picName")) || null,
      phone: clean(form.get("phone")) || null,
    },
  });
  await audit({
    userId: session.user.id,
    module: "MASTER_FIELD_TEAM",
    action: "UPDATE",
    referenceId: team.id,
    oldValue: { name: oldValue.name, picName: oldValue.picName },
    newValue: { name: team.name, picName: team.picName },
  });
  revalidatePath("/master/clients");
}

async function setFieldTeamStatus(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const id = clean(form.get("id"));
  const status = clean(form.get("status")) === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  const team = await db.fieldTeam.update({ where: { id }, data: { status } });
  await audit({
    userId: session.user.id,
    module: "MASTER_FIELD_TEAM",
    action: status === "ACTIVE" ? "ENABLE" : "DISABLE",
    referenceId: team.id,
    newValue: { status: team.status },
  });
  revalidatePath("/master/clients");
}

async function deleteFieldTeam(form: FormData) {
  "use server";
  const session = await ensureMasterAccess();
  if (!session) return;

  const id = clean(form.get("id"));
  const related = await db.fieldTeam.findUnique({
    where: { id },
    select: { _count: { select: { shipments: true, containers: true } } },
  });
  if (!related) return;

  if (related._count.shipments > 0 || related._count.containers > 0) {
    const team = await db.fieldTeam.update({ where: { id }, data: { status: "INACTIVE" } });
    await audit({
      userId: session.user.id,
      module: "MASTER_FIELD_TEAM",
      action: "DISABLE_INSTEAD_OF_DELETE",
      referenceId: team.id,
      newValue: { reason: "Tim sudah dipakai shipment/kontainer" },
    });
  } else {
    await db.fieldTeam.delete({ where: { id } });
    await audit({ userId: session.user.id, module: "MASTER_FIELD_TEAM", action: "DELETE", referenceId: id });
  }
  revalidatePath("/master/clients");
}

export default async function MasterClientsPage() {
  const [clients, carriers, teams] = await Promise.all([
    db.client.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
    db.carrier.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
    db.fieldTeam.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
  ]);

  return <AppShell title="Master Data">
    <PageHead title="Klien & master operasional" description="Tambah, edit, nonaktifkan, atau hapus master data. Data yang sudah dipakai histori akan dinonaktifkan, bukan dihapus permanen." />

    <div className="grid-2">
      <div className="card">
        <div className="card-head"><h3>Daftar klien</h3></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kode</th><th>Nama</th><th>PIC</th><th>Termin</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {clients.map((item) => <Fragment key={item.id}>
                <tr>
                  <td>{item.code}</td>
                  <td className="primary-cell"><strong>{item.name}</strong><span>{item.email || item.address}</span></td>
                  <td>{item.picName || "-"}</td>
                  <td>{item.paymentTermDays} hari</td>
                  <td>{statusBadge(item.status)}</td>
                  <td>
                    <div className="actions compact-actions">
                      <form action={setClientStatus}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="status" value={item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                        <button className="btn btn-secondary">{item.status === "ACTIVE" ? "Disable" : "Aktifkan"}</button>
                      </form>
                      <form action={deleteClient}>
                        <input type="hidden" name="id" value={item.id} />
                        <button className="btn btn-danger">Delete</button>
                      </form>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={6}>
                    <details className="inline-editor">
                      <summary>Edit klien</summary>
                      <form action={updateClient} className="edit-grid">
                        <input type="hidden" name="id" value={item.id} />
                        <div className="field"><label>Kode</label><input name="code" defaultValue={item.code} required /></div>
                        <div className="field"><label>Nama</label><input name="name" defaultValue={item.name} required /></div>
                        <div className="field"><label>PIC</label><input name="picName" defaultValue={item.picName || ""} /></div>
                        <div className="field"><label>Email</label><input name="email" type="email" defaultValue={item.email || ""} /></div>
                        <div className="field"><label>Termin</label><input name="paymentTermDays" type="number" defaultValue={item.paymentTermDays} /></div>
                        <div className="field"><label>Alamat</label><input name="address" defaultValue={item.address} required /></div>
                        <button className="btn btn-primary">Simpan edit</button>
                      </form>
                    </details>
                  </td>
                </tr>
              </Fragment>)}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Tambah klien</h3></div>
        <form action={addClient} className="card-body form-stack">
          <div className="grid-equal"><div className="field"><label>Kode</label><input name="code" required /></div><div className="field"><label>Termin (hari)</label><input name="paymentTermDays" type="number" defaultValue={30} /></div></div>
          <div className="field"><label>Nama klien</label><input name="name" required /></div>
          <div className="field"><label>Alamat</label><textarea name="address" required rows={3}/></div>
          <div className="grid-equal"><div className="field"><label>Email</label><input name="email" type="email" /></div><div className="field"><label>PIC</label><input name="picName" /></div></div>
          <button className="btn btn-primary">Simpan klien</button>
        </form>
      </div>
    </div>

    <div className="grid-equal" style={{ marginTop: 20 }}>
      <div className="card">
        <div className="card-head"><h3>Carrier</h3></div>
        <div className="card-body form-stack">
          <form action={addCarrier} className="form-stack">
            <div className="grid-equal">
              <div className="field"><label>Kode carrier</label><input name="code" placeholder="MSC" required /></div>
              <div className="field"><label>Nama carrier</label><input name="name" placeholder="Mediterranean Shipping Company" required /></div>
            </div>
            <button className="btn btn-primary">Simpan carrier</button>
          </form>
          <div className="divider" />
          {carriers.map((item) => <details className="master-item" key={item.id}>
            <summary>
              <span><strong>{item.code}</strong> — {item.name}</span>
              {statusBadge(item.status)}
            </summary>
            <form action={updateCarrier} className="edit-grid">
              <input type="hidden" name="id" value={item.id} />
              <div className="field"><label>Kode</label><input name="code" defaultValue={item.code} required /></div>
              <div className="field"><label>Nama</label><input name="name" defaultValue={item.name} required /></div>
              <button className="btn btn-primary">Simpan edit</button>
            </form>
            <div className="actions compact-actions">
              <form action={setCarrierStatus}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="status" value={item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                <button className="btn btn-secondary">{item.status === "ACTIVE" ? "Disable" : "Aktifkan"}</button>
              </form>
              <form action={deleteCarrier}>
                <input type="hidden" name="id" value={item.id} />
                <button className="btn btn-danger">Delete</button>
              </form>
            </div>
          </details>)}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Tim lapangan</h3></div>
        <div className="card-body form-stack">
          <form action={addFieldTeam} className="form-stack">
            <div className="grid-equal">
              <div className="field"><label>Nama tim</label><input name="name" placeholder="Team Two" required /></div>
              <div className="field"><label>PIC</label><input name="picName" placeholder="Nama PIC" /></div>
            </div>
            <div className="field"><label>Telepon</label><input name="phone" placeholder="08..." /></div>
            <button className="btn btn-primary">Simpan tim</button>
          </form>
          <div className="divider" />
          {teams.map((item) => <details className="master-item" key={item.id}>
            <summary>
              <span><strong>{item.name}</strong> — {item.picName || "-"}</span>
              {statusBadge(item.status)}
            </summary>
            <form action={updateFieldTeam} className="edit-grid">
              <input type="hidden" name="id" value={item.id} />
              <div className="field"><label>Nama</label><input name="name" defaultValue={item.name} required /></div>
              <div className="field"><label>PIC</label><input name="picName" defaultValue={item.picName || ""} /></div>
              <div className="field"><label>Telepon</label><input name="phone" defaultValue={item.phone || ""} /></div>
              <button className="btn btn-primary">Simpan edit</button>
            </form>
            <div className="actions compact-actions">
              <form action={setFieldTeamStatus}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="status" value={item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                <button className="btn btn-secondary">{item.status === "ACTIVE" ? "Disable" : "Aktifkan"}</button>
              </form>
              <form action={deleteFieldTeam}>
                <input type="hidden" name="id" value={item.id} />
                <button className="btn btn-danger">Delete</button>
              </form>
            </div>
          </details>)}
        </div>
      </div>
    </div>
  </AppShell>;
}
