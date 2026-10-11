import { NextResponse } from "next/server";
import { route } from "@/server/http/api";
import { login, loginSchema } from "@/server/services/auth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/session";

export const POST = route({ body: loginSchema }, async ({ body, ip, req }) => {
  const { session, user } = await login(body, { ip, userAgent: req.headers.get("user-agent") });
  const res = NextResponse.json({ ok: true, data: { user } }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
});
