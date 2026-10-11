import "server-only";
import { z } from "zod";
import type { Challenge, ChallengeStatus, Competition, Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError, badRequest, conflict, forbidden, isUniqueViolation, notFound } from "../errors";
import { audit } from "../audit";
import { challengeValue } from "../domain/scoring";
import {
  assertUser,
  competitionCan,
  getParticipation,
  requireCompetitionPermission,
  type Actor,
  type Participation,
} from "./access";
import { getSetting } from "./settings";

const optionalDate = z
  .union([z.coerce.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const challengeInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may contain lowercase letters, digits and single hyphens"),
  categoryId: z.string().cuid(),
  subcategory: z.string().trim().max(60).nullable().optional(),
  description: z.string().max(50_000).default(""),
  learningObjectives: z.string().max(10_000).default(""),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]).default("BEGINNER"),
  points: z.coerce.number().int().min(0).max(10_000).default(100),
  scoringModel: z.enum(["STATIC", "DYNAMIC"]).nullable().optional(),
  minPoints: z.coerce.number().int().min(0).max(10_000).default(50),
  decay: z.coerce.number().int().min(0).max(10_000).default(20),
  estimatedMinutes: z.coerce.number().int().min(1).max(10_000).nullable().optional(),
  accessMethod: z.enum(["OFFLINE", "INSTANCE"]).default("OFFLINE"),
  environmentId: z.string().cuid().nullable().optional(),
  gradingMode: z.enum(["FLAG", "MANUAL"]).default("FLAG"),
  attemptLimit: z.coerce.number().int().min(1).max(10_000).nullable().optional(),
  releaseAt: optionalDate,
  closeAt: optionalDate,
  tags: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  skills: z.array(z.string().trim().min(1).max(48)).max(20).default([]),
  solution: z.string().max(50_000).default(""),
  instructorNotes: z.string().max(20_000).default(""),
  explanation: z.string().max(20_000).default(""),
  remediation: z.string().max(20_000).default(""),
  prerequisiteIds: z.array(z.string().cuid()).max(10).default([]),
  reviewerId: z.string().cuid().nullable().optional(),
  changeNote: z.string().max(500).optional(),
});
export type ChallengeInput = z.infer<typeof challengeInputSchema>;
export const challengeUpdateSchema = challengeInputSchema.partial();

/** Content captured in version snapshots. Never contains flags. */
function snapshotOf(c: Challenge & { prerequisites?: { id: string }[] }): Prisma.InputJsonValue {
  return {
    title: c.title,
    slug: c.slug,
    categoryId: c.categoryId,
    subcategory: c.subcategory,
    description: c.description,
    learningObjectives: c.learningObjectives,
    difficulty: c.difficulty,
    points: c.points,
    scoringModel: c.scoringModel,
    minPoints: c.minPoints,
    decay: c.decay,
    accessMethod: c.accessMethod,
    environmentId: c.environmentId,
    gradingMode: c.gradingMode,
    attemptLimit: c.attemptLimit,
    releaseAt: c.releaseAt?.toISOString() ?? null,
    closeAt: c.closeAt?.toISOString() ?? null,
    tags: c.tags,
    skills: c.skills,
    solution: c.solution,
    instructorNotes: c.instructorNotes,
    explanation: c.explanation,
    remediation: c.remediation,
    prerequisites: c.prerequisites?.map((p) => p.id) ?? [],
  };
}

async function validateRefs(competitionId: string, data: Partial<ChallengeInput>, selfId?: string) {
  if (data.categoryId) {
    const cat = await db.challengeCategory.findUnique({ where: { id: data.categoryId } });
    if (!cat) throw badRequest("Unknown category.");
  }
  if (data.environmentId) {
    const envRow = await db.executionEnvironment.findUnique({ where: { id: data.environmentId } });
    if (!envRow) throw badRequest("Unknown execution environment.");
  }
  if (data.prerequisiteIds?.length) {
    if (selfId && data.prerequisiteIds.includes(selfId)) throw badRequest("A challenge cannot be its own prerequisite.");
    const count = await db.challenge.count({ where: { id: { in: data.prerequisiteIds }, competitionId } });
    if (count !== data.prerequisiteIds.length) throw badRequest("Prerequisites must be challenges in the same competition.");
  }
  if (data.minPoints !== undefined && data.points !== undefined && data.minPoints > data.points)
    throw badRequest("Minimum points cannot exceed initial points.");
  if (data.releaseAt && data.closeAt && data.closeAt <= data.releaseAt)
    throw badRequest("Close time must be after release time.");
}

