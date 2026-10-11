import "server-only";
import { z } from "zod";
import type { Competition } from "@prisma/client";
import { db, type Tx } from "../db";
import { env } from "../env";
import { badRequest, isUniqueViolation, notFound } from "../errors";
import { audit, securityEvent } from "../audit";
import { hashIp } from "../crypto";
import {
  instanceFlagMatches,
  matchStaticFlag,
  submissionFingerprint,
  MAX_FLAG_LENGTH,
} from "../domain/flag-match";
import { challengeValue } from "../domain/scoring";
import { acceptsSubmissions } from "../domain/competition-state";
import { rateLimit, LIMITS } from "../ratelimit";
import { loadPlayableChallenge } from "./challenges";
import { assertUser, parseSubject, requireCompetitionPermission, type Actor } from "./access";
import { enqueueJob } from "./jobs";
import { invalidateLeaderboard } from "./leaderboard";

export const submitSchema = z.object({ flag: z.string().min(1).max(MAX_FLAG_LENGTH) });
export const writeupSchema = z.object({ writeup: z.string().trim().min(20).max(20_000) });

export type SubmissionStatus =
  | "correct"
  | "incorrect"
  | "already_solved"
  | "unavailable"
  | "limit_reached"
  | "rate_limited"
  | "pending_review";

export interface SubmissionOutcome {
  status: SubmissionStatus;
  message: string;
  submissionId?: string;
  pointsAwarded?: number;
  firstBlood?: boolean;
  attemptsUsed?: number;
  attemptLimit?: number | null;
  retryAfterSeconds?: number;
  scoreEvent?: { id: string; type: string; points: number; reason: string; createdAt: Date };
}

const MESSAGES: Record<SubmissionStatus, string> = {
  correct: "Correct flag!",
  incorrect: "Incorrect flag.",
  already_solved: "Already solved.",
  unavailable: "Challenge unavailable.",
  limit_reached: "Submission limit reached.",
  rate_limited: "Too many submissions. Please wait before trying again.",
  pending_review: "Write-up submitted for evaluation.",
};

/** Serializes all scoring-relevant operations of one subject on one challenge. */
export async function lockSubjectChallenge(tx: Tx, subjectKey: string, challengeId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${subjectKey}|${challengeId}`}, 0))`;
}

function teamIdOf(subjectKey: string): string | null {
  const s = parseSubject(subjectKey);
  return s.kind === "team" ? s.id : null;
}

function submissionWindowOpen(competition: Competition, closeAt: Date | null, now: Date) {
  if (closeAt && closeAt <= now) return false;
  return acceptsSubmissions(competition, now);
}

