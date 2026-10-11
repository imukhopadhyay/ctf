/**
 * Pure scoring maths. No I/O.
 */

/**
 * Dynamic challenge value (quadratic decay, as popularised by CTFd):
 * the first solver receives `initial`; value decreases quadratically and
 * reaches `minimum` after `decay` prior solves. Non-retroactive: callers pass
 * the number of solves that happened *before* the current one.
 */
export function dynamicValue(initial: number, minimum: number, decay: number, priorSolves: number): number {
  if (decay <= 0 || priorSolves <= 0) return Math.max(initial, minimum);
  const floor = Math.min(initial, minimum);
  const value = ((floor - initial) / (decay * decay)) * priorSolves * priorSolves + initial;
  return Math.max(floor, Math.ceil(value));
}

export function challengeValue(
  model: "STATIC" | "DYNAMIC",
  c: { points: number; minPoints: number; decay: number },
  priorSolves: number,
): number {
  return model === "DYNAMIC" ? dynamicValue(c.points, c.minPoints, c.decay, priorSolves) : c.points;
}

export interface LedgerEvent {
  subjectKey: string;
  points: number;
  type: string;
  createdAt: Date;
}

export interface SubjectInfo {
  subjectKey: string;
  name: string;
  hidden?: boolean;
}

export interface StandingRow {
  rank: number;
  subjectKey: string;
  name: string;
  points: number;
  solves: number;
  lastSolveAt: Date | null;
  submissions: number;
}

export interface StandingsInput {
  subjects: readonly SubjectInfo[];
  events: readonly LedgerEvent[];
  solves: readonly { subjectKey: string; createdAt: Date }[];
  submissionCounts?: ReadonlyMap<string, number>;
  tieBreak: "EARLIEST_LAST_SOLVE" | "FEWEST_SUBMISSIONS";
  cutoff?: Date | null; // leaderboard freeze
  includeHidden?: boolean;
}

/** Computes ranked standings from the score ledger. */
export function computeStandings(input: StandingsInput): StandingRow[] {
  const cutoff = input.cutoff?.getTime();
  const within = (d: Date) => cutoff === undefined || d.getTime() <= cutoff;

  const rows = new Map<string, StandingRow>();
  for (const s of input.subjects) {
    if (s.hidden && !input.includeHidden) continue;
    rows.set(s.subjectKey, {
      rank: 0,
      subjectKey: s.subjectKey,
      name: s.name,
      points: 0,
      solves: 0,
      lastSolveAt: null,
      submissions: input.submissionCounts?.get(s.subjectKey) ?? 0,
    });
  }
  for (const e of input.events) {
    const row = rows.get(e.subjectKey);
    if (row && within(e.createdAt)) row.points += e.points;
  }
  for (const s of input.solves) {
    const row = rows.get(s.subjectKey);
    if (!row || !within(s.createdAt)) continue;
    row.solves += 1;
    if (!row.lastSolveAt || s.createdAt > row.lastSolveAt) row.lastSolveAt = s.createdAt;
  }

  const lastSolve = (r: StandingRow) => r.lastSolveAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const compare = (a: StandingRow, b: StandingRow): number => {
    if (b.points !== a.points) return b.points - a.points;
    if (input.tieBreak === "FEWEST_SUBMISSIONS" && a.submissions !== b.submissions) {
      return a.submissions - b.submissions;
    }
    const la = lastSolve(a);
    const lb = lastSolve(b);
    return la === lb ? 0 : la < lb ? -1 : 1; // avoids Infinity - Infinity = NaN
  };

  const sorted = [...rows.values()].sort((a, b) => compare(a, b) || a.name.localeCompare(b.name));
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    row.rank = prev && compare(prev, row) === 0 ? prev.rank : i + 1;
  });
  return sorted;
}

/** Score progression points for charts: cumulative score per subject over time. */
export function scoreProgression(
  events: readonly LedgerEvent[],
  subjectKeys: readonly string[],
  cutoff?: Date | null,
): { subjectKey: string; series: { t: number; points: number }[] }[] {
  const wanted = new Set(subjectKeys);
  const sorted = [...events]
    .filter((e) => wanted.has(e.subjectKey) && (!cutoff || e.createdAt <= cutoff))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const totals = new Map<string, number>();
  const series = new Map<string, { t: number; points: number }[]>();
  for (const k of subjectKeys) series.set(k, []);
  for (const e of sorted) {
    const total = (totals.get(e.subjectKey) ?? 0) + e.points;
    totals.set(e.subjectKey, total);
    series.get(e.subjectKey)!.push({ t: e.createdAt.getTime(), points: total });
  }
  return subjectKeys.map((k) => ({ subjectKey: k, series: series.get(k)! }));
}

/** Experience points and levels (gamification only — independent of competition score). */
export function levelForXp(xp: number): { level: number; currentLevelXp: number; nextLevelXp: number } {
  const safe = Math.max(0, Math.floor(xp));
  // Level n requires 100 * (n-1)^2 XP: 0, 100, 400, 900, ...
  const level = Math.floor(Math.sqrt(safe / 100)) + 1;
  return { level, currentLevelXp: 100 * (level - 1) ** 2, nextLevelXp: 100 * level ** 2 };
}
