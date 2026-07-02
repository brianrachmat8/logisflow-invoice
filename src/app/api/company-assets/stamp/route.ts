import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { fail, ok, requireUser } from "@/lib/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), "storage");

function stampKey(companyId: string) {
  return `company:${companyId}:stampPath`;
}

async function findCompany(companyId?: string | null) {
  if (companyId) return db.company.findUnique({ where: { id: companyId } });
  return db.company.findFirst({ where: { isDefault: true } })
    ?? db.company.findFirst({ orderBy: { createdAt: "asc" } });
}

export async function GET(request: NextRequest) {
  const company = await findCompany(request.nextUrl.searchParams.get("companyId"));
  if (!company) return new NextResponse(null, { status: 404 });

  const setting = await db.appSetting.findUnique({ where: { key: stampKey(company.id) } });
  if (!setting?.value) return new NextResponse(null, { status: 404 });

  try {
    const file = await fs.readFile(setting.value);
    return new NextResponse(new Uint8Array(file), { headers: { "content-type": "image/png", "cache-control": "private, max-age=60" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function POST(request: Request) {
  const access = await requireUser(["SUPER_ADMIN"]);
  if (access.error) return access.error;

  try {
    const form = await request.formData();
    const companyId = String(form.get("companyId") || "");
    const file = form.get("stamp");
    if (!companyId) return fail("Perusahaan belum dipilih.", 422);
    if (!(file instanceof File) || !file.size) return fail("File stampel wajib dipilih.", 422);
    if (file.type !== "image/png" || file.size > 5 * 1024 * 1024) {
      return fail("Stampel harus PNG maksimal 5 MB.", 422);
    }

    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) return fail("Perusahaan tidak ditemukan.", 404);

    const root = path.join(storageRoot, "company");
    await fs.mkdir(root, { recursive: true });
    const target = path.join(root, `stamp-${company.id}-${Date.now()}.png`);
    await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));

    await db.appSetting.upsert({
      where: { key: stampKey(company.id) },
      update: { value: target },
      create: { key: stampKey(company.id), value: target },
    });

    return ok({ path: target });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Upload stampel gagal.", 422);
  }
}
