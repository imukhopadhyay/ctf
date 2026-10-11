import { NextResponse } from "next/server";
import { route } from "@/server/http/api";
import { submitFlag, submitSchema } from "@/server/services/submissions";

const STATUS: Record<string, number> = { correct: 200, incorrect: 200, already_solved: 200, unavailable: 409, limit_reached: 409, rate_limited: 429 };

export const POST = route<{ id: string; challengeId: string }, { flag: string }>(
  { auth: "required", body: submitSchema, maxJsonBytes: 4096 },
  async ({ user, params, body, ip }) => {
    const outcome = await submitFlag(user, params.id, params.challengeId, body.flag, { ip });
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (outcome.retryAfterSeconds) headers["Retry-After"] = String(outcome.retryAfterSeconds);
    return NextResponse.json({ ok: true, data: outcome }, { status: STATUS[outcome.status] ?? 200, headers });
  },
);
