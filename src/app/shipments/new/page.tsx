import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { ShipmentForm } from "@/components/shipment-form";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewShipmentPage() {
  const [clients, carriers, fieldTeams] = await Promise.all([
    db.client.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.carrier.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.fieldTeam.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <AppShell title="Shipment baru">
    <PageHead title="Buat shipment" description="Masukkan informasi dasar pekerjaan logistik." />
    <ShipmentForm clients={clients} carriers={carriers} fieldTeams={fieldTeams} />
  </AppShell>;
}
