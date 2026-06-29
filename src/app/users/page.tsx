import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await db.user.findMany({ orderBy: { name: "asc" } });
  async function addUser(form: FormData) {
    "use server";
    const session = await auth();
    if (session?.user.role !== "SUPER_ADMIN") return;
    await db.user.create({
      data: {
        name: String(form.get("name")), email: String(form.get("email")).toLowerCase(),
        role: String(form.get("role")) as "SUPER_ADMIN" | "ADMIN_INVOICING" | "MANAGEMENT" | "DIRECTOR",
        passwordHash: await bcrypt.hash(String(form.get("password")), 12),
      },
    });
    revalidatePath("/users");
  }
  return <AppShell title="User Management"><PageHead title="Pengguna & hak akses" description="Kelola akun yang dapat mengakses sistem." />
    <div className="grid-2">
      <div className="card"><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role.replaceAll("_"," ")}</td><td><span className="badge green">{user.status}</span></td></tr>)}</tbody></table></div></div>
      <form action={addUser} className="card"><div className="card-head"><h3>Tambah user</h3></div><div className="card-body form-stack">
        <div className="field"><label>Nama</label><input name="name" required /></div><div className="field"><label>Email</label><input name="email" type="email" required /></div>
        <div className="field"><label>Role</label><select name="role"><option value="ADMIN_INVOICING">Admin Invoicing</option><option value="MANAGEMENT">Management</option><option value="DIRECTOR">Direktur</option><option value="SUPER_ADMIN">Super Admin</option></select></div>
        <div className="field"><label>Password awal</label><input name="password" type="password" minLength={8} required /></div><button className="btn btn-primary">Simpan user</button>
      </div></form>
    </div>
  </AppShell>;
}
