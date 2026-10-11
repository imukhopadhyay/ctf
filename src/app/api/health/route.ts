import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Reports dependency status without leaking configuration. */
export async function GET() {
  const checks: Record<string, "ok" | "down" | "not_configured"> = {};
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }
  const r = redis();
  if (!r) checks.redis = "not_configured";
  else {
    try {
      await r.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "down";
    }
  }
  const healthy = checks.database === "ok" && checks.redis !== "down";
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
