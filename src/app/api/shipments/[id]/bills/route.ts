import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, ok, requireUser } from "@/lib/api";

const schema = z.object({
  number: z.string().min(2).transform((value) => value.trim().toUpperCase()),
  notes: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    const existing = await db.billOfLading.findUnique({
      where: { shipmentId_number: { shipmentId: id, number: input.number } },
      select: { id: true },
    });
    if (existing) return fail(`B/L Number ${input.number} sudah terdaftar di shipment ini.`, 422);
    const bill = await db.billOfLading.create({ data: { shipmentId: id, ...input } });
    await audit({ userId: access.user.id, module: "BILL_OF_LADING", action: "CREATE", referenceId: bill.id });
    return ok(bill);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("B/L Number sudah terdaftar di shipment ini.", 422);
    }
    return fail(error instanceof Error ? error.message : "Gagal menambah B/L.");
  }
}
