import "server-only";
import { z } from "zod";
import { db } from "../db";
import { env } from "../env";
import { AppError, isUniqueViolation } from "../errors";
import { audit, securityEvent } from "../audit";
import { burnPasswordCheck, hashPassword, passwordProblems, verifyPassword } from "../auth/password";
import { createSession, revokeAllSessions } from "../auth/session";
import { rateLimit, LIMITS } from "../ratelimit";
import { getSetting } from "./settings";
import type { Actor } from "./access";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Username may contain letters, digits, '_' and '-'")
  .transform((s) => s.toLowerCase());

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  username: usernameSchema,
  displayName: z.string().trim().min(2).max(48),
  password: z.string().min(1).max(256),
  institutionId: z.string().cuid().optional().nullable(),
  acceptPolicy: z.literal(true, { errorMap: () => ({ message: "You must accept the responsible-use policy" }) }),
});

export const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(256),
});

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export async function registerUser(input: z.infer<typeof registerSchema>, meta: { ip: string | null }) {
  const registrationEnabled = env().REGISTRATION_ENABLED && (await getSetting("registrationOpen"));
  if (!registrationEnabled) throw new AppError("FORBIDDEN", "Self-registration is currently disabled.");

  const rl = await rateLimit(`register:ip:${meta.ip}`, LIMITS.register.limit, LIMITS.register.window);
  if (!rl.allowed) {
    await securityEvent({ type: "RATE_LIMIT", ip: meta.ip, details: { limiter: "register" } });
    throw new AppError("RATE_LIMITED", "Too many registrations from this address.", undefined, rl.retryAfterSeconds);
  }

  const problems = passwordProblems(input.password, { email: input.email, username: input.username });
  if (problems.length) throw new AppError("VALIDATION_FAILED", problems[0]!, problems.map((m) => ({ path: "password", message: m })));

  if (input.institutionId) {
    const inst = await db.institution.findUnique({ where: { id: input.institutionId }, select: { id: true } });
    if (!inst) throw new AppError("VALIDATION_FAILED", "Unknown institution");
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.user.create({
      data: {
        email: input.email,
        username: input.username,
        displayName: input.displayName,
        passwordHash,
        institutionId: input.institutionId ?? null,
        role: "PARTICIPANT", // self-registration can never grant a privileged role
      },
      select: { id: true, username: true },
    });
    await audit({ actorId: user.id, action: "auth.register", targetType: "user", targetId: user.id, ip: meta.ip });
    return user;
  } catch (e) {
    // Generic message: do not reveal which of email/username exists.
    if (isUniqueViolation(e)) throw new AppError("CONFLICT", "An account with that email or username already exists.");
    throw e;
  }
}

export async function login(
  input: z.infer<typeof loginSchema>,
  meta: { ip: string | null; userAgent: string | null },
) {
  const invalid = new AppError("UNAUTHENTICATED", "Invalid username/email or password.");
  const ipLimit = await rateLimit(`login:ip:${meta.ip}`, LIMITS.login.limit, LIMITS.login.window);
  const acctLimit = await rateLimit(`login:acct:${input.identifier}`, LIMITS.loginAccount.limit, LIMITS.loginAccount.window);
  if (!ipLimit.allowed || !acctLimit.allowed) {
    await securityEvent({ type: "RATE_LIMIT", severity: "MEDIUM", ip: meta.ip, details: { limiter: "login" } });
    throw new AppError(
      "RATE_LIMITED",
      "Too many login attempts. Try again later.",
      undefined,
      Math.max(ipLimit.retryAfterSeconds, acctLimit.retryAfterSeconds),
    );
  }

  const user = await db.user.findFirst({
    where: input.identifier.includes("@") ? { email: input.identifier } : { username: input.identifier },
  });
  if (!user) {
    await burnPasswordCheck(input.password);
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await burnPasswordCheck(input.password);
    throw new AppError("RATE_LIMITED", "Account temporarily locked after repeated failures. Try again later.");
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    await securityEvent({
      type: lock ? "ACCOUNT_LOCKED" : "LOGIN_FAILURE",
      severity: lock ? "MEDIUM" : "LOW",
      userId: user.id,
      ip: meta.ip,
    });
    throw invalid;
  }
  if (user.status !== "ACTIVE") throw new AppError("FORBIDDEN", "This account is suspended.");

  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  const session = await createSession(user.id, meta);
  await audit({ actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id, ip: meta.ip });
  return { session, user: { id: user.id, username: user.username, role: user.role } };
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(256),
});

export async function changePassword(actor: Actor, input: z.infer<typeof changePasswordSchema>, currentToken?: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword)))
    throw new AppError("FORBIDDEN", "Current password is incorrect.");
  const problems = passwordProblems(input.newPassword, { email: user.email, username: user.username });
  if (problems.length) throw new AppError("VALIDATION_FAILED", problems[0]!);
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
  await revokeAllSessions(user.id, currentToken);
  await audit({ actorId: user.id, action: "auth.password_change", targetType: "user", targetId: user.id });
}

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(48),
  institutionId: z.string().cuid().nullable().optional(),
});

export async function updateProfile(actor: Actor, input: z.infer<typeof profileSchema>) {
  if (input.institutionId) {
    const inst = await db.institution.findUnique({ where: { id: input.institutionId }, select: { id: true } });
    if (!inst) throw new AppError("VALIDATION_FAILED", "Unknown institution");
  }
  return db.user.update({
    where: { id: actor.id },
    data: { displayName: input.displayName, institutionId: input.institutionId ?? null },
    select: { id: true, displayName: true, institutionId: true },
  });
}
