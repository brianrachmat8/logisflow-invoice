import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ kind: string }> }) {
  const access = await requireUser();
  if (access.error) return access.error;
  const { kind } = await params;
  const company = await db.company.findFirst();
  const filePath = kind === "logo" ? company?.logoPath : kind === "signature" ? company?.signaturePath : null;
  if (!filePath) return new NextResponse("Not found", { status: 404 });

  const bytes = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
