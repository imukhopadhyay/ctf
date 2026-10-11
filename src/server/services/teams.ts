import "server-only";
import { z } from "zod";
import type { Competition } from "@prisma/client";
import { db } from "../db";
import { AppError, badRequest, conflict, forbidden, isUniqueViolation, notFound } from "../errors";
import { audit, securityEvent } from "../audit";
import { randomCode } from "../crypto";
import { rateLimit } from "../ratelimit";
import { assertUser, competitionCan, getParticipation, requireCompetitionPermission, teamSubject, type Actor } from "./access";
import { invalidateLeaderboard } from "./leaderboard";

export const teamNameSchema = z
  .string()
  .trim()
  .min(3, "Team name must be at least 3 characters")
  .max(40, "Team name must be at most 40 characters")
  .regex(/^[\p{L}\p{N} _.\-]+$/u, "Team name may contain letters, numbers, spaces, '_', '.' and '-'");

const normalizeName = (n: string) => n.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

async function loadTeamCompetition(competitionId: string): Promise<Competition> {
  const c = await db.competition.findUnique({ where: { id: competitionId } });
  if (!c || c.status === "DRAFT") throw notFound("Competition");
  if (c.mode !== "TEAM") throw badRequest("This competition is individual; teams are not used.");
  if (c.status === "COMPLETED" || c.status === "ARCHIVED") throw badRequest("The competition has ended; teams are locked.");
  return c;
}

function assertTeamChangesAllowed(c: Competition) {
  if ((c.status === "ACTIVE" || c.status === "PAUSED") && !c.allowTeamChangesWhileActive)
    throw badRequest("Team membership is locked while the competition is running.");
}

export async function createTeam(actor: Actor | null, competitionId: string, rawName: string) {
  assertUser(actor);
  const competition = await loadTeamCompetition(competitionId);
  assertTeamChangesAllowed(competition);
  const name = teamNameSchema.parse(rawName);
  const part = await getParticipation(actor.id, competition);
  if (part.registrationStatus !== "APPROVED") throw badRequest("Register for the competition (and be approved) before creating a team.");
  if (part.teamId) throw conflict("You are already on a team in this competition.");
  try {
    const team = await db.$transaction(async (tx) => {
      const t = await tx.team.create({
        data: { competitionId, name, nameNormalized: normalizeName(name), inviteCode: randomCode(10), captainId: actor.id },
      });
      await tx.teamMembership.create({ data: { teamId: t.id, userId: actor.id, competitionId, role: "CAPTAIN" } });
      await audit({ actorId: actor.id, action: "team.create", targetType: "team", targetId: t.id, competitionId, metadata: { name } }, tx);
      return t;
    });
    await invalidateLeaderboard(competitionId);
    return team;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("That team name is taken, or you already belong to a team.");
    throw e;
  }
}

