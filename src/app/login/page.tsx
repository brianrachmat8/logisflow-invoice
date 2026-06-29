import { redirect } from "next/navigation";
import { Anchor, ArrowRight, Boxes, FileCheck2, ShieldCheck } from "lucide-react";
import { auth, signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const params = await searchParams;

  async function login(formData: FormData) {
    "use server";
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  }

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="brand">
          <span className="brand-mark"><Anchor size={21} /></span>
          <span>LOGISFLOW</span>
        </div>
        <div className="hero-copy">
          <h1>Invoice logistik, tanpa drama spreadsheet.</h1>
          <p>
            Kelola shipment, pisahkan invoice jasa dan reimbursement otomatis,
            lalu pantau pembayaran dalam satu pusat kendali.
          </p>
          <div className="hero-pills">
            <span className="hero-pill"><Boxes size={13} /> Shipment terpadu</span>
            <span className="hero-pill"><FileCheck2 size={13} /> Auto-split invoice</span>
            <span className="hero-pill"><ShieldCheck size={13} /> Audit trail lengkap</span>
          </div>
        </div>
        <small style={{ color: "#7182aa" }}>Sistem internal operasi & invoicing</small>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h2>Selamat datang</h2>
          <p>Masuk untuk melanjutkan pekerjaan Anda.</p>
          {params.error && (
            <div className="badge red" style={{ marginBottom: 18 }}>
              Email atau password tidak sesuai
            </div>
          )}
          <form action={login} className="form-stack">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" placeholder="nama@perusahaan.co.id" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" placeholder="Minimal 8 karakter" required />
            </div>
            <button className="btn btn-primary btn-block" type="submit">
              Masuk ke sistem <ArrowRight size={17} />
            </button>
          </form>
          <div className="login-hint">
            Akun demo: <strong>admin@logisflow.id</strong><br />
            Password: <strong>LogisFlow123!</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
