import "server-only";
import { db } from "../db";
import { env } from "../env";
import { hashIp, randomToken, sha256Hex } from "../crypto";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-cq_session" : "cq_session";
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "ORGANIZER" | "EVALUATOR" | "PARTICIPANT";
  status: "ACTIVE" | "SUSPENDED";
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3600 * 1000);
  await db.session.create({
    data: {
      id: sha256Hex(token),
      userId,
      expiresAt,
      ipHash: hashIp(meta.ip ?? null),
      userAgent: meta.userAgent?.slice(0, 200) ?? null,
    },
  });
  return { token, expiresAt };
}

/** Resolves a session token to its user. Expired sessions and suspended users yield null. */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const id = sha256Hex(token);
  const session = await db.session.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, username: true, displayName: true, role: true, status: true } },
    },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session.user;
}

export async function revokeSession(token: string | undefined | null) {
  if (!token) return;
  await db.session.deleteMany({ where: { id: sha256Hex(token) } });
}

export async function revokeAllSessions(userId: string, exceptToken?: string) {
  await db.session.deleteMany({
    where: { userId, ...(exceptToken ? { NOT: { id: sha256Hex(exceptToken) } } : {}) },
  });
}
