import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { badRequest, conflict, isUniqueViolation, notFound } from "../errors";
import { audit } from "../audit";
import { hashPassword, passwordProblems } from "../auth/password";
import { revokeAllSessions } from "../auth/session";
import { requirePlatform, type Actor } from "./access";

// ───────────── Users ─────────────

export const userQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(["ADMIN", "ORGANIZER", "EVALUATOR", "PARTICIPANT"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function listUsers(actor: Actor | null, query: z.input<typeof userQuerySchema>) {
  await requirePlatform(actor, "platform.users.manage");
  const q = userQuerySchema.parse(query);
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? { OR: [{ username: { contains: q.q.toLowerCase() } }, { email: { contains: q.q.toLowerCase() } }, { displayName: { contains: q.q, mode: "insensitive" } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, email: true, username: true, displayName: true, role: true, status: true, createdAt: true, lastLoginAt: true, institution: { select: { name: true } } },
    }),
    db.user.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export const userUpdateSchema = z.object({
  role: z.enum(["ADMIN", "ORGANIZER", "EVALUATOR", "PARTICIPANT"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export async function updateUser(actor: Actor | null, userId: string, input: z.infer<typeof userUpdateSchema>) {
  const admin = await requirePlatform(actor, "platform.users.manage");
  const data = userUpdateSchema.parse(input);
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound("User");
  if (target.id === admin.id && (data.role && data.role !== "ADMIN" || data.status === "SUSPENDED"))
    throw badRequest("You cannot demote or suspend your own account.");
  if (target.role === "ADMIN" && ((data.role && data.role !== "ADMIN") || data.status === "SUSPENDED")) {
    const admins = await db.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
    if (admins <= 1) throw badRequest("The platform must keep at least one active administrator.");
  }
  const updated = await db.user.update({ where: { id: userId }, data, select: { id: true, role: true, status: true } });
  if (data.status === "SUSPENDED" || (data.role && data.role !== target.role)) await revokeAllSessions(userId);
  await audit({
    actorId: admin.id,
    action: data.status === "SUSPENDED" ? "user.suspend" : data.status === "ACTIVE" && target.status === "SUSPENDED" ? "user.reactivate" : "user.update",
    targetType: "user",
    targetId: userId,
    metadata: { from: { role: target.role, status: target.status }, to: data },
  });
  return updated;
}

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/),
  displayName: z.string().trim().min(2).max(48),
  role: z.enum(["ADMIN", "ORGANIZER", "EVALUATOR", "PARTICIPANT"]),
  password: z.string().min(1).max(256),
  institutionId: z.string().cuid().nullable().optional(),
});

/** Admin-provisioned accounts (e.g. organizer accounts). */
export async function createUser(actor: Actor | null, input: z.infer<typeof createUserSchema>) {
  const admin = await requirePlatform(actor, "platform.users.manage");
  const data = createUserSchema.parse(input);
  const problems = passwordProblems(data.password, data);
  if (problems.length) throw badRequest(problems[0]!);
  try {
    const { password, ...rest } = data;
    const user = await db.user.create({
      data: { ...rest, passwordHash: await hashPassword(password) },
      select: { id: true, username: true, role: true },
    });
    await audit({ actorId: admin.id, action: "user.create", targetType: "user", targetId: user.id, metadata: { role: user.role, username: user.username } });
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("Email or username already in use.");
    throw e;
  }
}

// ───────────── Institutions ─────────────

export const institutionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/),
  domain: z.string().trim().toLowerCase().max(253).regex(/^[a-z0-9.-]*$/).nullable().optional(),
});

export async function listInstitutions() {
  return db.institution.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, domain: true, _count: { select: { users: true, competitions: true } } } });
}

export async function upsertInstitution(actor: Actor | null, input: z.infer<typeof institutionSchema>, id?: string) {
  const admin = await requirePlatform(actor, "platform.institutions.manage");
  const data = institutionSchema.parse(input);
  try {
    const inst = id ? await db.institution.update({ where: { id }, data }) : await db.institution.create({ data });
    await audit({ actorId: admin.id, action: id ? "institution.update" : "institution.create", targetType: "institution", targetId: inst.id, metadata: { name: inst.name } });
    return inst;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("Institution name or slug already exists.");
    throw e;
  }
}

