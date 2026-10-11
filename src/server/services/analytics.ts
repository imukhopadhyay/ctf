import "server-only";
import { db } from "../db";
import { artifactStore } from "../storage";
import { requireCompetitionPermission, requirePlatform, type Actor } from "./access";

/** Public landing-page statistics — real counts only. */
export async function publicStats() {
  const [participants, solves, competitions, challenges] = await Promise.all([
    db.user.count({ where: { role: "PARTICIPANT", status: "ACTIVE" } }),
    db.solve.count(),
    db.competition.count({ where: { status: { in: ["SCHEDULED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] } } }),
    db.challenge.count({ where: { status: "PUBLISHED", competition: { status: { not: "DRAFT" } } } }),
  ]);
  return { participants, solves, competitions, challenges };
}

/** Organizer analytics for one competition. Every figure is derived from stored records. */
export async function competitionAnalytics(actor: Actor | null, competitionId: string) {
  const { competition } = await requireCompetitionPermission(actor, competitionId, "analytics.view");

  const [registrations, teams, challenges, solvesByChallenge, subsByResult, attemptsByChallenge, perDay, security, instancesByStatus, ledger] =
    await Promise.all([
      db.competitionRegistration.groupBy({ by: ["status"], where: { competitionId }, _count: { _all: true } }),
      db.team.count({ where: { competitionId } }),
      db.challenge.findMany({
        where: { competitionId },
        select: { id: true, title: true, status: true, difficulty: true, points: true, category: { select: { slug: true, name: true } } },
      }),
      db.solve.groupBy({ by: ["challengeId"], where: { competitionId }, _count: { _all: true } }),
      db.submission.groupBy({ by: ["result"], where: { competitionId }, _count: { _all: true } }),
      // distinct subjects who attempted each challenge
      db.$queryRaw<{ challengeId: string; attempters: bigint }[]>`
        SELECT "challengeId", COUNT(DISTINCT "subjectKey") AS attempters
        FROM "Submission" WHERE "competitionId" = ${competitionId} GROUP BY "challengeId"`,
      db.$queryRaw<{ day: Date; total: bigint; correct: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE result = 'CORRECT') AS correct
        FROM "Submission" WHERE "competitionId" = ${competitionId}
        GROUP BY 1 ORDER BY 1`,
      db.securityEvent.groupBy({ by: ["type"], where: { competitionId }, _count: { _all: true } }),
      db.challengeInstance.groupBy({ by: ["status"], where: { competitionId }, _count: { _all: true } }),
      db.scoreEvent.groupBy({ by: ["subjectKey"], where: { competitionId }, _sum: { points: true } }),
    ]);

  const solveMap = new Map(solvesByChallenge.map((s) => [s.challengeId, s._count._all]));
  const attemptMap = new Map(attemptsByChallenge.map((a) => [a.challengeId, Number(a.attempters)]));
  const perChallenge = challenges.map((c) => {
    const solves = solveMap.get(c.id) ?? 0;
    const attempters = attemptMap.get(c.id) ?? 0;
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      difficulty: c.difficulty,
      category: c.category.name,
      categorySlug: c.category.slug,
      points: c.points,
      solves,
      attempters,
      // Share of subjects who tried but have not solved — a proxy for abandonment/frustration.
      abandonmentRate: attempters > 0 ? Math.max(0, (attempters - solves) / attempters) : 0,
    };
  });

  const byCategory = new Map<string, { category: string; solves: number; challenges: number }>();
  for (const c of perChallenge) {
    const row = byCategory.get(c.categorySlug) ?? { category: c.category, solves: 0, challenges: 0 };
    row.solves += c.solves;
    row.challenges += 1;
    byCategory.set(c.categorySlug, row);
  }
  const difficulty = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].map((d) => ({
    difficulty: d,
    count: challenges.filter((c) => c.difficulty === d).length,
  }));
  const statusCounts = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED", "RETIRED"].map((s) => ({
    status: s,
    count: challenges.filter((c) => c.status === s).length,
  }));
  const resultCount = (r: string) => subsByResult.find((s) => s.result === r)?._count._all ?? 0;
  const totalSubs = subsByResult.reduce((a, s) => a + s._count._all, 0);
  const correct = resultCount("CORRECT");
  const incorrect = resultCount("INCORRECT");

  // Score distribution histogram (10 buckets).
  const scores = ledger.map((l) => l._sum.points ?? 0);
  const max = Math.max(0, ...scores);
  const bucketSize = Math.max(1, Math.ceil((max + 1) / 10));
  const histogram = Array.from({ length: 10 }, (_, i) => ({ range: `${i * bucketSize}–${(i + 1) * bucketSize - 1}`, count: 0 }));
  for (const s of scores) histogram[Math.min(9, Math.max(0, Math.floor(s / bucketSize)))]!.count++;

  const sortedBySolves = [...perChallenge].filter((c) => c.status === "PUBLISHED").sort((a, b) => b.solves - a.solves);
  return {
    competition: { id: competition.id, name: competition.name, slug: competition.slug, status: competition.status, mode: competition.mode },
    participants: {
      approved: registrations.find((r) => r.status === "APPROVED")?._count._all ?? 0,
      pending: registrations.find((r) => r.status === "PENDING")?._count._all ?? 0,
      teams,
    },
    submissions: {
      total: totalSubs,
      correct,
      incorrect,
      acceptanceRate: correct + incorrect > 0 ? correct / (correct + incorrect) : 0,
      pendingReview: resultCount("PENDING_REVIEW"),
    },
    totalSolves: solvesByChallenge.reduce((a, s) => a + s._count._all, 0),
    perChallenge,
    byCategory: [...byCategory.values()],
    difficulty,
    statusCounts,
    trend: perDay.map((d) => ({ day: d.day.toISOString().slice(0, 10), total: Number(d.total), correct: Number(d.correct) })),
    mostSolved: sortedBySolves.slice(0, 5),
    leastSolved: [...sortedBySolves].reverse().slice(0, 5),
    scoreHistogram: histogram,
    security: security.map((s) => ({ type: s.type, count: s._count._all })),
    instances: instancesByStatus.map((i) => ({ status: i.status, count: i._count._all })),
  };
}

/** Platform-level overview for administrators. */
export async function platformOverview(actor: Actor | null) {
  await requirePlatform(actor, "platform.audit.view");
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [usersByRole, competitionsByStatus, solves, submissions24h, security24h, activeInstances, artifacts, storage, jobs] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    db.competition.groupBy({ by: ["status"], _count: { _all: true } }),
    db.solve.count(),
    db.submission.count({ where: { createdAt: { gte: since } } }),
    db.securityEvent.groupBy({ by: ["severity"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.challengeInstance.count({ where: { status: { in: ["PROVISIONING", "RUNNING"] } } }),
    db.challengeArtifact.aggregate({ _count: { _all: true }, _sum: { sizeBytes: true } }),
    artifactStore().usageBytes(),
    db.job.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return {
    usersByRole: usersByRole.map((u) => ({ role: u.role, count: u._count._all })),
    competitionsByStatus: competitionsByStatus.map((c) => ({ status: c.status, count: c._count._all })),
    solves,
    submissions24h,
    security24h: security24h.map((s) => ({ severity: s.severity, count: s._count._all })),
    activeInstances,
    artifacts: { records: artifacts._count._all, referencedBytes: artifacts._sum.sizeBytes ?? 0, storedBytes: storage.bytes, storedObjects: storage.objects },
    jobs: jobs.map((j) => ({ status: j.status, count: j._count._all })),
  };
}
