/**
 * RBAC permission matrix. Capabilities are defined in code (not in the
 * database) so that role data cannot be used to mint new capabilities.
 */
export type GlobalRole = "ADMIN" | "ORGANIZER" | "EVALUATOR" | "PARTICIPANT";
export type CompetitionStaffRole = "ORGANIZER" | "EVALUATOR";

export const PLATFORM_PERMISSIONS = [
  "platform.users.manage",
  "platform.institutions.manage",
  "platform.settings.manage",
  "platform.environments.manage",
  "platform.achievements.manage",
  "platform.audit.view",
  "platform.security.view",
  "platform.reports.export",
  "competition.create",
  "evaluator.dashboard",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const COMPETITION_PERMISSIONS = [
  "competition.view_staff", // see drafts, staff-only fields, live leaderboard
  "competition.configure", // edit settings, change lifecycle state
  "competition.staff.manage", // assign organizers / evaluators
  "challenge.manage", // create / edit / publish / rotate flags
  "challenge.review", // submit quality reviews
  "submission.grade", // grade MANUAL challenges
  "submission.view_all", // see every submission (anti-cheat, disputes)
  "participants.manage", // approve registrations, manage teams
  "announcement.manage",
  "score.adjust", // manual adjustments and recalculation
  "analytics.view",
  "reports.export",
] as const;
export type CompetitionPermission = (typeof COMPETITION_PERMISSIONS)[number];

const PLATFORM_MATRIX: Record<GlobalRole, readonly PlatformPermission[]> = {
  ADMIN: PLATFORM_PERMISSIONS,
  ORGANIZER: ["competition.create"],
  EVALUATOR: ["evaluator.dashboard"],
  PARTICIPANT: [],
};

const STAFF_MATRIX: Record<CompetitionStaffRole, readonly CompetitionPermission[]> = {
  ORGANIZER: COMPETITION_PERMISSIONS,
  EVALUATOR: [
    "competition.view_staff",
    "challenge.review",
    "submission.grade",
    "submission.view_all",
    "analytics.view",
    "reports.export",
  ],
};

export function hasPlatformPermission(role: GlobalRole, permission: PlatformPermission): boolean {
  return PLATFORM_MATRIX[role].includes(permission);
}

export interface CompetitionAccessContext {
  globalRole: GlobalRole;
  staffRoles: readonly CompetitionStaffRole[];
}

export function hasCompetitionPermission(
  ctx: CompetitionAccessContext,
  permission: CompetitionPermission,
): boolean {
  if (ctx.globalRole === "ADMIN") return true;
  // Staff assignments only take effect for users whose global role is staff-capable;
  // a participant account that was once assigned cannot act as staff.
  if (ctx.globalRole === "PARTICIPANT") return false;
  return ctx.staffRoles.some((r) => STAFF_MATRIX[r].includes(permission));
}

/** Which staff roles a global role may be assigned on a competition. */
export function assignableStaffRoles(globalRole: GlobalRole): CompetitionStaffRole[] {
  switch (globalRole) {
    case "ADMIN":
    case "ORGANIZER":
      return ["ORGANIZER", "EVALUATOR"];
    case "EVALUATOR":
      return ["EVALUATOR"];
    default:
      return [];
  }
}
