import "server-only";
import { z } from "zod";
import type { CompetitionStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError, badRequest, conflict, forbidden, isUniqueViolation, notFound } from "../errors";
import { audit } from "../audit";
import { hashInviteCode, safeEqualHex } from "../crypto";
import {
  allowedTransitions,
  canTransition,
  registrationOpen,
  validateCompetitionConfig,
} from "../domain/competition-state";
import { assignableStaffRoles } from "../domain/permissions";
import {
  assertUser,
  competitionCan,
  getParticipation,
  requireCompetitionPermission,
  requirePlatform,
  type Actor,
} from "./access";
import { enqueueJob } from "./jobs";
import { notifyCompetition } from "./notifications";

const dateish = z.coerce.date();
const optionalDate = z
  .union([z.coerce.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const competitionInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may contain lowercase letters, digits and single hyphens"),
  tagline: z.string().trim().max(160).optional().nullable(),
  description: z.string().max(20_000).default(""),
  bannerTheme: z.enum(["teal", "cyan", "emerald", "indigo", "slate"]).default("teal"),
  institutionId: z.string().cuid().nullable().optional(),
  timezone: z.string().min(1).max(64).default("UTC"),
  startsAt: dateish,
  endsAt: optionalDate,
  registrationOpensAt: optionalDate,
  registrationDeadline: optionalDate,
  mode: z.enum(["INDIVIDUAL", "TEAM"]).default("INDIVIDUAL"),
  minTeamSize: z.coerce.number().int().min(1).max(50).default(1),
  maxTeamSize: z.coerce.number().int().min(1).max(50).default(4),
  accessMode: z.enum(["PUBLIC", "PRIVATE", "INVITATION"]).default("PUBLIC"),
  scoringModel: z.enum(["STATIC", "DYNAMIC"]).default("STATIC"),
  tieBreak: z.enum(["EARLIEST_LAST_SOLVE", "FEWEST_SUBMISSIONS"]).default("EARLIEST_LAST_SOLVE"),
  rules: z.string().max(20_000).default(""),
  permittedTools: z.string().max(10_000).default(""),
  prohibitedActivities: z.string().max(10_000).default(""),
  hintPenaltiesEnabled: z.boolean().default(true),
  wrongSubmissionPenalty: z.coerce.number().int().min(0).max(1000).default(0),
  defaultAttemptLimit: z.coerce.number().int().min(1).max(10_000).nullable().optional(),
  freezeAt: optionalDate,
  identityDisplay: z.enum(["FULL", "ANONYMIZED"]).default("FULL"),
  allowTeamChangesWhileActive: z.boolean().default(false),
  solutionDisclosure: z.enum(["NEVER", "AFTER_SOLVE", "AFTER_END"]).default("AFTER_END"),
  isPractice: z.boolean().default(false),
});
export type CompetitionInput = z.infer<typeof competitionInputSchema>;
export const competitionUpdateSchema = competitionInputSchema.partial();

const PUBLIC_STATUSES: CompetitionStatus[] = ["SCHEDULED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];

/** Fields safe to expose to anyone who can see the competition. */
export const publicCompetitionSelect = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  description: true,
  bannerTheme: true,
  status: true,
  timezone: true,
  startsAt: true,
  endsAt: true,
  registrationOpensAt: true,
  registrationDeadline: true,
  mode: true,
  minTeamSize: true,
  maxTeamSize: true,
  accessMode: true,
  scoringModel: true,
  tieBreak: true,
  rules: true,
  permittedTools: true,
  prohibitedActivities: true,
  hintPenaltiesEnabled: true,
  wrongSubmissionPenalty: true,
  defaultAttemptLimit: true,
  freezeAt: true,
  identityDisplay: true,
  allowTeamChangesWhileActive: true,
  solutionDisclosure: true,
  isPractice: true,
  institution: { select: { id: true, name: true } },
} satisfies Prisma.CompetitionSelect;

export async function listCompetitions(user: Actor | null, opts: { includeStaffDrafts?: boolean } = {}) {
  const where: Prisma.CompetitionWhereInput =
    user && opts.includeStaffDrafts
      ? user.role === "ADMIN"
        ? {}
        : { OR: [{ status: { in: PUBLIC_STATUSES } }, { staff: { some: { userId: user.id } } }] }
      : { status: { in: PUBLIC_STATUSES } };
  return db.competition.findMany({
    where,
    orderBy: [{ startsAt: "desc" }],
    select: {
      ...publicCompetitionSelect,
      _count: { select: { registrations: { where: { status: "APPROVED" } }, teams: true } },
    },
  });
}

