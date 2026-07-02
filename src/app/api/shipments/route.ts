import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { fail, ok, requireUser } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  clientId: z.string().min(1),
  carrierId: z.string().optional().nullable(),
  vessel: z.string().optional(),
  voyage: z.string().optional(),
  shipmentDirection: z.enum(["EXPORT", "IMPORT", "LAIN_LAIN"]).default("EXPORT"),
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
    const isOtherOrder = input.shipmentDirection === "LAIN_LAIN";
    if (!isOtherOrder && !input.vessel?.trim()) return fail("Vessel wajib diisi.", 422);
    if (!isOtherOrder && !input.voyage?.trim()) return fail("Voyage wajib diisi.", 422);

    let shipment;
    let jobNumber = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      jobNumber = await nextJobNumber(attempt);
      try {
        shipment = await db.shipment.create({
          data: {
            clientId: input.clientId,
            carrierId: input.carrierId || null,
            vessel: isOtherOrder ? input.vessel?.trim() || "-" : input.vessel!.trim(),
            voyage: isOtherOrder ? input.voyage?.trim() || "-" : input.voyage!.trim(),
            shipmentDirection: input.shipmentDirection,
            doNumber: input.doNumber.trim(),
            shipmentDate: input.shipmentDate,
            fieldTeamId: input.fieldTeamId || null,
            internalPic: input.internalPic,
            notes: input.notes,
            jobNumber,
            createdById: access.user.id,
            bills: input.shipmentDirection === "IMPORT"
              ? { create: { number: input.doNumber, notes: "B/L awal dari form import" } }
              : undefined,
          },
        });
        break;
      } catch (error) {
        const isDuplicateJobNumber = error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === "P2002"
          && Array.isArray(error.meta?.target)
          && error.meta.target.includes("jobNumber");
        if (!isDuplicateJobNumber || attempt === 4) throw error;
      }
    }
    if (!shipment) throw new Error("Gagal membuat nomor JOB baru.");

    await audit({
      userId: access.user.id,
      module: "SHIPMENT",
      action: "CREATE",
      referenceId: shipment.id,
      newValue: { jobNumber, shipmentDirection: input.shipmentDirection },
    });
    return ok(shipment);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal membuat shipment.");
  }
}

async function nextJobNumber(offset = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `JOB/${year}/${month}/`;
  const latest = await db.shipment.findFirst({
    where: { jobNumber: { startsWith: prefix } },
    select: { jobNumber: true },
    orderBy: { jobNumber: "desc" },
  });
  const latestSequence = latest?.jobNumber ? Number(latest.jobNumber.split("/").at(-1)) || 0 : 0;
  return `${prefix}${String(latestSequence + 1 + offset).padStart(4, "0")}`;
}
