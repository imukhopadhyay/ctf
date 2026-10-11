import { db } from "@/server/db";
import { env } from "@/server/env";
import { flagDigest, normalizeFlag } from "@/server/domain/flag-match";
import { resetMemoryRateLimits } from "@/server/ratelimit";
import type { SessionUser } from "@/server/auth/session";
import type { Prisma } from "@prisma/client";

const TABLES = [
  "ChallengeInstanceEvent", "ChallengeInstance", "ScoreEvent", "Solve", "Submission", "HintUnlock", "Hint",
  "FlagConfiguration", "ChallengeArtifact", "ChallengeVersion", "ChallengeReview", "_ChallengePrerequisites", "Challenge",
  "TeamAchievement", "UserAchievement", "Achievement", "TeamMembership", "Team", "CompetitionRegistration",
  "CompetitionStaff", "Announcement", "Notification", "AuditLog", "SecurityEvent", "Competition", "Session", "User",
  "Institution", "ChallengeCategory", "ExecutionEnvironment", "PlatformSetting", "Job",
];

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  resetMemoryRateLimits();
}

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function makeUser(role: SessionUser["role"] = "PARTICIPANT", overrides: Partial<Prisma.UserCreateInput> = {}): Promise<SessionUser> {
  const u = uniq();
  return db.user.create({
    data: { email: `u${u}@example.test`, username: `u${u}`, displayName: `User ${u}`, passwordHash: "x", role, ...overrides },
    select: { id: true, email: true, username: true, displayName: true, role: true, status: true },
  });
}

export async function makeCategories() {
  const cats = [
    ["web", "Web Exploitation"],
    ["crypto", "Cryptography"],
    ["reverse", "Reverse Engineering"],
    ["forensics", "Forensics"],
  ] as const;
  const out: Record<string, string> = {};
  for (const [i, [slug, name]] of cats.entries()) {
    const c = await db.challengeCategory.upsert({ where: { slug }, create: { slug, name, sortOrder: i }, update: {} });
    out[slug] = c.id;
  }
  return out;
}

export async function makeCompetition(organizer: SessionUser, overrides: Partial<Prisma.CompetitionUncheckedCreateInput> = {}) {
  const u = uniq();
  const c = await db.competition.create({
    data: {
      slug: `comp-${u}`,
      name: `Competition ${u}`,
      status: "ACTIVE",
      startsAt: new Date(Date.now() - 3600_000),
      endsAt: new Date(Date.now() + 24 * 3600_000),
      rules: "Be excellent to each other. Only attack the provided targets.",
      createdById: organizer.id,
      ...overrides,
    },
  });
  await db.competitionStaff.create({ data: { competitionId: c.id, userId: organizer.id, role: "ORGANIZER" } });
  return c;
}

export async function makeChallenge(
  competitionId: string,
  categoryId: string,
  opts: { flag?: string; caseSensitive?: boolean; normalizeWhitespace?: boolean; points?: number; overrides?: Partial<Prisma.ChallengeUncheckedCreateInput> } = {},
) {
  const u = uniq();
  const c = await db.challenge.create({
    data: {
      competitionId,
      categoryId,
      slug: `chal-${u}`,
      title: `Challenge ${u}`,
      description: "A synthetic test challenge description that is long enough.",
      points: opts.points ?? 100,
      status: "PUBLISHED",
      flagsTestedAt: new Date(),
      ...opts.overrides,
    },
  });
  if (opts.flag !== undefined) {
    const rule = { caseSensitive: opts.caseSensitive ?? true, normalizeWhitespace: opts.normalizeWhitespace ?? false };
    await db.flagConfiguration.create({
      data: { challengeId: c.id, type: "STATIC", digest: flagDigest(env().FLAG_PEPPER, normalizeFlag(opts.flag, rule), 1), ...rule },
    });
  }
  return c;
}

export async function register(competitionId: string, user: SessionUser, status: "APPROVED" | "PENDING" = "APPROVED") {
  return db.competitionRegistration.create({ data: { competitionId, userId: user.id, status } });
}

export async function makeTeam(competitionId: string, members: SessionUser[], name = `Team ${uniq()}`) {
  const team = await db.team.create({
    data: { competitionId, name, nameNormalized: name.toLowerCase(), inviteCode: uniq().toUpperCase().padEnd(10, "X").slice(0, 10), captainId: members[0]?.id },
  });
  for (const [i, m] of members.entries()) {
    await db.teamMembership.create({ data: { teamId: team.id, userId: m.id, competitionId, role: i === 0 ? "CAPTAIN" : "MEMBER" } });
  }
  return team;
}

export const ip = { ip: "203.0.113.7" };