export async function submitFlag(
  actor: Actor | null,
  competitionId: string,
  challengeId: string,
  rawFlag: string,
  meta: { ip: string | null },
): Promise<SubmissionOutcome> {
  assertUser(actor);
  const flag = submitSchema.parse({ flag: rawFlag }).flag;
  const { competition, challenge, participation, isStaff } = await loadPlayableChallenge(actor, competitionId, challengeId);
  const now = new Date();
  const out = (status: SubmissionStatus, extra: Partial<SubmissionOutcome> = {}): SubmissionOutcome => ({
    status,
    message: MESSAGES[status],
    ...extra,
  });

  if (isStaff) throw badRequest("Staff accounts cannot submit flags. Use the flag tester in the challenge editor.");
  if (challenge.gradingMode !== "FLAG") throw badRequest("This challenge is graded manually; submit a write-up instead.");
  const subjectKey = participation.subjectKey;
  if (!subjectKey) {
    throw badRequest(
      competition.mode === "TEAM" ? "Join or create a team before submitting flags." : "Your registration is not approved yet.",
    );
  }
  if (!submissionWindowOpen(competition, challenge.closeAt, now)) return out("unavailable");

  // Rate limits: per user+challenge, per subject, per IP.
  for (const [key, lim] of [
    [`sub:uc:${actor.id}:${challengeId}`, LIMITS.submitPerChallenge],
    [`sub:s:${subjectKey}`, LIMITS.submitPerSubject],
    [`sub:ip:${meta.ip}`, LIMITS.submitPerIp],
  ] as const) {
    const rl = await rateLimit(key, lim.limit, lim.window);
    if (!rl.allowed) {
      await securityEvent({ type: "RATE_LIMIT", userId: actor.id, competitionId, ip: meta.ip, details: { limiter: key.split(":").slice(0, 2).join(":"), challengeId } });
      return out("rate_limited", { retryAfterSeconds: rl.retryAfterSeconds });
    }
  }

  const pepper = env().FLAG_PEPPER;
  const instanceSecret = env().INSTANCE_FLAG_SECRET;
  const fingerprint = submissionFingerprint(pepper, flag);
  const attemptLimit = challenge.attemptLimit ?? competition.defaultAttemptLimit ?? null;
  const teamId = teamIdOf(subjectKey);
  const ipHash = hashIp(meta.ip);

  const flags = await db.flagConfiguration.findMany({ where: { challengeId, active: true } });
  const staticFlags = flags.filter((f) => f.type === "STATIC" && f.digest);
  const hasInstanceFlag = flags.some((f) => f.type === "INSTANCE");

  let sharingSuspect: { otherSubject: string; instanceId: string } | null = null;

  const result = await db.$transaction(
    async (tx): Promise<SubmissionOutcome> => {
      await lockSubjectChallenge(tx, subjectKey, challengeId);

      const existing = await tx.solve.findUnique({ where: { challengeId_subjectKey: { challengeId, subjectKey } } });
      if (existing) {
        const s = await tx.submission.create({
          data: { competitionId, challengeId, userId: actor.id, teamId, subjectKey, result: "ALREADY_SOLVED", fingerprint, ipHash },
        });
        return out("already_solved", { submissionId: s.id });
      }

      const attemptsUsed = await tx.submission.count({ where: { challengeId, subjectKey, result: "INCORRECT" } });
      if (attemptLimit !== null && attemptsUsed >= attemptLimit) {
        return out("limit_reached", { attemptsUsed, attemptLimit });
      }

      // ── Evaluate ──
      let matchedFlagId: string | null = matchStaticFlag(
        pepper,
        flag,
        staticFlags.map((f) => ({ ...f, digest: f.digest! })),
        now,
      );
      let matchedInstanceId: string | null = null;
      if (!matchedFlagId && hasInstanceFlag) {
        const instanceFlag = flags.find((f) => f.type === "INSTANCE")!;
        const instances = await tx.challengeInstance.findMany({
          where: { challengeId },
          select: { id: true, subjectKey: true },
        });
        for (const inst of instances) {
          if (instanceFlagMatches(instanceSecret, flag, inst.id, challengeId, inst.subjectKey)) {
            if (inst.subjectKey === subjectKey) {
              matchedFlagId = instanceFlag.id;
              matchedInstanceId = inst.id;
            } else {
              sharingSuspect = { otherSubject: inst.subjectKey, instanceId: inst.id };
            }
          }
        }
      }

      if (!matchedFlagId) {
        const s = await tx.submission.create({
          data: { competitionId, challengeId, userId: actor.id, teamId, subjectKey, result: "INCORRECT", fingerprint, ipHash },
        });
        let scoreEvent: SubmissionOutcome["scoreEvent"];
        if (competition.wrongSubmissionPenalty > 0) {
          const ev = await tx.scoreEvent.create({
            data: {
              competitionId,
              subjectKey,
              userId: actor.id,
              teamId,
              type: "WRONG_SUBMISSION_PENALTY",
              points: -competition.wrongSubmissionPenalty,
              challengeId,
              refId: s.id,
              reason: `Incorrect submission penalty on "${challenge.title}"`,
            },
          });
          scoreEvent = { id: ev.id, type: ev.type, points: ev.points, reason: ev.reason, createdAt: ev.createdAt };
        }
        return out("incorrect", { submissionId: s.id, attemptsUsed: attemptsUsed + 1, attemptLimit, scoreEvent });
      }

      // ── Correct: serialize solves on this challenge for first blood / dynamic value ──
      await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
      const priorSolves = await tx.solve.count({ where: { challengeId } });
      const points = challengeValue(challenge.scoringModel ?? competition.scoringModel, challenge, priorSolves);
      const isFirstBlood = priorSolves === 0;

      const submission = await tx.submission.create({
        data: {
          competitionId,
          challengeId,
          userId: actor.id,
          teamId,
          subjectKey,
          result: "CORRECT",
          fingerprint,
          flagId: matchedFlagId,
          instanceId: matchedInstanceId,
          ipHash,
        },
      });
      const solve = await tx.solve.create({
        data: { competitionId, challengeId, subjectKey, userId: actor.id, teamId, submissionId: submission.id, points, isFirstBlood },
      });
      const ev = await tx.scoreEvent.create({
        data: {
          competitionId,
          subjectKey,
          userId: actor.id,
          teamId,
          type: "SOLVE",
          points,
          challengeId,
          refId: solve.id,
          reason: `Solved "${challenge.title}"${isFirstBlood ? " (first blood)" : ""}${priorSolves > 0 && points !== challenge.points ? ` at dynamic value after ${priorSolves} prior solve(s)` : ""}`,
        },
      });
      await audit(
        {
          actorId: actor.id,
          action: "score.solve",
          targetType: "challenge",
          targetId: challengeId,
          competitionId,
          metadata: { subjectKey, points, isFirstBlood, solveId: solve.id },
          ip: meta.ip,
        },
        tx,
      );
      await enqueueJob("achievements.evaluate", { competitionId, subjectKey, userId: actor.id }, { tx });
      if (isFirstBlood) await enqueueJob("notify.first_blood", { competitionId, challengeId, solveId: solve.id }, { tx });
      return out("correct", {
        submissionId: submission.id,
        pointsAwarded: points,
        firstBlood: isFirstBlood,
        scoreEvent: { id: ev.id, type: ev.type, points: ev.points, reason: ev.reason, createdAt: ev.createdAt },
      });
    },
    { timeout: 15_000 },
  ).catch((e) => {
    // The unique constraint is the last line of defence against duplicate solves.
    if (isUniqueViolation(e)) return out("already_solved");
    throw e;
  });

  if (sharingSuspect) {
    const s = sharingSuspect as { otherSubject: string; instanceId: string };
    await securityEvent({
      type: "FLAG_SHARING_SUSPECTED",
      severity: "HIGH",
      userId: actor.id,
      competitionId,
      ip: meta.ip,
      details: { challengeId, submittingSubject: subjectKey, flagOwnerSubject: s.otherSubject, instanceId: s.instanceId },
    });
  }
  if (result.status === "limit_reached") {
    await securityEvent({ type: "SUBMISSION_LIMIT", userId: actor.id, competitionId, ip: meta.ip, details: { challengeId } });
  }
  if (result.status === "correct" || result.scoreEvent) await invalidateLeaderboard(competitionId);
  return result;
}

