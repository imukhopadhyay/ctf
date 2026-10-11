import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { conflict, isUniqueViolation, notFound } from "../errors";
import { audit } from "../audit";
import {
  achievementCriteriaSchema,
  achievementProgress,
  isAchieved,
  type SolveFact,
} from "../domain/achievement-rules";
import { levelForXp } from "../domain/scoring";
import { requirePlatform, parseSubject, type Actor } from "./access";
import { notifyUser, notifyUsers } from "./notifications";

async function userSolveFacts(userId: string): Promise<SolveFact[]> {
  const solves = await db.solve.findMany({
    where: { userId },
    select: {
      createdAt: true,
      isFirstBlood: true,
      userId: true,
      subjectKey: true,
      challengeId: true,
      challenge: { select: { category: { select: { slug: true } } } },
    },
  });
  const hinted = await db.hintUnlock.findMany({
    where: { subjectKey: { in: [...new Set(solves.map((s) => s.subjectKey))] } },
    select: { subjectKey: true, hint: { select: { challengeId: true } } },
  });
  const hintedSet = new Set(hinted.map((h) => `${h.subjectKey}|${h.hint.challengeId}`));
  return solves.map((s) => ({
    categorySlug: s.challenge.category.slug,
    createdAt: s.createdAt,
    isFirstBlood: s.isFirstBlood,
    usedHint: hintedSet.has(`${s.subjectKey}|${s.challengeId}`),
    solverUserId: s.userId,
  }));
}

async function teamSolveFacts(teamId: string): Promise<SolveFact[]> {
  const subjectKey = `team:${teamId}`;
  const [solves, hinted] = await Promise.all([
    db.solve.findMany({
      where: { subjectKey },
      select: { createdAt: true, isFirstBlood: true, userId: true, challengeId: true, challenge: { select: { category: { select: { slug: true } } } } },
    }),
    db.hintUnlock.findMany({ where: { subjectKey }, select: { hint: { select: { challengeId: true } } } }),
  ]);
  const hintedSet = new Set(hinted.map((h) => h.hint.challengeId));
  return solves.map((s) => ({
    categorySlug: s.challenge.category.slug,
    createdAt: s.createdAt,
    isFirstBlood: s.isFirstBlood,
    usedHint: hintedSet.has(s.challengeId),
    solverUserId: s.userId,
  }));
}

/** Evaluates achievements after a scoring event. Invoked by the worker. */
export async function evaluateAchievements(input: { competitionId: string; subjectKey: string; userId: string }) {
  const achievements = await db.achievement.findMany({ where: { enabled: true } });
  const awarded: string[] = [];

  const userFacts = await userSolveFacts(input.userId);
  for (const a of achievements.filter((x) => x.scope === "USER")) {
    const criteria = achievementCriteriaSchema.safeParse(a.criteria);
    if (!criteria.success || !isAchieved(criteria.data, userFacts)) continue;
    try {
      await db.userAchievement.create({ data: { userId: input.userId, achievementId: a.id, competitionId: input.competitionId } });
      awarded.push(a.name);
      await notifyUser(input.userId, { type: "achievement", title: `Achievement unlocked: ${a.name}`, body: a.description, link: "/profile" });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }

  const subject = parseSubject(input.subjectKey);
  if (subject.kind === "team") {
    const teamFacts = await teamSolveFacts(subject.id);
    const members = await db.teamMembership.findMany({ where: { teamId: subject.id }, select: { userId: true } });
    for (const a of achievements.filter((x) => x.scope === "TEAM")) {
      const criteria = achievementCriteriaSchema.safeParse(a.criteria);
      if (!criteria.success || !isAchieved(criteria.data, teamFacts)) continue;
      try {
        await db.teamAchievement.create({ data: { teamId: subject.id, achievementId: a.id } });
        awarded.push(`team:${a.name}`);
        await notifyUsers(members.map((m) => m.userId), { type: "achievement", title: `Team achievement: ${a.name}`, body: a.description });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
  }
  return awarded;
}

/** Profile gamification summary: XP, level, badges with progress. */
export async function getUserProgress(userId: string) {
  const [achievements, earned, solvePoints, facts] = await Promise.all([
    db.achievement.findMany({ where: { enabled: true, scope: "USER" }, orderBy: { xp: "asc" } }),
    db.userAchievement.findMany({ where: { userId }, include: { achievement: true }, orderBy: { awardedAt: "desc" } }),
    db.solve.aggregate({ where: { userId }, _sum: { points: true }, _count: { _all: true } }),
    userSolveFacts(userId),
  ]);
  const earnedIds = new Set(earned.map((e) => e.achievementId));
  const xp = (solvePoints._sum.points ?? 0) + earned.reduce((a, e) => a + e.achievement.xp, 0);
  return {
    xp,
    ...levelForXp(xp),
    totalSolves: solvePoints._count._all,
    firstBloods: facts.filter((f) => f.isFirstBlood).length,
    categoryCounts: facts.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.categorySlug]: (acc[f.categorySlug] ?? 0) + 1 }), {}),
    earned: earned.map((e) => ({ key: e.achievement.key, name: e.achievement.name, description: e.achievement.description, icon: e.achievement.icon, xp: e.achievement.xp, awardedAt: e.awardedAt })),
    available: achievements
      .filter((a) => !earnedIds.has(a.id))
      .map((a) => {
        const c = achievementCriteriaSchema.safeParse(a.criteria);
        const [current, target] = c.success ? achievementProgress(c.data, facts) : [0, 1];
        return { key: a.key, name: a.name, description: a.description, icon: a.icon, xp: a.xp, current: Math.min(current, target), target };
      }),
  };
}

// ───────────── Administration ─────────────

export const achievementInputSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,40}$/),
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().min(3).max(280),
  icon: z.string().trim().max(40).default("award"),
  xp: z.coerce.number().int().min(0).max(10_000).default(50),
  scope: z.enum(["USER", "TEAM"]).default("USER"),
  criteria: achievementCriteriaSchema,
  enabled: z.boolean().default(true),
});

export async function listAchievementsAdmin(actor: Actor | null) {
  await requirePlatform(actor, "platform.achievements.manage");
  return db.achievement.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { users: true, teams: true } } } });
}

export async function upsertAchievement(actor: Actor | null, input: z.infer<typeof achievementInputSchema>, id?: string) {
  const user = await requirePlatform(actor, "platform.achievements.manage");
  const data = achievementInputSchema.parse(input);
  const payload = { ...data, criteria: data.criteria as Prisma.InputJsonValue };
  try {
    const a = id
      ? await db.achievement.update({ where: { id }, data: payload }).catch(() => {
          throw notFound("Achievement");
        })
      : await db.achievement.create({ data: payload });
    await audit({ actorId: user.id, action: id ? "achievement.update" : "achievement.create", targetType: "achievement", targetId: a.id, metadata: { key: a.key } });
    return a;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("An achievement with that key already exists.");
    throw e;
  }
}
