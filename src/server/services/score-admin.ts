import "server-only";
import { z } from "zod";
import { db } from "../db";
import { badRequest, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { challengeValue } from "../domain/scoring";
import { competitionCan, getParticipation, parseSubject, requireCompetitionPermission, type Actor } from "./access";
import { invalidateLeaderboard } from "./leaderboard";

export const adjustmentSchema = z.object({
  subjectKey: z.string().regex(/^(team|user):[a-z0-9]+$/),
  points: z.coerce.number().int().min(-100_000).max(100_000).refine((v) => v !== 0, "Adjustment cannot be zero"),
  reason: z.string().trim().min(5).max(500),
});

async function assertSubjectInCompetition(competitionId: string, subjectKey: string) {
  const s = parseSubject(subjectKey);
  const ok =
    s.kind === "team"
      ? await db.team.count({ where: { id: s.id, competitionId } })
      : await db.competitionRegistration.count({ where: { userId: s.id, competitionId } });
  if (!ok) throw notFound("Participant or team in this competition");
  return s;
}

export async function adjustScore(actor: Actor | null, competitionId: string, input: z.infer<typeof adjustmentSchema>) {
  const { user } = await requireCompetitionPermission(actor, competitionId, "score.adjust");
  const data = adjustmentSchema.parse(input);
  const s = await assertSubjectInCompetition(competitionId, data.subjectKey);
  const ev = await db.$transaction(async (tx) => {
    const e = await tx.scoreEvent.create({
      data: {
        competitionId,
        subjectKey: data.subjectKey,
        teamId: s.kind === "team" ? s.id : null,
        userId: s.kind === "user" ? s.id : null,
        type: "ADJUSTMENT",
        points: data.points,
        reason: data.reason,
        createdById: user.id,
      },
    });
    await audit({ actorId: user.id, action: "score.adjust", targetType: "subject", targetId: data.subjectKey, competitionId, metadata: { points: data.points, reason: data.reason, eventId: e.id } }, tx);
    return e;
  });
  await invalidateLeaderboard(competitionId);
  return ev;
}

export interface RecalcDelta {
  subjectKey: string;
  current: number;
  expected: number;
  delta: number;
}

/**
 * Recomputes every subject's expected score from the authoritative facts
 * (solves in order, current challenge values, hint unlock costs, penalties,
 * manual grades, adjustments) and, when `apply` is true, appends a
 * RECALCULATION event for each difference. Idempotent.
 */
export async function recalculateScores(actor: Actor | null, competitionId: string, apply: boolean) {
  const { user, competition } = await requireCompetitionPermission(actor, competitionId, "score.adjust");

  const [challenges, solves, unlocks, wrongCounts, events] = await Promise.all([
    db.challenge.findMany({ where: { competitionId }, select: { id: true, points: true, minPoints: true, decay: true, scoringModel: true, gradingMode: true } }),
    db.solve.findMany({ where: { competitionId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, challengeId: true, subjectKey: true, points: true } }),
    db.hintUnlock.findMany({ where: { competitionId }, select: { subjectKey: true, cost: true } }),
    db.submission.groupBy({ by: ["subjectKey"], where: { competitionId, result: "INCORRECT" }, _count: { _all: true } }),
    db.scoreEvent.findMany({ where: { competitionId }, select: { subjectKey: true, type: true, points: true } }),
  ]);
  const byId = new Map(challenges.map((c) => [c.id, c]));
  const expected = new Map<string, number>();
  const add = (k: string, v: number) => expected.set(k, (expected.get(k) ?? 0) + v);

  const priorPerChallenge = new Map<string, number>();
  for (const s of solves) {
    const c = byId.get(s.challengeId);
    if (!c) continue;
    const prior = priorPerChallenge.get(c.id) ?? 0;
    priorPerChallenge.set(c.id, prior + 1);
    // Manually graded awards are evaluator decisions and are kept as granted.
    add(s.subjectKey, c.gradingMode === "MANUAL" ? s.points : challengeValue(c.scoringModel ?? competition.scoringModel, c, prior));
  }
  if (competition.hintPenaltiesEnabled) for (const u of unlocks) add(u.subjectKey, -u.cost);
  for (const w of wrongCounts) add(w.subjectKey, -competition.wrongSubmissionPenalty * w._count._all);
  for (const e of events) if (e.type === "ADJUSTMENT") add(e.subjectKey, e.points);

  const current = new Map<string, number>();
  for (const e of events) current.set(e.subjectKey, (current.get(e.subjectKey) ?? 0) + e.points);

  const keys = new Set([...expected.keys(), ...current.keys()]);
  const deltas: RecalcDelta[] = [];
  for (const k of keys) {
    const cur = current.get(k) ?? 0;
    const exp = expected.get(k) ?? 0;
    if (cur !== exp) deltas.push({ subjectKey: k, current: cur, expected: exp, delta: exp - cur });
  }

  if (apply && deltas.length > 0) {
    await db.$transaction(async (tx) => {
      for (const d of deltas) {
        const s = parseSubject(d.subjectKey);
        await tx.scoreEvent.create({
          data: {
            competitionId,
            subjectKey: d.subjectKey,
            teamId: s.kind === "team" ? s.id : null,
            userId: s.kind === "user" ? s.id : null,
            type: "RECALCULATION",
            points: d.delta,
            reason: `Recalculation: ledger ${d.current} → expected ${d.expected}`,
            createdById: user.id,
          },
        });
      }
      await audit({ actorId: user.id, action: "score.recalculate", targetType: "competition", targetId: competitionId, competitionId, metadata: { changes: deltas.length } }, tx);
    });
    await invalidateLeaderboard(competitionId);
  } else if (apply) {
    await audit({ actorId: user.id, action: "score.recalculate", targetType: "competition", targetId: competitionId, competitionId, metadata: { changes: 0 } });
  }
  return { applied: apply, deltas };
}

/** Itemized score history — visible to staff and to members of the subject. */
export async function explainScore(actor: Actor | null, competitionId: string, subjectKey: string) {
  if (!actor) throw forbidden();
  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition) throw notFound("Competition");
  const isStaff = await competitionCan(actor, competitionId, "competition.view_staff");
  if (!isStaff) {
    const mine = (await getParticipation(actor.id, competition)).subjectKey;
    if (mine !== subjectKey) throw forbidden();
  }
  if (!/^(team|user):[a-z0-9]+$/.test(subjectKey)) throw badRequest("Invalid subject");
  const events = await db.scoreEvent.findMany({
    where: { competitionId, subjectKey },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      points: true,
      reason: true,
      createdAt: true,
      challenge: { select: { id: true, title: true } },
      user: { select: { displayName: true } },
      createdBy: isStaff ? { select: { displayName: true } } : false,
    },
  });
  return { events, total: events.reduce((a, e) => a + e.points, 0) };
}