export async function createChallenge(actor: Actor | null, competitionId: string, input: ChallengeInput) {
  const { user } = await requireCompetitionPermission(actor, competitionId, "challenge.manage");
  const { prerequisiteIds, changeNote, ...data } = challengeInputSchema.parse(input);
  await validateRefs(competitionId, { ...data, prerequisiteIds });
  try {
    return await db.$transaction(async (tx) => {
      const c = await tx.challenge.create({
        data: {
          ...data,
          competitionId,
          authorId: user.id,
          status: "DRAFT",
          prerequisites: { connect: prerequisiteIds.map((id) => ({ id })) },
        },
        include: { prerequisites: { select: { id: true } } },
      });
      await tx.challengeVersion.create({
        data: { challengeId: c.id, version: 1, snapshot: snapshotOf(c), changeNote: changeNote ?? "Created", createdById: user.id },
      });
      await audit({ actorId: user.id, action: "challenge.create", targetType: "challenge", targetId: c.id, competitionId, metadata: { title: c.title } }, tx);
      return c;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("A challenge with that slug already exists in this competition.");
    throw e;
  }
}

async function loadChallengeForStaff(actor: Actor | null, challengeId: string, permission: "challenge.manage" | "competition.view_staff" | "challenge.review") {
  assertUser(actor);
  const challenge = await db.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) throw notFound("Challenge");
  const { user, competition } = await requireCompetitionPermission(actor, challenge.competitionId, permission);
  return { user, competition, challenge };
}

export async function updateChallenge(actor: Actor | null, challengeId: string, input: Partial<ChallengeInput>) {
  const { user, challenge } = await loadChallengeForStaff(actor, challengeId, "challenge.manage");
  const { prerequisiteIds, changeNote, ...data } = challengeUpdateSchema.parse(input);
  if (challenge.status === "RETIRED") throw badRequest("Retired challenges cannot be edited.");
  await validateRefs(challenge.competitionId, {
    ...data,
    points: data.points ?? challenge.points,
    minPoints: data.minPoints ?? challenge.minPoints,
    prerequisiteIds,
  }, challengeId);
  try {
    return await db.$transaction(async (tx) => {
      const updated = await tx.challenge.update({
        where: { id: challengeId },
        data: {
          ...data,
          version: { increment: 1 },
          ...(prerequisiteIds ? { prerequisites: { set: prerequisiteIds.map((id) => ({ id })) } } : {}),
        },
        include: { prerequisites: { select: { id: true } } },
      });
      await tx.challengeVersion.create({
        data: {
          challengeId,
          version: updated.version,
          snapshot: snapshotOf(updated),
          changeNote: changeNote ?? "",
          createdById: user.id,
        },
      });
      await audit({
        actorId: user.id,
        action: "challenge.update",
        targetType: "challenge",
        targetId: challengeId,
        competitionId: challenge.competitionId,
        metadata: { version: updated.version, fields: Object.keys(data) },
      }, tx);
      return updated;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("A challenge with that slug already exists in this competition.");
    throw e;
  }
}

const STATUS_TRANSITIONS: Record<ChallengeStatus, ChallengeStatus[]> = {
  DRAFT: ["IN_REVIEW", "PUBLISHED", "ARCHIVED"],
  IN_REVIEW: ["DRAFT", "APPROVED", "ARCHIVED"],
  APPROVED: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT", "ARCHIVED", "RETIRED"],
  ARCHIVED: ["DRAFT"],
  RETIRED: [],
};

/** Problems preventing publication of a challenge. */
export async function challengePublishProblems(challengeId: string): Promise<string[]> {
  const c = await db.challenge.findUniqueOrThrow({
    where: { id: challengeId },
    include: { flags: { where: { active: true } }, environment: true },
  });
  const problems: string[] = [];
  if (c.description.trim().length < 20) problems.push("Description must be at least 20 characters.");
  if (c.gradingMode === "FLAG") {
    if (c.flags.length === 0) problems.push("At least one active flag must be configured.");
    const hasStatic = c.flags.some((f) => f.type === "STATIC");
    const hasInstance = c.flags.some((f) => f.type === "INSTANCE");
    if (hasStatic && !c.flagsTestedAt) problems.push("Static flags must be tested with the flag tester before publishing.");
    if (hasInstance && c.accessMethod !== "INSTANCE") problems.push("Instance flags require the INSTANCE access method.");
  }
  if (c.accessMethod === "INSTANCE") {
    if (!c.environment) problems.push("Instance challenges need an execution environment.");
    else if (!c.environment.enabled) problems.push(`Execution environment "${c.environment.name}" is disabled by the platform administrator.`);
  }
  return problems;
}

export async function setChallengeStatus(actor: Actor | null, challengeId: string, to: ChallengeStatus) {
  const { user, challenge } = await loadChallengeForStaff(actor, challengeId, "challenge.manage");
  if (!STATUS_TRANSITIONS[challenge.status].includes(to))
    throw badRequest(`Cannot move challenge from ${challenge.status} to ${to}.`);
  if (to === "PUBLISHED") {
    if (challenge.status === "DRAFT" && (await getSetting("publishRequiresReview")))
      throw badRequest("Platform policy requires review approval before publication.");
    const problems = await challengePublishProblems(challengeId);
    if (problems.length)
      throw new AppError("VALIDATION_FAILED", "Challenge is not ready to publish.", problems.map((message) => ({ path: "challenge", message })));
  }
  const updated = await db.challenge.update({
    where: { id: challengeId },
    data: { status: to, ...(to === "PUBLISHED" ? { publishedAt: new Date() } : {}) },
  });
  await audit({
    actorId: user.id,
    action: to === "PUBLISHED" ? "challenge.publish" : "challenge.status",
    targetType: "challenge",
    targetId: challengeId,
    competitionId: challenge.competitionId,
    metadata: { from: challenge.status, to },
  });
  return updated;
}

export async function deleteChallenge(actor: Actor | null, challengeId: string) {
  const { user, challenge } = await loadChallengeForStaff(actor, challengeId, "challenge.manage");
  const submissions = await db.submission.count({ where: { challengeId } });
  if (challenge.status !== "DRAFT" || submissions > 0)
    throw badRequest("Only draft challenges without submissions can be deleted; archive or retire it instead.");
  await db.challenge.delete({ where: { id: challengeId } });
  await audit({ actorId: user.id, action: "challenge.delete", targetType: "challenge", targetId: challengeId, competitionId: challenge.competitionId, metadata: { title: challenge.title } });
}

/** Copies a challenge (content, hints, artifacts — not flags) into another competition as a DRAFT. */
export async function cloneChallenge(actor: Actor | null, challengeId: string, targetCompetitionId: string) {
  const { user, challenge } = await loadChallengeForStaff(actor, challengeId, "challenge.manage");
  await requireCompetitionPermission(actor, targetCompetitionId, "challenge.manage");
  const src = await db.challenge.findUniqueOrThrow({ where: { id: challenge.id }, include: { hints: true, artifacts: true } });
  let slug = src.slug;
  for (let i = 2; await db.challenge.findUnique({ where: { competitionId_slug: { competitionId: targetCompetitionId, slug } } }); i++) slug = `${src.slug}-${i}`;
  const copy = await db.$transaction(async (tx) => {
    const c = await tx.challenge.create({
      data: {
        competitionId: targetCompetitionId,
        slug,
        title: src.title,
        categoryId: src.categoryId,
        subcategory: src.subcategory,
        description: src.description,
        learningObjectives: src.learningObjectives,
        difficulty: src.difficulty,
        points: src.points,
        scoringModel: src.scoringModel,
        minPoints: src.minPoints,
        decay: src.decay,
        estimatedMinutes: src.estimatedMinutes,
        accessMethod: src.accessMethod,
        environmentId: src.environmentId,
        gradingMode: src.gradingMode,
        attemptLimit: src.attemptLimit,
        tags: src.tags,
        skills: src.skills,
        solution: src.solution,
        instructorNotes: src.instructorNotes,
        explanation: src.explanation,
        remediation: src.remediation,
        authorId: user.id,
        status: "DRAFT",
        hints: { create: src.hints.map((h) => ({ order: h.order, title: h.title, content: h.content, cost: h.cost, requiresPrevious: h.requiresPrevious, minAttempts: h.minAttempts })) },
        artifacts: {
          create: src.artifacts.map((a) => ({
            filename: a.filename, storageKey: a.storageKey, sha256: a.sha256, sizeBytes: a.sizeBytes, mimeType: a.mimeType,
            detectedType: a.detectedType, metadata: a.metadata as Prisma.InputJsonValue, description: a.description, visible: a.visible, uploadedById: user.id,
          })),
        },
      },
    });
    await tx.challengeVersion.create({ data: { challengeId: c.id, version: 1, snapshot: snapshotOf(c), changeNote: `Cloned from ${src.id}`, createdById: user.id } });
    await audit({ actorId: user.id, action: "challenge.clone", targetType: "challenge", targetId: c.id, competitionId: targetCompetitionId, metadata: { sourceId: src.id } }, tx);
    return c;
  });
  return copy;
}

// ───────────── Participant visibility ─────────────

export interface PlayContext {
  competition: Competition;
  challenge: Challenge & { prerequisites: { id: string; title: string }[] };
  participation: Participation;
  isStaff: boolean;
}

function competitionOpenForViewing(c: Competition, now: Date) {
  return ["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"].includes(c.status) && now >= c.startsAt;
}

export function isConcluded(c: Pick<Competition, "status">) {
  return c.status === "COMPLETED" || c.status === "ARCHIVED";
}

export function challengeReleased(c: Pick<Challenge, "status" | "releaseAt">, now: Date) {
  return c.status === "PUBLISHED" && (!c.releaseAt || c.releaseAt <= now);
}

/**
 * Resolves a challenge the user may view. Throws 404 for anything that is not
 * visible to them (unpublished, unreleased, other competition, not registered).
 */
export async function loadPlayableChallenge(
  actor: Actor | null,
  competitionId: string,
  challengeId: string,
  opts: { allowLocked?: boolean } = {},
): Promise<PlayContext & { locked: boolean }> {
  assertUser(actor);
  const challenge = await db.challenge.findFirst({
    where: { id: challengeId, competitionId },
    include: { prerequisites: { select: { id: true, title: true } }, competition: true },
  });
  if (!challenge) throw notFound("Challenge");
  const { competition, ...rest } = challenge;
  const isStaff = await competitionCan(actor, competitionId, "competition.view_staff");
  const participation = await getParticipation(actor.id, competition);
  if (isStaff) return { competition, challenge: rest, participation, isStaff, locked: false };

  const now = new Date();
  const concluded = competition.status === "COMPLETED" || competition.status === "ARCHIVED";
  if (!competitionOpenForViewing(competition, now)) throw notFound("Challenge");
  if (!concluded && participation.registrationStatus !== "APPROVED") throw notFound("Challenge");
  if (!challengeReleased(rest, now)) throw notFound("Challenge");

  let locked = false;
  if (rest.prerequisites.length > 0) {
    const solved = participation.subjectKey
      ? await db.solve.count({ where: { subjectKey: participation.subjectKey, challengeId: { in: rest.prerequisites.map((p) => p.id) } } })
      : 0;
    locked = solved < rest.prerequisites.length && !concluded;
  }
  if (locked && !opts.allowLocked) throw forbidden("Solve the prerequisite challenges to unlock this challenge.");
  return { competition, challenge: rest, participation, isStaff, locked };
}

/** Challenge list for the catalogue. Never includes flags or staff-only text. */
export async function listChallenges(actor: Actor | null, competitionId: string) {
  assertUser(actor);
  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition) throw notFound("Competition");
  const isStaff = await competitionCan(actor, competitionId, "competition.view_staff");
  const participation = await getParticipation(actor.id, competition);
  const now = new Date();
  const concluded = competition.status === "COMPLETED" || competition.status === "ARCHIVED";

  if (!isStaff) {
    if (!competitionOpenForViewing(competition, now)) return { competition, isStaff, participation, challenges: [] };
    if (!concluded && participation.registrationStatus !== "APPROVED") return { competition, isStaff, participation, challenges: [] };
  }

  const rows = await db.challenge.findMany({
    where: {
      competitionId,
      ...(isStaff ? {} : { status: "PUBLISHED", OR: [{ releaseAt: null }, { releaseAt: { lte: now } }] }),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { points: "asc" }, { title: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      subcategory: true,
      difficulty: true,
      points: true,
      minPoints: true,
      decay: true,
      scoringModel: true,
      estimatedMinutes: true,
      accessMethod: true,
      gradingMode: true,
      status: true,
      releaseAt: true,
      closeAt: true,
      tags: true,
      skills: true,
      category: { select: { id: true, slug: true, name: true, icon: true } },
      prerequisites: { select: { id: true } },
      _count: { select: { solves: true } },
    },
  });

  const solvedIds = new Set(
    participation.subjectKey
      ? (await db.solve.findMany({ where: { competitionId, subjectKey: participation.subjectKey }, select: { challengeId: true } })).map((s) => s.challengeId)
      : [],
  );

  return {
    competition,
    isStaff,
    participation,
    challenges: rows.map((c) => {
      const model = c.scoringModel ?? competition.scoringModel;
      const locked = !isStaff && !concluded && c.prerequisites.some((p) => !solvedIds.has(p.id));
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        subcategory: c.subcategory,
        difficulty: c.difficulty,
        category: c.category,
        value: challengeValue(model, c, c._count.solves),
        basePoints: c.points,
        scoringModel: model,
        estimatedMinutes: c.estimatedMinutes,
        accessMethod: c.accessMethod,
        gradingMode: c.gradingMode,
        tags: c.tags,
        skills: c.skills,
        solves: c._count.solves,
        solved: solvedIds.has(c.id),
        locked,
        closed: !!c.closeAt && c.closeAt <= now,
        status: isStaff ? c.status : undefined,
      };
    }),
  };
}

function solutionVisible(competition: Competition, solved: boolean, now: Date) {
  const ended = competition.status === "COMPLETED" || competition.status === "ARCHIVED" || (!!competition.endsAt && competition.endsAt <= now);
  switch (competition.solutionDisclosure) {
    case "AFTER_SOLVE":
      return solved || ended;
    case "AFTER_END":
      return ended;
    default:
      return false;
  }
}

/** Full participant view of one challenge (also used for staff preview with `asParticipant`). */
export async function getChallengeView(actor: Actor | null, competitionId: string, challengeId: string) {
  const ctx = await loadPlayableChallenge(actor, competitionId, challengeId, { allowLocked: true });
  const { competition, challenge, participation, isStaff, locked } = ctx;
  const now = new Date();
  const subjectKey = participation.subjectKey;

  const [solveCount, mySolve, attempts, hints, unlocks, artifacts, category, instance] = await Promise.all([
    db.solve.count({ where: { challengeId } }),
    subjectKey ? db.solve.findUnique({ where: { challengeId_subjectKey: { challengeId, subjectKey } } }) : null,
    subjectKey ? db.submission.count({ where: { challengeId, subjectKey, result: "INCORRECT" } }) : 0,
    db.hint.findMany({ where: { challengeId }, orderBy: { order: "asc" } }),
    subjectKey ? db.hintUnlock.findMany({ where: { subjectKey, hint: { challengeId } }, select: { hintId: true } }) : [],
    db.challengeArtifact.findMany({
      where: { challengeId, ...(isStaff ? {} : { visible: true }) },
      orderBy: { filename: "asc" },
      select: { id: true, filename: true, sha256: true, sizeBytes: true, mimeType: true, detectedType: true, metadata: true, description: true, visible: true, createdAt: true },
    }),
    db.challengeCategory.findUnique({ where: { id: challenge.categoryId }, select: { slug: true, name: true, icon: true } }),
    subjectKey && challenge.accessMethod === "INSTANCE"
      ? db.challengeInstance.findFirst({
          where: { challengeId, subjectKey, status: { in: ["PROVISIONING", "RUNNING"] } },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, connection: true, expiresAt: true, resetCount: true, createdAt: true },
        })
      : null,
  ]);

  const unlocked = new Set(unlocks.map((u) => u.hintId));
  const model = challenge.scoringModel ?? competition.scoringModel;
  const attemptLimit = challenge.attemptLimit ?? competition.defaultAttemptLimit ?? null;
  const solved = !!mySolve;
  const showSolution = solutionVisible(competition, solved, now);

  if (locked) {
    return {
      locked: true as const,
      id: challenge.id,
      title: challenge.title,
      prerequisites: challenge.prerequisites,
      category,
      difficulty: challenge.difficulty,
    };
  }

  return {
    locked: false as const,
    id: challenge.id,
    slug: challenge.slug,
    title: challenge.title,
    category,
    subcategory: challenge.subcategory,
    description: challenge.description,
    learningObjectives: challenge.learningObjectives,
    difficulty: challenge.difficulty,
    value: challengeValue(model, challenge, solveCount),
    basePoints: challenge.points,
    scoringModel: model,
    estimatedMinutes: challenge.estimatedMinutes,
    accessMethod: challenge.accessMethod,
    gradingMode: challenge.gradingMode,
    tags: challenge.tags,
    skills: challenge.skills,
    version: challenge.version,
    prerequisites: challenge.prerequisites,
    solves: solveCount,
    solved,
    solvedAt: mySolve?.createdAt ?? null,
    attemptsUsed: attempts,
    attemptLimit,
    closed: !!challenge.closeAt && challenge.closeAt <= now,
    canSubmit: !!subjectKey && !solved,
    subjectKey,
    hints: hints.map((h, i) => {
      // After a competition concludes, hints become free study material.
      const isUnlocked = unlocked.has(h.id) || isConcluded(competition) || isStaff;
      return {
        id: h.id,
        order: i + 1,
        title: h.title,
        cost: competition.hintPenaltiesEnabled ? h.cost : 0,
        unlocked: isUnlocked,
        content: isUnlocked ? h.content : null,
        requiresPrevious: h.requiresPrevious,
        minAttempts: h.minAttempts,
        availableAfter: h.availableAfter,
      };
    }),
    artifacts,
    instance,
    explanation: showSolution ? challenge.explanation : null,
    remediation: showSolution ? challenge.remediation : null,
    solutionPolicy: competition.solutionDisclosure,
    isStaff,
  };
}

/** Full staff view (includes instructor-only content; still never flag digests). */
export async function getChallengeForStaff(actor: Actor | null, challengeId: string) {
  const { challenge, competition } = await loadChallengeForStaff(actor, challengeId, "competition.view_staff");
  const canManage = await competitionCan(actor, competition.id, "challenge.manage");
  const full = await db.challenge.findUniqueOrThrow({
    where: { id: challenge.id },
    include: {
      category: true,
      environment: true,
      prerequisites: { select: { id: true, title: true } },
      author: { select: { displayName: true, username: true } },
      reviewer: { select: { displayName: true, username: true } },
      hints: { orderBy: { order: "asc" } },
      artifacts: { orderBy: { filename: "asc" } },
      flags: {
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, label: true, caseSensitive: true, normalizeWhitespace: true, active: true, expiresAt: true, keyVersion: true, createdAt: true, rotatedAt: true },
      },
      versions: { orderBy: { version: "desc" }, take: 20, select: { id: true, version: true, changeNote: true, createdAt: true, createdById: true } },
      reviews: { orderBy: { createdAt: "desc" }, include: { reviewer: { select: { displayName: true } } } },
      _count: { select: { solves: true, submissions: true } },
    },
  });
  return { challenge: full, competition, canManage, publishProblems: await challengePublishProblems(challenge.id) };
}