// ───────────── Manual grading ─────────────

export async function submitWriteup(actor: Actor | null, competitionId: string, challengeId: string, writeup: string, meta: { ip: string | null }) {
  assertUser(actor);
  const data = writeupSchema.parse({ writeup });
  const { competition, challenge, participation, isStaff } = await loadPlayableChallenge(actor, competitionId, challengeId);
  if (isStaff) throw badRequest("Staff accounts cannot submit write-ups.");
  if (challenge.gradingMode !== "MANUAL") throw badRequest("This challenge is graded by flag.");
  const subjectKey = participation.subjectKey;
  if (!subjectKey) throw badRequest("You must be an approved participant (and on a team in team mode).");
  if (!submissionWindowOpen(competition, challenge.closeAt, new Date())) return { status: "unavailable" as const, message: MESSAGES.unavailable };
  const rl = await rateLimit(`writeup:${actor.id}:${challengeId}`, 5, 600);
  if (!rl.allowed) return { status: "rate_limited" as const, message: MESSAGES.rate_limited, retryAfterSeconds: rl.retryAfterSeconds };

  return db.$transaction(async (tx) => {
    await lockSubjectChallenge(tx, subjectKey, challengeId);
    if (await tx.solve.findUnique({ where: { challengeId_subjectKey: { challengeId, subjectKey } } }))
      return { status: "already_solved" as const, message: MESSAGES.already_solved };
    const pending = await tx.submission.count({ where: { challengeId, subjectKey, result: "PENDING_REVIEW" } });
    if (pending > 0) throw badRequest("A write-up is already awaiting evaluation.");
    const s = await tx.submission.create({
      data: {
        competitionId,
        challengeId,
        userId: actor.id,
        teamId: teamIdOf(subjectKey),
        subjectKey,
        result: "PENDING_REVIEW",
        writeup: data.writeup,
        ipHash: hashIp(meta.ip),
      },
    });
    return { status: "pending_review" as const, message: MESSAGES.pending_review, submissionId: s.id };
  });
}

export const gradeSchema = z.object({
  accept: z.boolean(),
  points: z.coerce.number().int().min(0).max(10_000).optional(),
  feedback: z.string().trim().max(5_000).default(""),
});

