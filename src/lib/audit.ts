import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type DbLike = PrismaClient | Prisma.TransactionClient;

export async function audit(
  data: {
    userId?: string;
    module: string;
    action: string;
    referenceId?: string;
    oldValue?: Prisma.InputJsonValue;
    newValue?: Prisma.InputJsonValue;
  },
  client: DbLike = db,
) {
  return client.activityLog.create({ data });
}