// ───────────── Hints (authoring) ─────────────

export const hintInputSchema = z.object({
  title: z.string().trim().min(1).max(80).default("Hint"),
  content: z.string().trim().min(1).max(10_000),
  cost: z.coerce.number().int().min(0).max(10_000).default(0),
  order: z.coerce.number().int().min(0).max(100).default(0),
  requiresPrevious: z.boolean().default(true),
  minAttempts: z.coerce.number().int().min(0).max(1000).default(0),
  availableAfter: optionalDate,
});

export async function createHint(actor: Actor | null, challengeId: string, input: z.infer<typeof hintInputSchema>) {
  const { user, challenge } = await loadChallengeForStaff(actor, challengeId, "challenge.manage");
  const hint = await db.hint.create({ data: { ...hintInputSchema.parse(input), challengeId } });
  await audit({ actorId: user.id, action: "hint.create", targetType: "hint", targetId: hint.id, competitionId: challenge.competitionId, metadata: { challengeId } });
  return hint;
}

export async function updateHint(actor: Actor | null, challengeId: string, hintId: string, input: Partial<z.infer<typeof hintInputSchema>>) {
  const { user, challenge } = await loadChallengeForStaff(actor, challengeId, "challenge.manage");
  const existing = await db.hint.findFirst({ where: { id: hintId, challengeId } });
  if (!existing) throw notFound("Hint");
  const hint = await db.hint.update({ where: { id: hintId }, data: hintInputSchema.partial().parse(input) });
  await audit({ actorId: user.id, action: "hint.update", targetType: "hint", targetId: hintId, competitionId: challenge.competitionId });
  return hint;
}

