import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";
import { notFound } from "../errors";
import { redis } from "../redis";
import { computeStandings, scoreProgression, type StandingRow } from "../domain/scoring";
import { competitionCan, getParticipation, type Actor } from "./access";

const CACHE_TTL_SECONDS = 15;
const memoryCache = new Map<string, { expires: number; value: string }>();
const memoryVersions = new Map<string, number>();

async function cacheVersion(competitionId: string): Promise<number> {
  const r = redis();
  if (r) {
    try {
      return Number((await r.get(`lbv:${competitionId}`)) ?? 0);
    } catch {
      return -1; // cache disabled on error
    }
  }
  return memoryVersions.get(competitionId) ?? 0;
}

export async function invalidateLeaderboard(competitionId: string) {
  const r = redis();
  if (r) {
    try {
      await r.incr(`lbv:${competitionId}`);
    } catch (e) {
      console.error("[leaderboard] cache invalidation failed", (e as Error).message);
    }
  }
  memoryVersions.set(competitionId, (memoryVersions.get(competitionId) ?? 0) + 1);
}

async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const r = redis();
  if (r) {
    try {
      const hit = await r.get(key);
      if (hit) return JSON.parse(hit, reviveDates) as T;
      const value = await compute();
      await r.set(key, JSON.stringify(value), "EX", CACHE_TTL_SECONDS);
      return value;
    } catch {
      return compute();
    }
  }
  const hit = memoryCache.get(key);
  if (hit && hit.expires > Date.now()) return JSON.parse(hit.value, reviveDates) as T;
  const value = await compute();
  memoryCache.set(key, { expires: Date.now() + CACHE_TTL_SECONDS * 1000, value: JSON.stringify(value) });
  if (memoryCache.size > 500) memoryCache.clear();
  return value;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
function reviveDates(_k: string, v: unknown) {
  return typeof v === "string" && ISO.test(v) ? new Date(v) : v;
}

export interface StandingsEntry extends StandingRow {
  isMe: boolean;
  categorySolves: Record<string, number>;
  members?: number;
}

interface RawStandings {
  rows: (StandingRow & { categorySolves: Record<string, number>; members?: number })[];
  progression: { subjectKey: string; series: { t: number; points: number }[] }[];
}

async function computeRaw(
  competition: { id: string; mode: "INDIVIDUAL" | "TEAM"; tieBreak: "EARLIEST_LAST_SOLVE" | "FEWEST_SUBMISSIONS" },
  cutoff: Date | null,
  includeHidden: boolean,
): Promise<RawStandings> {
  const competitionId = competition.id;
  const subjects =
    competition.mode === "TEAM"
      ? (
          await db.team.findMany({
            where: { competitionId },
            select: { id: true, name: true, hidden: true, _count: { select: { members: true } } },
          })
        ).map((t) => ({ subjectKey: `team:${t.id}`, name: t.name, hidden: t.hidden, members: t._count.members }))
      : (
          await db.competitionRegistration.findMany({
            where: { competitionId, status: "APPROVED" },
            select: { user: { select: { id: true, displayName: true, username: true } } },
          })
        ).map((r) => ({ subjectKey: `user:${r.user.id}`, name: `${r.user.displayName} (@${r.user.username})`, hidden: false, members: undefined }));

  const timeFilter = cutoff ? { createdAt: { lte: cutoff } } : {};
  const [events, solves, subCounts] = await Promise.all([
    db.scoreEvent.findMany({ where: { competitionId, ...timeFilter }, select: { subjectKey: true, points: true, type: true, createdAt: true } }),
    db.solve.findMany({
      where: { competitionId, ...timeFilter },
      select: { subjectKey: true, createdAt: true, challenge: { select: { category: { select: { slug: true } } } } },
    }),
    competition.tieBreak === "FEWEST_SUBMISSIONS"
      ? db.submission.groupBy({ by: ["subjectKey"], where: { competitionId, ...timeFilter }, _count: { _all: true } })
      : Promise.resolve([] as { subjectKey: string; _count: { _all: number } }[]),
  ]);

  const standings = computeStandings({
    subjects,
    events,
    solves,
    submissionCounts: new Map(subCounts.map((s) => [s.subjectKey, s._count._all])),
    tieBreak: competition.tieBreak,
    cutoff,
    includeHidden,
  });
  const categories = new Map<string, Record<string, number>>();
  for (const s of solves) {
    const rec = categories.get(s.subjectKey) ?? {};
    rec[s.challenge.category.slug] = (rec[s.challenge.category.slug] ?? 0) + 1;
    categories.set(s.subjectKey, rec);
  }
  const memberCount = new Map(subjects.map((s) => [s.subjectKey, s.members]));
  const top = standings.slice(0, 10).map((r) => r.subjectKey);
  return {
    rows: standings.map((r) => ({ ...r, categorySolves: categories.get(r.subjectKey) ?? {}, members: memberCount.get(r.subjectKey) })),
    progression: scoreProgression(events, top, cutoff),
  };
}