export async function joinTeam(actor: Actor | null, competitionId: string, inviteCode: string, meta: { ip: string | null } = { ip: null }) {
  assertUser(actor);
  const rl = await rateLimit(`teamjoin:${actor.id}`, 10, 600);
  if (!rl.allowed) {
    await securityEvent({ type: "RATE_LIMIT", userId: actor.id, competitionId, ip: meta.ip, details: { limiter: "team.join" } });
    throw new AppError("RATE_LIMITED", "Too many attempts to join a team.", undefined, rl.retryAfterSeconds);
  }
  const competition = await loadTeamCompetition(competitionId);
  assertTeamChangesAllowed(competition);
  const part = await getParticipation(actor.id, competition);
  if (part.registrationStatus !== "APPROVED") throw badRequest("Register for the competition (and be approved) before joining a team.");
  if (part.teamId) throw conflict("You are already on a team in this competition.");
  const code = inviteCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(code)) throw notFound("Team");

  try {
    const team = await db.$transaction(async (tx) => {
      const t = await tx.team.findFirst({ where: { inviteCode: code, competitionId } });
      if (!t) throw notFound("Team");
      // Lock the team row so concurrent joins cannot exceed the size limit.
      await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${t.id} FOR UPDATE`;
      const size = await tx.teamMembership.count({ where: { teamId: t.id } });
      if (size >= competition.maxTeamSize) throw badRequest(`Team is full (maximum ${competition.maxTeamSize} members).`);
      await tx.teamMembership.create({ data: { teamId: t.id, userId: actor.id, competitionId, role: "MEMBER" } });
      if (!t.captainId) await tx.team.update({ where: { id: t.id }, data: { captainId: actor.id } });
      await audit({ actorId: actor.id, action: "team.join", targetType: "team", targetId: t.id, competitionId }, tx);
      return t;
    });
    await invalidateLeaderboard(competitionId);
    return { id: team.id, name: team.name };
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("You are already on a team in this competition.");
    throw e;
  }
}

async function removeMembership(competition: Competition, teamId: string, userId: string, actorId: string, action: string) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
    const membership = await tx.teamMembership.findFirst({ where: { teamId, userId } });
    if (!membership) throw notFound("Membership");
    await tx.teamMembership.delete({ where: { id: membership.id } });
    const remaining = await tx.teamMembership.findMany({ where: { teamId }, orderBy: { joinedAt: "asc" } });
    const team = await tx.team.findUniqueOrThrow({ where: { id: teamId } });
    if (remaining.length === 0) {
      const scored = await tx.scoreEvent.count({ where: { subjectKey: teamSubject(teamId) } });
      if (scored === 0) await tx.team.delete({ where: { id: teamId } });
      else await tx.team.update({ where: { id: teamId }, data: { captainId: null } });
    } else if (team.captainId === userId) {
      await tx.team.update({ where: { id: teamId }, data: { captainId: remaining[0]!.userId } });
      await tx.teamMembership.update({ where: { id: remaining[0]!.id }, data: { role: "CAPTAIN" } });
    }
    await audit({ actorId, action, targetType: "team", targetId: teamId, competitionId: competition.id, metadata: { userId } }, tx);
  });
  await invalidateLeaderboard(competition.id);
}

export async function leaveTeam(actor: Actor | null, competitionId: string) {
  assertUser(actor);
  const competition = await loadTeamCompetition(competitionId);
  assertTeamChangesAllowed(competition);
  const part = await getParticipation(actor.id, competition);
  if (!part.teamId) throw notFound("Team membership");
  await removeMembership(competition, part.teamId, actor.id, actor.id, "team.leave");
}

export async function removeMember(actor: Actor | null, competitionId: string, teamId: string, userId: string) {
  assertUser(actor);
  const competition = await loadTeamCompetition(competitionId);
  const team = await db.team.findFirst({ where: { id: teamId, competitionId } });
  if (!team) throw notFound("Team");
  const isOrganizer = await competitionCan(actor, competitionId, "participants.manage");
  if (!isOrganizer) {
    if (team.captainId !== actor.id) throw forbidden("Only the team captain can remove members.");
    if (userId === actor.id) throw badRequest("Use 'leave team' to remove yourself.");
    assertTeamChangesAllowed(competition);
  }
  await removeMembership(competition, teamId, userId, actor.id, "team.remove_member");
}

export async function transferCaptain(actor: Actor | null, competitionId: string, newCaptainId: string) {
  assertUser(actor);
  const competition = await loadTeamCompetition(competitionId);
  const part = await getParticipation(actor.id, competition);
  if (!part.teamId || part.teamRole !== "CAPTAIN") throw forbidden("Only the captain can transfer captaincy.");
  const target = await db.teamMembership.findFirst({ where: { teamId: part.teamId, userId: newCaptainId } });
  if (!target) throw notFound("Team member");
  await db.$transaction([
    db.teamMembership.updateMany({ where: { teamId: part.teamId }, data: { role: "MEMBER" } }),
    db.teamMembership.update({ where: { id: target.id }, data: { role: "CAPTAIN" } }),
    db.team.update({ where: { id: part.teamId }, data: { captainId: newCaptainId } }),
  ]);
  await audit({ actorId: actor.id, action: "team.transfer_captain", targetType: "team", targetId: part.teamId, competitionId, metadata: { newCaptainId } });
}

export async function regenerateInviteCode(actor: Actor | null, competitionId: string) {
  assertUser(actor);
  const competition = await loadTeamCompetition(competitionId);
  const part = await getParticipation(actor.id, competition);
  if (!part.teamId || part.teamRole !== "CAPTAIN") throw forbidden("Only the captain can regenerate the invitation code.");
  const team = await db.team.update({ where: { id: part.teamId }, data: { inviteCode: randomCode(10) } });
  await audit({ actorId: actor.id, action: "team.invite_regenerate", targetType: "team", targetId: team.id, competitionId });
  return { inviteCode: team.inviteCode };
}

/** The caller's team, with private details (invite code, contributions, activity). */
export async function getMyTeam(actor: Actor | null, competitionId: string) {
  assertUser(actor);
  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition) throw notFound("Competition");
  const part = await getParticipation(actor.id, competition);
  if (!part.teamId) return { team: null, participation: part };
  return { team: await teamDetails(part.teamId, true), participation: part };
}

export async function teamDetails(teamId: string, includePrivate: boolean) {
  const team = await db.team.findUniqueOrThrow({
    where: { id: teamId },
    include: {
      members: { orderBy: { joinedAt: "asc" }, include: { user: { select: { id: true, username: true, displayName: true } } } },
      achievements: { include: { achievement: { select: { name: true, icon: true, description: true } } } },
    },
  });
  const subjectKey = teamSubject(teamId);
  const [solves, events, unlocks, joins] = await Promise.all([
    db.solve.findMany({
      where: { subjectKey },
      orderBy: { createdAt: "desc" },
      select: { id: true, points: true, isFirstBlood: true, createdAt: true, userId: true, challenge: { select: { id: true, title: true, category: { select: { name: true, slug: true } } } } },
    }),
    db.scoreEvent.aggregate({ where: { subjectKey }, _sum: { points: true } }),
    includePrivate
      ? db.hintUnlock.findMany({ where: { subjectKey }, orderBy: { createdAt: "desc" }, select: { createdAt: true, cost: true, userId: true, hint: { select: { title: true, challenge: { select: { title: true } } } } } })
      : Promise.resolve([]),
    includePrivate
      ? db.auditLog.findMany({ where: { targetType: "team", targetId: teamId, action: { startsWith: "team." } }, orderBy: { createdAt: "desc" }, take: 50, select: { action: true, createdAt: true, actorId: true, metadata: true } })
      : Promise.resolve([]),
  ]);
  const nameOf = new Map(team.members.map((m) => [m.userId, m.user.displayName]));
  const contributions = team.members.map((m) => {
    const mine = solves.filter((s) => s.userId === m.userId);
    return {
      userId: m.userId,
      username: m.user.username,
      displayName: m.user.displayName,
      role: m.role,
      joinedAt: m.joinedAt,
      solves: mine.length,
      points: mine.reduce((a, s) => a + s.points, 0),
    };
  });
  const activity = includePrivate
    ? [
        ...solves.map((s) => ({ at: s.createdAt, kind: "solve" as const, text: `${nameOf.get(s.userId) ?? "Former member"} solved "${s.challenge.title}" (+${s.points})${s.isFirstBlood ? " — first blood!" : ""}` })),
        ...unlocks.map((u) => ({ at: u.createdAt, kind: "hint" as const, text: `${nameOf.get(u.userId) ?? "Former member"} unlocked "${u.hint.title}" on "${u.hint.challenge.title}"${u.cost ? ` (−${u.cost})` : ""}` })),
        ...joins.map((j) => ({ at: j.createdAt, kind: "membership" as const, text: `${nameOf.get(j.actorId ?? "") ?? "A user"}: ${j.action.replace("team.", "").replace("_", " ")}` })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 60)
    : [];
  return {
    id: team.id,
    name: team.name,
    competitionId: team.competitionId,
    captainId: team.captainId,
    inviteCode: includePrivate ? team.inviteCode : undefined,
    createdAt: team.createdAt,
    hidden: team.hidden,
    score: events._sum.points ?? 0,
    solves: solves.map((s) => ({ ...s, solvedBy: nameOf.get(s.userId) ?? "Former member" })),
    contributions,
    achievements: team.achievements.map((a) => ({ ...a.achievement, awardedAt: a.awardedAt })),
    activity,
  };
}

export async function listTeams(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "participants.manage");
  const teams = await db.team.findMany({
    where: { competitionId },
    orderBy: { createdAt: "asc" },
    include: {
      members: { include: { user: { select: { username: true, displayName: true } } } },
      captain: { select: { username: true } },
      _count: { select: { solves: true } },
    },
  });
  return teams.map(({ inviteCode: _omit, ...t }) => t);
}

export async function setTeamHidden(actor: Actor | null, competitionId: string, teamId: string, hidden: boolean, reason: string) {
  const { user } = await requireCompetitionPermission(actor, competitionId, "participants.manage");
  const res = await db.team.updateMany({ where: { id: teamId, competitionId }, data: { hidden } });
  if (res.count === 0) throw notFound("Team");
  await audit({ actorId: user.id, action: hidden ? "team.hide" : "team.unhide", targetType: "team", targetId: teamId, competitionId, metadata: { reason } });
  await invalidateLeaderboard(competitionId);
}