export async function deleteHint(actor: Actor | null, challengeId: string, hintId: string) {
  const { user, challenge } = await loadChallengeForStaff(actor, challengeId, "challenge.manage");
  const unlocks = await db.hintUnlock.count({ where: { hintId } });
  if (unlocks > 0) throw badRequest("This hint has been unlocked by participants and cannot be deleted.");
  const res = await db.hint.deleteMany({ where: { id: hintId, challengeId } });
  if (res.count === 0) throw notFound("Hint");
  await audit({ actorId: user.id, action: "hint.delete", targetType: "hint", targetId: hintId, competitionId: challenge.competitionId });
}

// ───────────── Reviews ─────────────

export const reviewInputSchema = z.object({
  verdict: z.enum(["APPROVE", "CHANGES_REQUESTED", "COMMENT"]),
  qualityRating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  educationalRating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  comments: z.string().trim().max(10_000).default(""),
});

export async function submitReview(actor: Actor | null, challengeId: string, input: z.infer<typeof reviewInputSchema>) {
  const { user, challenge } = await loadChallengeForStaff(actor, challengeId, "challenge.review");
  const data = reviewInputSchema.parse(input);
  if (challenge.authorId === user.id && data.verdict === "APPROVE")
    throw forbidden("Authors cannot approve their own challenges.");
  const review = await db.$transaction(async (tx) => {
    const r = await tx.challengeReview.create({ data: { ...data, challengeId, reviewerId: user.id, challengeVersion: challenge.version } });
    if (data.verdict === "APPROVE" && challenge.status === "IN_REVIEW") {
      await tx.challenge.update({ where: { id: challengeId }, data: { status: "APPROVED", reviewerId: user.id } });
    } else if (data.verdict === "CHANGES_REQUESTED" && challenge.status === "IN_REVIEW") {
      await tx.challenge.update({ where: { id: challengeId }, data: { status: "DRAFT" } });
    }
    await audit({ actorId: user.id, action: "challenge.review", targetType: "challenge", targetId: challengeId, competitionId: challenge.competitionId, metadata: { verdict: data.verdict } }, tx);
    return r;
  });
  return review;
}

export async function listCategories() {
  return db.challengeCategory.findMany({ orderBy: { sortOrder: "asc" } });
}