// ───────────── Execution environments ─────────────

export const environmentSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/),
  name: z.string().trim().min(3).max(80),
  description: z.string().max(2000).default(""),
  // Restrict to a conservative image reference grammar (registry/repo:tag or @sha256 digest).
  image: z.string().trim().regex(/^[a-z0-9]+([._-][a-z0-9]+)*(\/[a-z0-9]+([._-][a-z0-9]+)*)*(:[\w][\w.-]{0,127})?(@sha256:[a-f0-9]{64})?$/, "Invalid image reference"),
  protocol: z.enum(["http", "tcp"]).default("http"),
  internalPort: z.coerce.number().int().min(1).max(65535),
  memoryMb: z.coerce.number().int().min(16).max(2048).default(128),
  cpuMillis: z.coerce.number().int().min(50).max(2000).default(250),
  pidsLimit: z.coerce.number().int().min(8).max(512).default(64),
  ttlMinutes: z.coerce.number().int().min(5).max(240).default(30),
  enabled: z.boolean().default(false),
});

export async function listEnvironments(actor: Actor | null) {
  assertStaffish(actor);
  return db.executionEnvironment.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { challenges: true, instances: true } } } });
}

function assertStaffish(actor: Actor | null) {
  if (!actor || actor.role === "PARTICIPANT") throw notFound("Resource");
}

export async function upsertEnvironment(actor: Actor | null, input: z.infer<typeof environmentSchema>, id?: string) {
  const admin = await requirePlatform(actor, "platform.environments.manage");
  const data = environmentSchema.parse(input);
  try {
    const e = id ? await db.executionEnvironment.update({ where: { id }, data }) : await db.executionEnvironment.create({ data });
    await audit({ actorId: admin.id, action: id ? "environment.update" : "environment.create", targetType: "environment", targetId: e.id, metadata: { key: e.key, image: e.image, enabled: e.enabled } });
    return e;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("Environment key already exists.");
    throw e;
  }
}

// ───────────── Audit & security ─────────────

export const auditQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  competitionId: z.string().cuid().optional(),
  actor: z.string().trim().max(32).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listAuditLogs(actor: Actor | null, query: z.input<typeof auditQuerySchema>) {
  await requirePlatform(actor, "platform.audit.view");
  const q = auditQuerySchema.parse(query);
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.competitionId ? { competitionId: q.competitionId } : {}),
    ...(q.actor ? { actor: { username: q.actor.toLowerCase() } } : {}),
  };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { actor: { select: { username: true } }, competition: { select: { name: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export const securityQuerySchema = z.object({
  type: z.string().trim().max(40).optional(),
  unacknowledged: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listSecurityEvents(actor: Actor | null, query: z.input<typeof securityQuerySchema>) {
  await requirePlatform(actor, "platform.security.view");
  const q = securityQuerySchema.parse(query);
  const where: Prisma.SecurityEventWhereInput = {
    ...(q.type ? { type: q.type } : {}),
    ...(q.unacknowledged === "true" ? { acknowledgedAt: null } : {}),
  };
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [items, total, byType] = await Promise.all([
    db.securityEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { competition: { select: { name: true } } } }),
    db.securityEvent.count({ where }),
    db.securityEvent.groupBy({ by: ["type"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  return { items, total, page: q.page, pageSize: q.pageSize, last24h: byType.map((b) => ({ type: b.type, count: b._count._all })) };
}

export async function acknowledgeSecurityEvent(actor: Actor | null, id: string) {
  const admin = await requirePlatform(actor, "platform.security.view");
  const res = await db.securityEvent.updateMany({ where: { id, acknowledgedAt: null }, data: { acknowledgedAt: new Date(), acknowledgedById: admin.id } });
  if (res.count === 0) throw notFound("Unacknowledged security event");
  await audit({ actorId: admin.id, action: "security.acknowledge", targetType: "security_event", targetId: id });
}
