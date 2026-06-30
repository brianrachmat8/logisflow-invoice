import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity, Anchor, BarChart3, Bell, Building2, ChevronDown, CircleDollarSign,
  FilePlus2, FileSpreadsheet, LayoutDashboard, Menu, ReceiptText, Settings, Ship, Users,
} from "lucide-react";
import { auth, signOut } from "@/auth";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shipments", label: "Shipment / Job Order", icon: Ship },
  { href: "/invoices", label: "Invoice", icon: ReceiptText },
  { href: "/invoices/manual/new", label: "Invoice Lain-lain", icon: FilePlus2 },
  { href: "/payments", label: "Pembayaran", icon: CircleDollarSign },
  { href: "/ar-tracking", label: "AR Tracking", icon: BarChart3 },
  { href: "/reports", label: "Laporan", icon: FileSpreadsheet },
];
const master = [
  { href: "/master/clients", label: "Klien & Master Data", icon: Building2 },
  { href: "/users", label: "User Management", icon: Users },
  { href: "/activity", label: "Activity Log", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

const roleLabel = {
  SUPER_ADMIN: "Super Admin",
  ADMIN_INVOICING: "Admin Invoicing",
  MANAGEMENT: "Management",
  DIRECTOR: "Direktur",
};

export async function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const initials = session.user.name?.split(" ").map((word) => word[0]).slice(0, 2).join("") || "US";

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark"><Anchor size={21} /></span>
          <span>LOGISFLOW</span>
        </Link>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link className="nav-item" href={href} key={href}><Icon size={18} />{label}</Link>
          ))}
        </nav>
        <div className="nav-label">Administrasi</div>
        <nav className="nav-list">
          {master.map(({ href, label, icon: Icon }) => (
            <Link className="nav-item" href={href} key={href}><Icon size={18} />{label}</Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip" style={{ color: "white" }}>
            <span className="avatar">{initials}</span>
            <span>
              <strong>{session.user.name}</strong>
              <span>{roleLabel[session.user.role]}</span>
            </span>
          </div>
          <form action={logout} style={{ marginTop: 10 }}>
            <button type="submit" className="btn btn-ghost btn-block" style={{ color: "white", borderColor: "rgba(255,255,255,.18)" }}>
              Keluar
            </button>
          </form>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="icon-btn mobile-menu"><Menu size={19} /></button>
            <h1>{title}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-btn"><Bell size={18} /></button>
            <button className="icon-btn" style={{ width: "auto", padding: "0 12px", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{initials}</span><ChevronDown size={13} />
            </button>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
