import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Role } from "@prisma/client";

export function ok<T>(data: T, meta: Record<string, unknown> = {}) {
  return NextResponse.json({ data, meta, error: null });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { data: null, meta: {}, error: { message, details } },
    { status },
  );
}

export async function requireUser(allowed?: Role[]) {
  const session = await auth();
  if (!session?.user) return { error: fail("Anda harus login.", 401) };
  if (allowed && !allowed.includes(session.user.role)) {
    return { error: fail("Anda tidak memiliki akses untuk tindakan ini.", 403) };
  }
  return { user: session.user };
}