function anonymousName(competitionId: string, subjectKey: string) {
  const h = createHash("sha256").update(`${competitionId}:${subjectKey}`).digest("hex").slice(0, 6).toUpperCase();
  return `Competitor ${h}`;
}

/**
 * Standings for a competition. Public viewers see frozen standings after
 * `freezeAt` and anonymized identities when configured; staff see live data.
 */
export async function getStandings(actor: Actor | null, competitionIdOrSlug: string, opts: { publicView?: boolean } = {}) {
  const competition = await db.competition.findFirst({
    where: { OR: [{ id: competitionIdOrSlug }, { slug: competitionIdOrSlug }] },
    select: { id: true, slug: true, name: true, status: true, mode: true, tieBreak: true, freezeAt: true, identityDisplay: true, startsAt: true, endsAt: true },
  });
  if (!competition) throw notFound("Competition");
  const isStaff = !opts.publicView && (await competitionCan(actor, competition.id, "competition.view_staff"));
  if (competition.status === "DRAFT" && !isStaff) throw notFound("Competition");

  const now = new Date();
  const frozen = !isStaff && !!competition.freezeAt && now >= competition.freezeAt && competition.status !== "ARCHIVED";
  const cutoff = frozen ? competition.freezeAt : null;
  const version = await cacheVersion(competition.id);
  const key = `lb:${competition.id}:v${version}:${isStaff ? "staff" : "public"}:${cutoff?.getTime() ?? "live"}`;
  const raw = version < 0 ? await computeRaw(competition, cutoff, isStaff) : await cached(key, () => computeRaw(competition, cutoff, isStaff));

  const mySubject = actor ? (await getParticipation(actor.id, competition)).subjectKey : null;
  const anonymize = competition.identityDisplay === "ANONYMIZED" && !isStaff;
  const label = (subjectKey: string, name: string) =>
    anonymize && subjectKey !== mySubject ? anonymousName(competition.id, subjectKey) : name;

  const rows: StandingsEntry[] = raw.rows.map((r) => ({ ...r, name: label(r.subjectKey, r.name), isMe: r.subjectKey === mySubject }));
  const names = new Map(rows.map((r) => [r.subjectKey, r.name]));
  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name, mode: competition.mode, status: competition.status },
    frozen,
    freezeAt: competition.freezeAt,
    isStaffView: isStaff,
    generatedAt: now,
    rows,
    progression: raw.progression.map((p) => ({ name: names.get(p.subjectKey) ?? "?", isMe: p.subjectKey === mySubject, series: p.series })),
  };
}

/** Score and rank of one subject (for dashboards). */
export async function subjectStanding(actor: Actor | null, competitionId: string, subjectKey: string) {
  const standings = await getStandings(actor, competitionId);
  const row = standings.rows.find((r) => r.subjectKey === subjectKey);
  return { row: row ?? null, total: standings.rows.length, frozen: standings.frozen };
}
