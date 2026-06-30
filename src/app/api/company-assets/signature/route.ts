import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const company = companyId
    ? await db.company.findUnique({ where: { id: companyId } })
    : await db.company.findFirst({ where: { isDefault: true } })
      ?? await db.company.findFirst({ orderBy: { createdAt: "asc" } });

  if (!company?.signaturePath) return new NextResponse(null, { status: 404 });

  try {
    const file = await fs.readFile(company.signaturePath);
    return new NextResponse(file, { headers: { "content-type": "image/png", "cache-control": "private, max-age=60" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
