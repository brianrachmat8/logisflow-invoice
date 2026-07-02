import { fail, ok, requireUser } from "@/lib/api";
import { cancelInvoice } from "@/lib/invoice-service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING", "DIRECTOR"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    return ok(await cancelInvoice(id, access.user.id));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Pembatalan invoice gagal.", 422);
  }
}
