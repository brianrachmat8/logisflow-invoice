import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, requireUser } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  clientId: z.string().min(1),
  carrierId: z.string().optional().nullable(),
  vessel: z.string().min(1),
  voyage: z.string().min(1),
  shipmentDirection: z.enum(["EXPORT", "IMPORT"]).default("EXPORT"),
  doNumber: z.string().min(1),
  shipmentDate: z.coerce.date(),
  fieldTeamId: z.string().optional().nullable(),
  internalPic: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(request: Request) {
  const access = await requireUser();
  if (access.error) return access.error;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = 20;
  const where = query
    ? {
        OR: [
          { jobNumber: { contains: query, mode: "insensitive" as const } },
          { doNumber: { contains: query, mode: "insensitive" as const } },
          { client: { name: { contains: query, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const [data, total] = await Promise.all([
    db.shipment.findMany({
      where,
      include: { client: true, carrier: true, _count: { select: { bills: true, containers: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.shipment.count({ where }),
  ]);
  return ok(data, { page, limit, total });
}

export async function POST(request: Request) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const input = schema.parse(await request.json());
    const count = await db.shipment.count({
      where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
    });
    const jobNumber = `JOB/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${String(count + 1).padStart(4, "0")}`;
    const shipment = await db.shipment.create({
      data: {
        ...input,
        carrierId: input.carrierId || null,
        fieldTeamId: input.fieldTeamId || null,
        jobNumber,
        createdById: access.user.id,
        bills: input.shipmentDirection === "IMPORT"
          ? { create: { number: input.doNumber, notes: "B/L awal dari form import" } }
          : undefined,
      },
    });
    await audit({
      userId: access.user.id,
      module: "SHIPMENT",
      action: "CREATE",
      referenceId: shipment.id,
      newValue: { jobNumber },
    });
    return ok(shipment);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal membuat shipment.");
  }
}