/** Competition visible to the user (drafts only for staff). */
export async function getVisibleCompetition(user: Actor | null, slugOrId: string) {
  const competition = await db.competition.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    select: { ...publicCompetitionSelect, inviteCodeHash: true },
  });
  if (!competition) throw notFound("Competition");
  const isStaff = await competitionCan(user, competition.id, "competition.view_staff");
  if (!PUBLIC_STATUSES.includes(competition.status) && !isStaff) throw notFound("Competition");
  const { inviteCodeHash, ...rest } = competition;
  return { competition: { ...rest, hasInviteCode: !!inviteCodeHash }, isStaff };
}

export async function createCompetition(actor: Actor | null, input: CompetitionInput) {
  const user = await requirePlatform(actor, "competition.create");
  const data = competitionInputSchema.parse(input);
  if (data.endsAt && data.endsAt <= data.startsAt) badRequestThrow("End time must be after the start time.");
  try {
    const competition = await db.$transaction(async (tx) => {
      const c = await tx.competition.create({
        data: { ...data, status: "DRAFT", createdById: user.id },
      });
      await tx.competitionStaff.create({ data: { competitionId: c.id, userId: user.id, role: "ORGANIZER" } });
      await audit(
        { actorId: user.id, action: "competition.create", targetType: "competition", targetId: c.id, competitionId: c.id, metadata: { name: c.name, slug: c.slug } },
        tx,
      );
      return c;
    });
    return competition;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("A competition with that slug already exists.");
    throw e;
  }
}

function badRequestThrow(msg: string): never {
  throw badRequest(msg);
}

export async function updateCompetition(actor: Actor | null, competitionId: string, input: Partial<CompetitionInput>) {
  const { user, competition } = await requireCompetitionPermission(actor, competitionId, "competition.configure");
  const data = competitionUpdateSchema.parse(input);
  if (competition.status === "ARCHIVED") throw badRequest("Archived competitions cannot be edited.");
  const live = competition.status === "ACTIVE" || competition.status === "PAUSED";
  if (live && data.mode && data.mode !== competition.mode)
    throw badRequest("Participation mode cannot change while the competition is running.");
  if (data.mode && data.mode !== competition.mode) {
    const regs = await db.competitionRegistration.count({ where: { competitionId } });
    if (regs > 0) throw badRequest("Participation mode cannot change after participants have registered.");
  }
  const startsAt = data.startsAt ?? competition.startsAt;
  const endsAt = data.endsAt === undefined ? competition.endsAt : data.endsAt;
  if (endsAt && endsAt <= startsAt) throw badRequest("End time must be after the start time.");
  try {
    const updated = await db.competition.update({ where: { id: competitionId }, data });
    await audit({
      actorId: user.id,
      action: "competition.update",
      targetType: "competition",
      targetId: competitionId,
      competitionId,
      metadata: { fields: Object.keys(data) },
    });
    return updated;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("A competition with that slug already exists.");
    throw e;
  }
}

export async function setInviteCode(actor: Actor | null, competitionId: string, code: string | null) {
  const { user } = await requireCompetitionPermission(actor, competitionId, "competition.configure");
  if (code !== null && !/^[A-Za-z0-9-]{6,64}$/.test(code.trim()))
    throw badRequest("Invitation code must be 6–64 letters, digits or hyphens.");
  await db.competition.update({
    where: { id: competitionId },
    data: { inviteCodeHash: code ? hashInviteCode(code) : null },
  });
  await audit({ actorId: user.id, action: "competition.invite_code.set", targetType: "competition", targetId: competitionId, competitionId, metadata: { cleared: code === null } });
}

export async function publicationProblems(competitionId: string): Promise<string[]> {
  const c = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const published = await db.challenge.count({ where: { competitionId, status: "PUBLISHED" } });
  return validateCompetitionConfig(
    { ...c, hasInviteCode: !!c.inviteCodeHash, rules: c.rules },
    published,
  );
}

