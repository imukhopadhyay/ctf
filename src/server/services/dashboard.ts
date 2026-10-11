import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";
import { getParticipation, type Actor } from "./access";
import { listChallenges } from "./challenges";
import { getStandings } from "./leaderboard";
import { getUserProgress } from "./achievements";
import { getMyTeam } from "./teams";
import { getSettings } from "./settings";

const DIFF_ORDER = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2, EXPERT: 3 } as const;

/** Everything the participant dashboard needs, derived from real records. */
export async function participantDashboard(actor: Actor) {
  const regs = await db.competitionRegistration.findMany({
    where: { userId: actor.id, status: { in: ["APPROVED", "PENDING"] } },
    include: { competition: true },
    orderBy: { createdAt: "desc" },
  });
  const live = regs.filter((r) => ["ACTIVE", "PAUSED", "SCHEDULED"].includes(r.competition.status));
  const current = live.find((r) => r.competition.status === "ACTIVE" && r.status === "APPROVED") ?? live[0] ?? null;

  let focus = null;
  if (current && current.status === "APPROVED" && current.competition.status !== "SCHEDULED") {
    const c = current.competition;
    const [catalogue, standings, team, announcements, participation] = await Promise.all([
      listChallenges(actor, c.id),
      getStandings(actor, c.id),
      c.mode === "TEAM" ? getMyTeam(actor, c.id) : Promise.resolve(null),
      db.announcement.findMany({ where: { competitionId: c.id }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 3 }),
      getParticipation(actor.id, c),
    ]);
    const challenges = catalogue.challenges;
    const byCategory = new Map<string, { name: string; slug: string; solved: number; total: number }>();
    for (const ch of challenges) {
      const row = byCategory.get(ch.category.slug) ?? { name: ch.category.name, slug: ch.category.slug, solved: 0, total: 0 };
      row.total++;
      if (ch.solved) row.solved++;
      byCategory.set(ch.category.slug, row);
    }
    const weakest = [...byCategory.values()].sort((a, b) => a.solved / a.total - b.solved / b.total);
    const weakRank = new Map(weakest.map((w, i) => [w.slug, i]));
    const recommended = challenges
      .filter((ch) => !ch.solved && !ch.locked && !ch.closed)
      .sort((a, b) => DIFF_ORDER[a.difficulty as keyof typeof DIFF_ORDER] - DIFF_ORDER[b.difficulty as keyof typeof DIFF_ORDER] || (weakRank.get(a.category.slug) ?? 0) - (weakRank.get(b.category.slug) ?? 0) || b.solves - a.solves)
      .slice(0, 4);
    const me = standings.rows.find((r) => r.isMe) ?? null;
    const recent = participation.subjectKey
      ? await db.submission.findMany({
          where: { competitionId: c.id, subjectKey: participation.subjectKey },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, result: true, createdAt: true, challenge: { select: { id: true, title: true } }, user: { select: { displayName: true } }, solve: { select: { points: true } } },
        })
      : [];
    focus = {
      competition: c,
      participation,
      rank: me?.rank ?? null,
      points: me?.points ?? 0,
      totalSubjects: standings.rows.length,
      frozen: standings.frozen,
      solved: challenges.filter((x) => x.solved).length,
      available: challenges.length,
      categories: [...byCategory.values()],
      recommended,
      recent,
      team: team?.team ?? null,
      announcements,
    };
  }

  const settings = await getSettings();
  let daily = null;
  if (settings.dailyChallengeEnabled && settings.practiceEnabled) {
    const practice = await db.challenge.findMany({
      where: { status: "PUBLISHED", competition: { isPractice: true, status: "ACTIVE" } },
      select: { id: true, title: true, difficulty: true, points: true, competition: { select: { slug: true, name: true } }, category: { select: { slug: true, name: true } } },
      orderBy: { id: "asc" },
    });
    if (practice.length) {
      const day = new Date().toISOString().slice(0, 10);
      const idx = parseInt(createHash("sha256").update(day).digest("hex").slice(0, 8), 16) % practice.length;
      daily = practice[idx]!;
    }
  }

  return {
    registrations: regs.map((r) => ({ status: r.status, competition: { id: r.competition.id, slug: r.competition.slug, name: r.competition.name, status: r.competition.status, startsAt: r.competition.startsAt, endsAt: r.competition.endsAt } })),
    focus,
    progress: await getUserProgress(actor.id),
    daily,
  };
}
