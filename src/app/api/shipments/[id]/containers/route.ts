import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, ok, requireUser } from "@/lib/api";

const containerNumber = /^[A-Z]{4}\d{7}$/;
const schema = z.object({
  billId: z.string().min(1),
  numbers: z.array(z.string()).min(1).max(500),
  size: z.enum(["20FT", "40FT", "40HC", "45FT"]),
  type: z.string().min(1),
  fieldTeamId: z.string().optional().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    const numbers = input.numbers.map((value) => value.trim().toUpperCase()).filter(Boolean);
    const invalid = numbers.filter((value) => !containerNumber.test(value));
    const duplicates = numbers.filter((value, index) => numbers.indexOf(value) !== index);
    const existing = await db.container.findMany({
      where: { shipmentId: id, number: { in: numbers } },
      select: { number: true },
    });
    const errors = {
      invalid: [...new Set(invalid)],
      duplicate: [...new Set([...duplicates, ...existing.map((item) => item.number)])],
    };
    if (errors.invalid.length || errors.duplicate.length) {
      return fail("Validasi nomor kontainer gagal.", 422, errors);
    }
    const result = await db.container.createMany({
      data: numbers.map((number) => ({
        shipmentId: id,
        billId: input.billId,
        number,
        size: input.size,
        type: input.type,
        fieldTeamId: input.fieldTeamId || null,
      })),
    });
    await audit({
      userId: access.user.id,
      module: "CONTAINER",
      action: "BULK_CREATE",
      referenceId: id,
      newValue: { count: result.count, billId: input.billId },
    });
    return ok({ count: result.count });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal menyimpan kontainer.");
  }
}