export async function transitionCompetition(actor: Actor | null, competitionId: string, to: CompetitionStatus) {
  const { user, competition } = await requireCompetitionPermission(actor, competitionId, "competition.configure");
  if (!canTransition(competition.status, to)) {
    throw badRequest(
      `Cannot move from ${competition.status} to ${to}. Allowed: ${allowedTransitions(competition.status).join(", ") || "none"}.`,
    );
  }
  if (competition.status === "DRAFT" && to === "SCHEDULED") {
    const problems = await publicationProblems(competitionId);
    if (problems.length) throw new AppError("VALIDATION_FAILED", "Competition is not ready to publish.", problems.map((message) => ({ path: "competition", message })));
  }
  const updated = await db.competition.update({ where: { id: competitionId }, data: { status: to } });
  await audit({
    actorId: user.id,
    action: "competition.status",
    targetType: "competition",
    targetId: competitionId,
    competitionId,
    metadata: { from: competition.status, to },
  });
  if (to === "ACTIVE" || to === "PAUSED" || to === "COMPLETED") {
    await notifyCompetition(competitionId, {
      type: "competition.status",
      title: `${competition.name} is now ${to.toLowerCase()}`,
      link: `/competitions/${competition.slug}`,
    });
  }
  await enqueueJob("leaderboard.invalidate", { competitionId });
  return updated;
}

// ───────────── Registration ─────────────

export async function registerForCompetition(actor: Actor | null, competitionId: string, inviteCode?: string) {
  assertUser(actor);
  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition || competition.status === "DRAFT") throw notFound("Competition");
  if (!competition.isPractice && !registrationOpen(competition, new Date()))
    throw badRequest("Registration is not open for this competition.");
  if (await competitionCan(actor, competitionId, "competition.view_staff"))
    throw badRequest("Competition staff cannot register as participants.");

  if (competition.accessMode === "INVITATION") {
    if (!inviteCode || !competition.inviteCodeHash || !safeEqualHex(hashInviteCode(inviteCode), competition.inviteCodeHash))
      throw forbidden("A valid invitation code is required.");
  }
  const status = competition.accessMode === "PRIVATE" ? "PENDING" : "APPROVED";
  const existing = await db.competitionRegistration.findUnique({
    where: { competitionId_userId: { competitionId, userId: actor.id } },
  });
  if (existing && existing.status !== "WITHDRAWN") {
    if (existing.status === "REJECTED") throw forbidden("Your registration was declined by the organizers.");
    return existing;
  }
  const reg = existing
    ? await db.competitionRegistration.update({ where: { id: existing.id }, data: { status, decidedAt: null } })
    : await db.competitionRegistration.create({ data: { competitionId, userId: actor.id, status } });
  await audit({ actorId: actor.id, action: "registration.create", targetType: "registration", targetId: reg.id, competitionId, metadata: { status } });
  return reg;
}

export async function withdrawRegistration(actor: Actor | null, competitionId: string) {
  assertUser(actor);
  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition) throw notFound("Competition");
  const part = await getParticipation(actor.id, competition);
  if (!part.registered) throw notFound("Registration");
  if (part.teamId) throw badRequest("Leave your team before withdrawing.");
  const hasSolves = await db.solve.count({ where: { competitionId, userId: actor.id } });
  if (hasSolves > 0) throw badRequest("You cannot withdraw after scoring points; contact the organizers.");
  await db.competitionRegistration.update({
    where: { competitionId_userId: { competitionId, userId: actor.id } },
    data: { status: "WITHDRAWN" },
  });
  await audit({ actorId: actor.id, action: "registration.withdraw", targetType: "competition", targetId: competitionId, competitionId });
}

export async function listRegistrations(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "participants.manage");
  return db.competitionRegistration.findMany({
    where: { competitionId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          status: true,
          institution: { select: { name: true } },
          memberships: { where: { competitionId }, select: { team: { select: { id: true, name: true } } } },
        },
      },
    },
  });
}

export async function decideRegistration(
  actor: Actor | null,
  competitionId: string,
  registrationId: string,
  decision: "APPROVED" | "REJECTED",
) {
  const { user } = await requireCompetitionPermission(actor, competitionId, "participants.manage");
  const reg = await db.competitionRegistration.findFirst({ where: { id: registrationId, competitionId } });
  if (!reg) throw notFound("Registration");
  const updated = await db.competitionRegistration.update({
    where: { id: reg.id },
    data: { status: decision, decidedAt: new Date(), decidedById: user.id },
  });
  await audit({ actorId: user.id, action: "registration.decide", targetType: "registration", targetId: reg.id, competitionId, metadata: { decision, userId: reg.userId } });
  return updated;
}

