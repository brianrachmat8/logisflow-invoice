import { fail, ok, requireUser } from "@/lib/api";
import type { InvoiceSplitMode } from "@/lib/business";
import { generateDraftInvoices } from "@/lib/invoice-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser(["SUPER_ADMIN", "ADMIN_INVOICING"]);
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const mode: InvoiceSplitMode = body.mode === "combine_jasa" ? "combine_jasa" : "split_by_bl";
    return ok(await generateDraftInvoices(id, access.user.id, {
      mode,
      replaceDraft: body.replaceDraft !== false,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Generate invoice gagal.", 422);
  }
}
