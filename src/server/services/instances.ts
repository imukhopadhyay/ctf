import "server-only";
import type { ChallengeInstance, ExecutionEnvironment, Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { AppError, badRequest, notFound } from "../errors";
import { audit, securityEvent } from "../audit";
import { deriveInstanceFlag } from "../domain/flag-match";
import { acceptsSubmissions } from "../domain/competition-state";
import { rateLimit, LIMITS } from "../ratelimit";
import { runner, runnerConfigured } from "../runner/client";
import type { CreateInstanceRequest } from "../runner/signing";
import { assertUser, parseSubject, requireCompetitionPermission, requirePlatform, type Actor } from "./access";
import { loadPlayableChallenge } from "./challenges";
import { getSetting } from "./settings";

const ACTIVE = ["PROVISIONING", "RUNNING"] as const;

async function logEvent(instanceId: string, type: string, detail: Record<string, unknown> = {}) {
  await db.challengeInstanceEvent.create({ data: { instanceId, type, detail: detail as Prisma.InputJsonValue } });
}

function buildRequest(instance: ChallengeInstance, environment: ExecutionEnvironment): CreateInstanceRequest {
  return {
    instanceId: instance.id,
    image: environment.image,
    internalPort: environment.internalPort,
    protocol: environment.protocol === "tcp" ? "tcp" : "http",
    memoryMb: environment.memoryMb,
    cpuMillis: environment.cpuMillis,
    pidsLimit: environment.pidsLimit,
    ttlSeconds: Math.max(60, Math.floor((instance.expiresAt.getTime() - Date.now()) / 1000)),
    env: {
      // The per-instance flag is derived (HMAC) and only ever handed to the isolated container.
      FLAG: deriveInstanceFlag(env().INSTANCE_FLAG_SECRET, instance.id, instance.challengeId, instance.subjectKey),
      CQ_INSTANCE_ID: instance.id,
    },
  };
}

const publicInstance = (i: ChallengeInstance) => ({
  id: i.id,
  status: i.status,
  connection: i.connection,
  expiresAt: i.expiresAt,
  resetCount: i.resetCount,
  createdAt: i.createdAt,
  lastError: i.status === "FAILED" ? i.lastError : null,
});

async function loadInstanceContext(actor: Actor, competitionId: string, challengeId: string) {
  const ctx = await loadPlayableChallenge(actor, competitionId, challengeId);
  if (ctx.challenge.accessMethod !== "INSTANCE") throw badRequest("This challenge does not use an isolated environment.");
  if (!ctx.participation.subjectKey) throw badRequest("You must be an approved participant (and on a team in team mode).");
  if (!acceptsSubmissions(ctx.competition, new Date())) throw badRequest("Environments are only available while the competition is active.");
  const environment = ctx.challenge.environmentId
    ? await db.executionEnvironment.findUnique({ where: { id: ctx.challenge.environmentId } })
    : null;
  if (!environment || !environment.enabled) throw new AppError("UNAVAILABLE", "The execution environment for this challenge is not enabled.");
  if (!runnerConfigured()) {
    throw new AppError("UNAVAILABLE", "Challenge execution is not configured on this deployment. Use the downloadable offline artifacts instead.");
  }
  return { ...ctx, environment, subjectKey: ctx.participation.subjectKey };
}

export async function startInstance(actor: Actor | null, competitionId: string, challengeId: string, meta: { ip: string | null }) {
  assertUser(actor);
  const ctx = await loadInstanceContext(actor, competitionId, challengeId);
  const existing = await db.challengeInstance.findFirst({
    where: { challengeId, subjectKey: ctx.subjectKey, status: { in: [...ACTIVE] } },
  });
  if (existing) return publicInstance(existing);

  const rl = await rateLimit(`inst:${actor.id}`, LIMITS.instance.limit, LIMITS.instance.window);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many environment requests.", undefined, rl.retryAfterSeconds);
  const quota = await getSetting("maxInstancesPerSubject");
  const running = await db.challengeInstance.count({ where: { subjectKey: ctx.subjectKey, status: { in: [...ACTIVE] } } });
  if (running >= quota) throw badRequest(`You already have ${running} running environment(s). Stop one before starting another (limit ${quota}).`);

  const subject = parseSubject(ctx.subjectKey);
  let instance = await db.challengeInstance.create({
    data: {
      challengeId,
      competitionId,
      environmentId: ctx.environment.id,
      subjectKey: ctx.subjectKey,
      userId: actor.id,
      teamId: subject.kind === "team" ? subject.id : null,
      status: "PROVISIONING",
      expiresAt: new Date(Date.now() + ctx.environment.ttlMinutes * 60_000),
    },
  });
  await logEvent(instance.id, "REQUESTED", { userId: actor.id, image: ctx.environment.image });
  try {
    const res = await runner.create(buildRequest(instance, ctx.environment));
    instance = await db.challengeInstance.update({
      where: { id: instance.id },
      data: { status: "RUNNING", runnerRef: res.runnerRef, connection: res.connection as unknown as Prisma.InputJsonValue },
    });
    await logEvent(instance.id, "STARTED", { backend: res.backend, port: res.connection.port });
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    instance = await db.challengeInstance.update({ where: { id: instance.id }, data: { status: "FAILED", lastError: message, stoppedAt: new Date() } });
    await logEvent(instance.id, "FAILED", { error: message });
    await securityEvent({ type: "INSTANCE_FAILURE", severity: "LOW", userId: actor.id, competitionId, ip: meta.ip, details: { instanceId: instance.id, error: message } });
    throw e;
  }
  await audit({ actorId: actor.id, action: "instance.start", targetType: "instance", targetId: instance.id, competitionId, metadata: { challengeId }, ip: meta.ip });
  return publicInstance(instance);
}

async function loadOwnInstance(actor: Actor, competitionId: string, challengeId: string, instanceId: string) {
  const ctx = await loadInstanceContext(actor, competitionId, challengeId);
  const instance = await db.challengeInstance.findFirst({ where: { id: instanceId, challengeId, subjectKey: ctx.subjectKey } });
  if (!instance) throw notFound("Instance");
  return { ctx, instance };
}

export async function resetInstance(actor: Actor | null, competitionId: string, challengeId: string, instanceId: string) {
  assertUser(actor);
  const { ctx, instance } = await loadOwnInstance(actor, competitionId, challengeId, instanceId);
  if (instance.status !== "RUNNING" || !instance.runnerRef) throw badRequest("Only running environments can be reset.");
  const rl = await rateLimit(`inst:${actor.id}`, LIMITS.instance.limit, LIMITS.instance.window);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many environment requests.", undefined, rl.retryAfterSeconds);
  const res = await runner.reset(instance.runnerRef, buildRequest(instance, ctx.environment));
  const updated = await db.challengeInstance.update({
    where: { id: instance.id },
    data: { runnerRef: res.runnerRef, connection: res.connection as unknown as Prisma.InputJsonValue, resetCount: { increment: 1 } },
  });
  await logEvent(instance.id, "RESET", { userId: actor.id });
  return publicInstance(updated);
}

export async function stopInstance(actor: Actor | null, competitionId: string, challengeId: string, instanceId: string) {
  assertUser(actor);
  const ctx = await loadPlayableChallenge(actor, competitionId, challengeId);
  const instance = await db.challengeInstance.findFirst({
    where: { id: instanceId, challengeId, subjectKey: ctx.participation.subjectKey ?? "__none__" },
  });
  if (!instance) throw notFound("Instance");
  await terminate(instance, "STOPPED", { userId: actor.id });
}

async function terminate(instance: ChallengeInstance, status: "STOPPED" | "EXPIRED", detail: Record<string, unknown>) {
  if (instance.runnerRef && (instance.status === "RUNNING" || instance.status === "PROVISIONING")) {
    try {
      await runner.destroy(instance.runnerRef);
    } catch (e) {
      // The runner's own TTL reaper will still remove the container.
      detail = { ...detail, destroyError: (e as Error).message };
    }
  }
  await db.challengeInstance.update({ where: { id: instance.id }, data: { status, stoppedAt: new Date() } });
  await logEvent(instance.id, status, detail);
}

/** Worker task: terminate instances past their TTL. */
export async function expireInstances(now = new Date()) {
  const due = await db.challengeInstance.findMany({
    where: { status: { in: [...ACTIVE] }, expiresAt: { lte: now } },
    take: 100,
  });
  for (const i of due) await terminate(i, "EXPIRED", { reason: "ttl" });
  return due.length;
}

// ───────────── Staff / admin ─────────────

export async function listCompetitionInstances(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "competition.view_staff");
  return db.challengeInstance.findMany({
    where: { competitionId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, status: true, subjectKey: true, createdAt: true, expiresAt: true, stoppedAt: true, resetCount: true, lastError: true,
      challenge: { select: { title: true } }, user: { select: { username: true } },
      events: { orderBy: { createdAt: "desc" }, take: 5, select: { type: true, createdAt: true } },
    },
  });
}

export async function adminTerminateInstance(actor: Actor | null, instanceId: string) {
  const instance = await db.challengeInstance.findUnique({ where: { id: instanceId } });
  if (!instance) throw notFound("Instance");
  const { user } = await requireCompetitionPermission(actor, instance.competitionId, "competition.configure");
  await terminate(instance, "STOPPED", { by: user.id, admin: true });
  await audit({ actorId: user.id, action: "instance.terminate", targetType: "instance", targetId: instanceId, competitionId: instance.competitionId });
}

export async function runnerHealth(actor: Actor | null) {
  await requirePlatform(actor, "platform.environments.manage");
  if (!runnerConfigured()) return { configured: false as const };
  try {
    return { configured: true as const, health: await runner.health() };
  } catch (e) {
    return { configured: true as const, error: (e as Error).message };
  }
}