// ───────────── Staff ─────────────

export async function listStaff(actor: Actor | null, competitionId: string) {
  await requireCompetitionPermission(actor, competitionId, "competition.view_staff");
  return db.competitionStaff.findMany({
    where: { competitionId },
    include: { user: { select: { id: true, username: true, displayName: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function assignStaff(actor: Actor | null, competitionId: string, username: string, role: "ORGANIZER" | "EVALUATOR") {
  const { user } = await requireCompetitionPermission(actor, competitionId, "competition.staff.manage");
  const target = await db.user.findUnique({ where: { username: username.toLowerCase() } });
  if (!target) throw notFound("User");
  if (!assignableStaffRoles(target.role).includes(role))
    throw badRequest(`A user with global role ${target.role} cannot be assigned as ${role}. An administrator must change their role first.`);
  const registered = await db.competitionRegistration.findUnique({
    where: { competitionId_userId: { competitionId, userId: target.id } },
  });
  if (registered && registered.status !== "WITHDRAWN") throw badRequest("Registered participants cannot be staff on the same competition.");
  try {
    const staff = await db.competitionStaff.create({ data: { competitionId, userId: target.id, role } });
    await audit({ actorId: user.id, action: "competition.staff.assign", targetType: "user", targetId: target.id, competitionId, metadata: { role } });
    return staff;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("User already has that role on this competition.");
    throw e;
  }
}

export async function removeStaff(actor: Actor | null, competitionId: string, staffId: string) {
  const { user } = await requireCompetitionPermission(actor, competitionId, "competition.staff.manage");
  const row = await db.competitionStaff.findFirst({ where: { id: staffId, competitionId } });
  if (!row) throw notFound("Staff assignment");
  if (row.role === "ORGANIZER") {
    const organizers = await db.competitionStaff.count({ where: { competitionId, role: "ORGANIZER" } });
    if (organizers <= 1) throw badRequest("A competition must keep at least one organizer.");
  }
  await db.competitionStaff.delete({ where: { id: row.id } });
  await audit({ actorId: user.id, action: "competition.staff.remove", targetType: "user", targetId: row.userId, competitionId, metadata: { role: row.role } });
}

// ───────────── Announcements ─────────────

export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(1).max(10_000),
  pinned: z.boolean().default(false),
});

export async function listAnnouncements(user: Actor | null, competitionId: string) {
  const competition = await db.competition.findUnique({ where: { id: competitionId }, select: { status: true } });
  if (!competition) throw notFound("Competition");
  if (competition.status === "DRAFT" && !(await competitionCan(user, competitionId, "competition.view_staff")))
    throw notFound("Competition");
  return db.announcement.findMany({
    where: { competitionId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    select: { id: true, title: true, body: true, pinned: true, createdAt: true, createdBy: { select: { displayName: true } } },
  });
}

export async function createAnnouncement(actor: Actor | null, competitionId: string, input: z.infer<typeof announcementSchema>) {
  const { user, competition } = await requireCompetitionPermission(actor, competitionId, "announcement.manage");
  const data = announcementSchema.parse(input);
  const a = await db.announcement.create({ data: { ...data, competitionId, createdById: user.id } });
  await audit({ actorId: user.id, action: "announcement.create", targetType: "announcement", targetId: a.id, competitionId });
  await notifyCompetition(competitionId, {
    type: "announcement",
    title: `${competition.name}: ${data.title}`,
    link: `/competitions/${competition.slug}#announcements`,
  });
  return a;
}

export async function deleteAnnouncement(actor: Actor | null, competitionId: string, announcementId: string) {
  const { user } = await requireCompetitionPermission(actor, competitionId, "announcement.manage");
  const res = await db.announcement.deleteMany({ where: { id: announcementId, competitionId } });
  if (res.count === 0) throw notFound("Announcement");
  await audit({ actorId: user.id, action: "announcement.delete", targetType: "announcement", targetId: announcementId, competitionId });
}
