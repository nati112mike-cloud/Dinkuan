import { prisma } from "@dinkuan/db";
import { NextResponse } from "next/server";
import { reportError } from "@dinkuan/core/server";

export const dynamic = "force-dynamic";

/** Uptime check: is the app up and can it reach the database? No details beyond that. */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { data: { status: "ok", db: "ok", dbMs: Date.now() - started, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev" } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    await reportError(e, { path: "/api/health", method: "GET" });
    return NextResponse.json({ error: { code: "UNAVAILABLE", message: "Database unreachable" } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