export async function gradeSubmission(actor: Actor | null, submissionId: string, input: z.infer<typeof gradeSchema>) {
  assertUser(actor);
  const data = gradeSchema.parse(input);
  const submission = await db.submission.findUnique({ where: { id: submissionId }, include: { challenge: true } });
  if (!submission) throw notFound("Submission");
  const { user } = await requireCompetitionPermission(actor, submission.competitionId, "submission.grade");
  if (submission.result !== "PENDING_REVIEW") throw badRequest("Submission has already been graded.");
  if (submission.userId === user.id) throw badRequest("You cannot grade your own submission.");
  const points = Math.min(data.points ?? submission.challenge.points, submission.challenge.points);

  const outcome = await db.$transaction(async (tx) => {
    await lockSubjectChallenge(tx, submission.subjectKey, submission.challengeId);
    const fresh = await tx.submission.findUniqueOrThrow({ where: { id: submissionId } });
    if (fresh.result !== "PENDING_REVIEW") throw badRequest("Submission has already been graded.");
    await tx.submission.update({
      where: { id: submissionId },
      data: { result: data.accept ? "CORRECT" : "REJECTED_REVIEW", gradedById: user.id, gradedAt: new Date(), feedback: data.feedback },
    });
    if (data.accept) {
      const priorSolves = await tx.solve.count({ where: { challengeId: submission.challengeId } });
      const solve = await tx.solve.create({
        data: {
          competitionId: submission.competitionId,
          challengeId: submission.challengeId,
          subjectKey: submission.subjectKey,
          userId: submission.userId,
          teamId: submission.teamId,
          submissionId,
          points,
          isFirstBlood: priorSolves === 0,
        },
      });
      await tx.scoreEvent.create({
        data: {
          competitionId: submission.competitionId,
          subjectKey: submission.subjectKey,
          userId: submission.userId,
          teamId: submission.teamId,
          type: "MANUAL_GRADE",
          points,
          challengeId: submission.challengeId,
          refId: solve.id,
          reason: `Write-up accepted for "${submission.challenge.title}"`,
          createdById: user.id,
        },
      });
      await enqueueJob("achievements.evaluate", { competitionId: submission.competitionId, subjectKey: submission.subjectKey, userId: submission.userId }, { tx });
    }
    await audit({ actorId: user.id, action: "submission.grade", targetType: "submission", targetId: submissionId, competitionId: submission.competitionId, metadata: { accept: data.accept, points: data.accept ? points : 0 } }, tx);
    return { accepted: data.accept, points: data.accept ? points : 0 };
  });
  await db.notification.create({
    data: {
      userId: submission.userId,
      type: "submission.graded",
      title: `Your write-up for "${submission.challenge.title}" was ${data.accept ? "accepted" : "not accepted"}`,
      body: data.feedback,
    },
  });
  await invalidateLeaderboard(submission.competitionId);
  return outcome;
}

export async function listPendingGrading(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "submission.grade");
  return db.submission.findMany({
    where: { competitionId, result: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      writeup: true,
      createdAt: true,
      subjectKey: true,
      challenge: { select: { id: true, title: true, points: true } },
      user: { select: { username: true, displayName: true } },
      team: { select: { name: true } },
    },
  });
}

// ───────────── History ─────────────

/** The user's own submissions (and, in team mode, their team's). Never exposes fingerprints. */
export async function mySubmissions(actor: Actor | null, opts: { competitionId?: string; take?: number; cursor?: string } = {}) {
  assertUser(actor);
  const memberships = await db.teamMembership.findMany({ where: { userId: actor.id }, select: { teamId: true } });
  const take = Math.min(opts.take ?? 25, 100);
  const rows = await db.submission.findMany({
    where: {
      ...(opts.competitionId ? { competitionId: opts.competitionId } : {}),
      OR: [{ userId: actor.id }, { teamId: { in: memberships.map((m) => m.teamId) } }],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      result: true,
      createdAt: true,
      feedback: true,
      challenge: { select: { id: true, title: true, competition: { select: { slug: true, name: true } } } },
      user: { select: { username: true, displayName: true } },
      solve: { select: { points: true, isFirstBlood: true } },
    },
  });
  const hasMore = rows.length > take;
  return { items: rows.slice(0, take), nextCursor: hasMore ? rows[take - 1]!.id : null };
}

/** Staff view of all submissions in a competition (for disputes / anti-cheat). */
export async function competitionSubmissions(
  actor: Actor | null,
  competitionId: string,
  opts: { take?: number; cursor?: string; result?: string; challengeId?: string } = {},
) {
  await requireCompetitionPermission(actor, competitionId, "submission.view_all");
  const take = Math.min(opts.take ?? 50, 200);
  const rows = await db.submission.findMany({
    where: {
      competitionId,
      ...(opts.challengeId ? { challengeId: opts.challengeId } : {}),
      ...(opts.result ? { result: opts.result as never } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      result: true,
      createdAt: true,
      subjectKey: true,
      fingerprint: true,
      challenge: { select: { id: true, title: true } },
      user: { select: { username: true } },
      team: { select: { name: true } },
    },
  });
  const hasMore = rows.length > take;
  return { items: rows.slice(0, take), nextCursor: hasMore ? rows[take - 1]!.id : null };
}

