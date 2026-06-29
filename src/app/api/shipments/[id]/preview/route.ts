import { fail, ok, requireUser } from "@/lib/api";
import { previewShipmentInvoice } from "@/lib/invoice-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireUser();
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "combine_jasa" ? "combine_jasa" : "split_by_bl";
    const result = await previewShipmentInvoice(id, mode);
    return ok(result.split);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Preview gagal.", 422);
  }
}
