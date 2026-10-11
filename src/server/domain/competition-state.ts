export type CompetitionStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

const TRANSITIONS: Record<CompetitionStatus, readonly CompetitionStatus[]> = {
  DRAFT: ["SCHEDULED", "ARCHIVED"],
  SCHEDULED: ["DRAFT", "ACTIVE", "ARCHIVED"],
  ACTIVE: ["PAUSED", "COMPLETED"],
  PAUSED: ["ACTIVE", "COMPLETED"],
  COMPLETED: ["ARCHIVED", "ACTIVE"], // re-open (e.g. extension after dispute)
  ARCHIVED: [],
};

export function canTransition(from: CompetitionStatus, to: CompetitionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: CompetitionStatus): readonly CompetitionStatus[] {
  return TRANSITIONS[from];
}

export interface CompetitionConfig {
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  registrationDeadline: Date | null;
  mode: "INDIVIDUAL" | "TEAM";
  minTeamSize: number;
  maxTeamSize: number;
  freezeAt: Date | null;
  rules: string;
  accessMode: "PUBLIC" | "PRIVATE" | "INVITATION";
  hasInviteCode: boolean;
  isPractice: boolean;
  timezone: string;
}

/** Configuration problems that block publication (DRAFT -> SCHEDULED). */
export function validateCompetitionConfig(c: CompetitionConfig, publishedChallengeCount: number): string[] {
  const problems: string[] = [];
  if (c.name.trim().length < 3) problems.push("Name must be at least 3 characters.");
  if (!isValidTimezone(c.timezone)) problems.push(`Unknown timezone "${c.timezone}".`);
  if (!c.isPractice && !c.endsAt) problems.push("An end time is required (except for practice arenas).");
  if (c.endsAt && c.endsAt <= c.startsAt) problems.push("End time must be after the start time.");
  if (c.registrationDeadline && c.endsAt && c.registrationDeadline > c.endsAt)
    problems.push("Registration deadline must be before the end time.");
  if (c.freezeAt && (c.freezeAt <= c.startsAt || (c.endsAt && c.freezeAt >= c.endsAt)))
    problems.push("Leaderboard freeze must fall between start and end.");
  if (c.mode === "TEAM") {
    if (c.minTeamSize < 1) problems.push("Minimum team size must be at least 1.");
    if (c.maxTeamSize < c.minTeamSize) problems.push("Maximum team size must be ≥ minimum team size.");
    if (c.maxTeamSize > 50) problems.push("Maximum team size cannot exceed 50.");
  }
  if (c.rules.trim().length < 20) problems.push("Competition rules must be provided (at least 20 characters).");
  if (c.accessMode === "INVITATION" && !c.hasInviteCode)
    problems.push("Invitation-only competitions need an invitation code.");
  if (publishedChallengeCount < 1) problems.push("At least one challenge must be published.");
  return problems;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Is the competition currently accepting flag submissions? */
export function acceptsSubmissions(
  c: { status: CompetitionStatus; startsAt: Date; endsAt: Date | null },
  now: Date,
): boolean {
  if (c.status !== "ACTIVE") return false;
  if (now < c.startsAt) return false;
  if (c.endsAt && now >= c.endsAt) return false;
  return true;
}

/** Which status the clock implies for scheduled/active competitions (worker uses this). */
export function clockTransition(
  c: { status: CompetitionStatus; startsAt: Date; endsAt: Date | null },
  now: Date,
): CompetitionStatus | null {
  if (c.status === "SCHEDULED" && now >= c.startsAt && (!c.endsAt || now < c.endsAt)) return "ACTIVE";
  if ((c.status === "ACTIVE" || c.status === "SCHEDULED") && c.endsAt && now >= c.endsAt) return "COMPLETED";
  return null;
}

export function registrationOpen(
  c: {
    status: CompetitionStatus;
    registrationOpensAt: Date | null;
    registrationDeadline: Date | null;
    endsAt: Date | null;
  },
  now: Date,
): boolean {
  if (!["SCHEDULED", "ACTIVE", "PAUSED"].includes(c.status)) return false;
  if (c.registrationOpensAt && now < c.registrationOpensAt) return false;
  if (c.registrationDeadline && now > c.registrationDeadline) return false;
  if (c.endsAt && now >= c.endsAt) return false;
  return true;
}
