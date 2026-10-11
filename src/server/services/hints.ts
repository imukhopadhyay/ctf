import "server-only";
import { db } from "../db";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { acceptsSubmissions } from "../domain/competition-state";
import { rateLimit, LIMITS } from "../ratelimit";
import { assertUser, parseSubject, type Actor } from "./access";
import { isConcluded, loadPlayableChallenge } from "./challenges";
import { lockSubjectChallenge } from "./submissions";
import { invalidateLeaderboard } from "./leaderboard";

/**
 * Unlocks a hint for the caller's scoring subject. Idempotent: unlocking an
 * already-unlocked hint returns it without charging again.
 */
export async function unlockHint(actor: Actor | null, competitionId: string, challengeId: string, hintId: string) {
  assertUser(actor);
  const { competition, challenge, participation, isStaff } = await loadPlayableChallenge(actor, competitionId, challengeId);
  const hint = await db.hint.findFirst({ where: { id: hintId, challengeId } });
  if (!hint) throw notFound("Hint");
  if (isStaff || isConcluded(competition)) return { hint: { id: hint.id, title: hint.title, content: hint.content }, cost: 0, alreadyUnlocked: true };

  const subjectKey = participation.subjectKey;
  if (!subjectKey) throw badRequest("Join a team (team mode) or wait for registration approval first.");
  if (!acceptsSubmissions(competition, new Date())) throw badRequest("Hints can only be unlocked while the competition is active.");
  const rl = await rateLimit(`hint:${actor.id}`, LIMITS.hintUnlock.limit, LIMITS.hintUnlock.window);
  if (!rl.allowed) throw new AppError("RATE_LIMITED", "Too many hint requests.", undefined, rl.retryAfterSeconds);
  if (hint.availableAfter && hint.availableAfter > new Date()) throw forbidden("This hint is not available yet.");

  const subject = parseSubject(subjectKey);
  const teamId = subject.kind === "team" ? subject.id : null;

  const result = await db.$transaction(async (tx) => {
    await lockSubjectChallenge(tx, subjectKey, challengeId);
    const existing = await tx.hintUnlock.findUnique({ where: { hintId_subjectKey: { hintId, subjectKey } } });
    if (existing) return { cost: 0, alreadyUnlocked: true };

    if (hint.requiresPrevious) {
      const previous = await tx.hint.findFirst({
        where: { challengeId, OR: [{ order: { lt: hint.order } }, { order: hint.order, createdAt: { lt: hint.createdAt } }] },
        orderBy: [{ order: "desc" }, { createdAt: "desc" }],
      });
      if (previous) {
        const prevUnlocked = await tx.hintUnlock.findUnique({ where: { hintId_subjectKey: { hintId: previous.id, subjectKey } } });
        if (!prevUnlocked) throw forbidden("Unlock the previous hint first.");
      }
    }
    if (hint.minAttempts > 0) {
      const attempts = await tx.submission.count({ where: { challengeId, subjectKey, result: "INCORRECT" } });
      if (attempts < hint.minAttempts)
        throw forbidden(`This hint unlocks after ${hint.minAttempts} incorrect attempt(s).`);
    }
    const solved = await tx.solve.findUnique({ where: { challengeId_subjectKey: { challengeId, subjectKey } } });
    const cost = competition.hintPenaltiesEnabled && !solved ? hint.cost : 0;

    const unlock = await tx.hintUnlock.create({
      data: { hintId, competitionId, subjectKey, userId: actor.id, teamId, cost },
    });
    if (cost > 0) {
      await tx.scoreEvent.create({
        data: {
          competitionId,
          subjectKey,
          userId: actor.id,
          teamId,
          type: "HINT_PENALTY",
          points: -cost,
          challengeId,
          refId: unlock.id,
          reason: `Unlocked hint "${hint.title}" on "${challenge.title}"`,
        },
      });
    }
    await audit({ actorId: actor.id, action: "hint.unlock", targetType: "hint", targetId: hintId, competitionId, metadata: { subjectKey, cost } }, tx);
    return { cost, alreadyUnlocked: false };
  });
  if (result.cost > 0) await invalidateLeaderboard(competitionId);
  return { hint: { id: hint.id, title: hint.title, content: hint.content }, ...result };
}
