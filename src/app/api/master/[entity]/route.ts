import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, requireUser } from "@/lib/api";

export async function GET(_: Request, { params }: { params: Promise<{ entity: string }> }) {
  const access = await requireUser();
  if (access.error) return access.error;
  const { entity } = await params;
  switch (entity) {
    case "clients": return ok(await db.client.findMany({ orderBy: { name: "asc" } }));
    case "carriers": return ok(await db.carrier.findMany({ orderBy: { name: "asc" } }));
    case "field-teams": return ok(await db.fieldTeam.findMany({ orderBy: { name: "asc" } }));
    case "charge-types": return ok(await db.chargeType.findMany({ orderBy: { name: "asc" } }));
    default: return fail("Master data tidak ditemukan.", 404);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  const { entity } = await params;
  const body = await request.json();
  try {
    if (entity === "clients") {
      const data = z.object({
        code: z.string().min(2), name: z.string().min(2), address: z.string().min(3),
        npwp: z.string().optional(), email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(), picName: z.string().optional(),
        paymentTermDays: z.coerce.number().int().min(0).default(30),
      }).parse(body);
      return ok(await db.client.create({ data: { ...data, email: data.email || null } }));
    }
    if (entity === "carriers") {
      const data = z.object({ code: z.string().min(2), name: z.string().min(2) }).parse(body);
      return ok(await db.carrier.create({ data }));
    }
    if (entity === "field-teams") {
      const data = z.object({ name: z.string().min(2), picName: z.string().optional(), phone: z.string().optional() }).parse(body);
      return ok(await db.fieldTeam.create({ data }));
    }
    return fail("Master data tidak didukung.", 404);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Data gagal disimpan.");
  }
}
