import "server-only";
import type { Competition, StaffRole } from "@prisma/client";
import { db } from "../db";
import { forbidden, notFound, unauthenticated } from "../errors";
import { securityEvent } from "../audit";
import type { SessionUser } from "../auth/session";
import {
  hasCompetitionPermission,
  hasPlatformPermission,
  type CompetitionPermission,
  type PlatformPermission,
} from "../domain/permissions";

export type Actor = SessionUser;

export function assertUser(user: Actor | null): asserts user is Actor {
  if (!user) throw unauthenticated();
}

export async function requirePlatform(user: Actor | null, permission: PlatformPermission): Promise<Actor> {
  assertUser(user);
  if (!hasPlatformPermission(user.role, permission)) {
    await securityEvent({ type: "ACCESS_DENIED", userId: user.id, details: { permission } });
    throw forbidden();
  }
  return user;
}

export async function staffRolesFor(userId: string, competitionId: string): Promise<StaffRole[]> {
  const rows = await db.competitionStaff.findMany({ where: { userId, competitionId }, select: { role: true } });
  return rows.map((r) => r.role);
}

export async function competitionCan(
  user: Actor | null,
  competitionId: string,
  permission: CompetitionPermission,
): Promise<boolean> {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const staffRoles = await staffRolesFor(user.id, competitionId);
  return hasCompetitionPermission({ globalRole: user.role, staffRoles }, permission);
}

/**
 * Throws unless the user holds `permission` on the competition. Non-staff get
 * a 404 for competitions they cannot otherwise see to avoid enumeration.
 */
export async function requireCompetitionPermission(
  user: Actor | null,
  competitionId: string,
  permission: CompetitionPermission,
): Promise<{ user: Actor; competition: Competition }> {
  assertUser(user);
  const competition = await db.competition.findUnique({ where: { id: competitionId } });
  if (!competition) throw notFound("Competition");
  if (!(await competitionCan(user, competitionId, permission))) {
    await securityEvent({
      type: "ACCESS_DENIED",
      userId: user.id,
      competitionId,
      details: { permission },
    });
    throw forbidden();
  }
  return { user, competition };
}

export interface Participation {
  registered: boolean;
  registrationStatus: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | null;
  teamId: string | null;
  teamRole: "CAPTAIN" | "MEMBER" | null;
  /** Scoring subject, or null if the user cannot currently score (not approved / no team). */
  subjectKey: string | null;
}

export const userSubject = (userId: string) => `user:${userId}`;
export const teamSubject = (teamId: string) => `team:${teamId}`;

export async function getParticipation(
  userId: string,
  competition: Pick<Competition, "id" | "mode">,
): Promise<Participation> {
  const [reg, membership] = await Promise.all([
    db.competitionRegistration.findUnique({
      where: { competitionId_userId: { competitionId: competition.id, userId } },
      select: { status: true },
    }),
    db.teamMembership.findUnique({
      where: { competitionId_userId: { competitionId: competition.id, userId } },
      select: { teamId: true, role: true },
    }),
  ]);
  const approved = reg?.status === "APPROVED";
  let subjectKey: string | null = null;
  if (approved) {
    if (competition.mode === "TEAM") subjectKey = membership ? teamSubject(membership.teamId) : null;
    else subjectKey = userSubject(userId);
  }
  return {
    registered: !!reg,
    registrationStatus: reg?.status ?? null,
    teamId: membership?.teamId ?? null,
    teamRole: membership?.role ?? null,
    subjectKey,
  };
}

/** Parses a subject key into its parts. */
export function parseSubject(subjectKey: string): { kind: "team" | "user"; id: string } {
  const [kind, id] = subjectKey.split(":");
  if ((kind !== "team" && kind !== "user") || !id) throw new Error(`Invalid subject key ${subjectKey}`);
  return { kind, id };
}
