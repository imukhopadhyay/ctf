import { NextResponse } from "next/server";
import { route } from "@/server/http/api";
import { SESSION_COOKIE, revokeSession } from "@/server/auth/session";
import { audit } from "@/server/audit";

export const POST = route({}, async ({ req, user, ip }) => {
  await revokeSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) await audit({ actorId: user.id, action: "auth.logout", targetType: "user", targetId: user.id, ip });
  const res = NextResponse.json({ ok: true, data: null });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", expires: new Date(0), sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
});
