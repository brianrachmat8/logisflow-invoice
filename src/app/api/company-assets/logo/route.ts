import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const company = companyId
    ? await db.company.findUnique({ where: { id: companyId } })
    : await db.company.findFirst({ where: { isDefault: true } })
      ?? await db.company.findFirst({ orderBy: { createdAt: "asc" } });

  if (!company?.logoPath) return new NextResponse(null, { status: 404 });

  try {
    const file = await fs.readFile(company.logoPath);
    const ext = path.extname(company.logoPath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";
    return new NextResponse(file, { headers: { "content-type": contentType, "cache-control": "private, max-age=60" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
