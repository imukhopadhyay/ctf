import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { submitFlag } from "@/server/services/submissions";
import { unlockHint } from "@/server/services/hints";
import { getStandings } from "@/server/services/leaderboard";
import { recalculateScores, adjustScore, explainScore } from "@/server/services/score-admin";
import { processJobs } from "@/server/services/worker-tasks";
import { ip, makeCategories, makeChallenge, makeCompetition, makeTeam, makeUser, register, resetDb } from "../helpers/factory";

let cats: Record<string, string>;
beforeEach(async () => {
  await resetDb();
  cats = await makeCategories();
});

async function individualSetup(compOverrides = {}, chalOpts = {}) {
  const org = await makeUser("ORGANIZER");
  const comp = await makeCompetition(org, compOverrides);
  const chal = await makeChallenge(comp.id, cats.crypto!, { flag: "CQ{correct_horse}", ...chalOpts });
  const p = await makeUser();
  await register(comp.id, p);
  return { org, comp, chal, p };
}

describe("flag submission", () => {
  it("accepts a correct flag, awards points once, and records an auditable score event", async () => {
    const { comp, chal, p } = await individualSetup();
    const res = await submitFlag(p, comp.id, chal.id, "CQ{correct_horse}", ip);
    expect(res.status).toBe("correct");
    expect(res.pointsAwarded).toBe(100);
    expect(res.firstBlood).toBe(true);
    expect(res.scoreEvent?.type).toBe("SOLVE");
    expect(JSON.stringify(res)).not.toContain("correct_horse");

    const again = await submitFlag(p, comp.id, chal.id, "CQ{correct_horse}", ip);
    expect(again.status).toBe("already_solved");
    const events = await db.scoreEvent.findMany({ where: { competitionId: comp.id } });
    expect(events).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "score.solve" } })).toBe(1);
  });

  it("rejects incorrect flags without revealing the answer and stores no plaintext", async () => {
    const { comp, chal, p } = await individualSetup();
    const res = await submitFlag(p, comp.id, chal.id, "CQ{wrong_guess_value}", ip);
    expect(res).toMatchObject({ status: "incorrect", message: "Incorrect flag." });
    const sub = await db.submission.findFirstOrThrow({ where: { userId: p.id } });
    expect(JSON.stringify(sub)).not.toContain("wrong_guess_value");
    expect(sub.fingerprint).toHaveLength(24);
  });

  it("honours case-insensitive and whitespace-normalized configuration", async () => {
    const { comp, chal, p } = await individualSetup({}, { flag: "CQ{Mixed Case  Flag}", caseSensitive: false, normalizeWhitespace: true });
    expect((await submitFlag(p, comp.id, chal.id, "  cq{mixed case flag} ", ip)).status).toBe("correct");
  });

  it("enforces attempt limits", async () => {
    const { comp, chal, p } = await individualSetup({}, { overrides: { attemptLimit: 2 } });
    expect((await submitFlag(p, comp.id, chal.id, "CQ{a}", ip)).status).toBe("incorrect");
    expect((await submitFlag(p, comp.id, chal.id, "CQ{b}", ip)).status).toBe("incorrect");
    const blocked = await submitFlag(p, comp.id, chal.id, "CQ{correct_horse}", ip);
    expect(blocked.status).toBe("limit_reached");
    expect(await db.solve.count()).toBe(0);
  });

  it("applies incorrect-submission penalties when enabled", async () => {
    const { comp, chal, p } = await individualSetup({ wrongSubmissionPenalty: 5 });
    const r = await submitFlag(p, comp.id, chal.id, "CQ{nope}", ip);
    expect(r.scoreEvent).toMatchObject({ type: "WRONG_SUBMISSION_PENALTY", points: -5 });
  });

  it("reports unavailable when the competition is paused or the challenge closed", async () => {
    const { comp, chal, p } = await individualSetup({ status: "PAUSED" });
    expect((await submitFlag(p, comp.id, chal.id, "CQ{correct_horse}", ip)).status).toBe("unavailable");
    await db.competition.update({ where: { id: comp.id }, data: { status: "ACTIVE" } });
    await db.challenge.update({ where: { id: chal.id }, data: { closeAt: new Date(Date.now() - 1000) } });
    expect((await submitFlag(p, comp.id, chal.id, "CQ{correct_horse}", ip)).status).toBe("unavailable");
  });

  it("rate limits rapid submissions per user and challenge", async () => {
    const { comp, chal, p } = await individualSetup();
    const results = [];
    for (let i = 0; i < 12; i++) results.push((await submitFlag(p, comp.id, chal.id, `CQ{guess${i}}`, ip)).status);
    expect(results.filter((s) => s === "rate_limited").length).toBeGreaterThanOrEqual(1);
    expect(await db.securityEvent.count({ where: { type: "RATE_LIMIT" } })).toBeGreaterThanOrEqual(1);
  });

  it("dynamic scoring decays for later solvers and first blood goes only to the first", async () => {
    const org = await makeUser("ORGANIZER");
    const comp = await makeCompetition(org, { scoringModel: "DYNAMIC" });
    const chal = await makeChallenge(comp.id, cats.web!, { flag: "CQ{dyn}", points: 500, overrides: { minPoints: 100, decay: 2 } });
    const users = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const u of users) await register(comp.id, u);
    const r = [];
    for (const u of users) r.push(await submitFlag(u, comp.id, chal.id, "CQ{dyn}", ip));
    expect(r.map((x) => x.pointsAwarded)).toEqual([500, 400, 100]);
    expect(r.map((x) => x.firstBlood)).toEqual([true, false, false]);
  });
});

describe("concurrency", () => {
  it("parallel correct submissions from the same team score exactly once", async () => {
    const org = await makeUser("ORGANIZER");
    const comp = await makeCompetition(org, { mode: "TEAM" });
    const chal = await makeChallenge(comp.id, cats.forensics!, { flag: "CQ{race}" });
    const members = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser()]);
    for (const m of members) await register(comp.id, m);
    const team = await makeTeam(comp.id, members);

    const results = await Promise.all(
      [...members, ...members].map((m, i) => submitFlag(m, comp.id, chal.id, "CQ{race}", { ip: `198.51.100.${i}` })),
    );
    expect(results.filter((r) => r.status === "correct")).toHaveLength(1);
    expect(results.filter((r) => r.status === "already_solved")).toHaveLength(7);
    expect(await db.solve.count({ where: { teamId: team.id } })).toBe(1);
    const sum = await db.scoreEvent.aggregate({ where: { subjectKey: `team:${team.id}` }, _sum: { points: true } });
    expect(sum._sum.points).toBe(100);
  });

  it("parallel solves by different subjects get exactly one first blood and correct dynamic values", async () => {
    const org = await makeUser("ORGANIZER");
    const comp = await makeCompetition(org, { scoringModel: "DYNAMIC" });
    const chal = await makeChallenge(comp.id, cats.web!, { flag: "CQ{par}", points: 500, overrides: { minPoints: 100, decay: 4 } });
    const users = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    for (const u of users) await register(comp.id, u);
    const results = await Promise.all(users.map((u, i) => submitFlag(u, comp.id, chal.id, "CQ{par}", { ip: `192.0.2.${i}` })));
    expect(results.every((r) => r.status === "correct")).toBe(true);
    expect(results.filter((r) => r.firstBlood)).toHaveLength(1);
    expect(results.map((r) => r.pointsAwarded).sort((a, b) => b! - a!)).toEqual([500, 475, 400, 275, 100, 100]);
  });

  it("parallel incorrect submissions cannot exceed the attempt limit", async () => {
    const { comp, chal, p } = await individualSetup({}, { overrides: { attemptLimit: 3 } });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => submitFlag(p, comp.id, chal.id, `CQ{x${i}}`, { ip: `10.0.0.${i}` })));
    expect(results.filter((r) => r.status === "incorrect")).toHaveLength(3);
    expect(await db.submission.count({ where: { result: "INCORRECT" } })).toBe(3);
  });
});

describe("team scoring", () => {
  it("requires team membership in team mode and aggregates member solves", async () => {
    const org = await makeUser("ORGANIZER");
    const comp = await makeCompetition(org, { mode: "TEAM" });
    const c1 = await makeChallenge(comp.id, cats.crypto!, { flag: "CQ{one}", points: 100 });
    const c2 = await makeChallenge(comp.id, cats.web!, { flag: "CQ{two}", points: 200 });
    const [a, b, loner] = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const u of [a!, b!, loner!]) await register(comp.id, u);
    const team = await makeTeam(comp.id, [a!, b!], "Red Team");

    await expect(submitFlag(loner!, comp.id, c1.id, "CQ{one}", ip)).rejects.toThrow(/team/i);
    expect((await submitFlag(a!, comp.id, c1.id, "CQ{one}", ip)).status).toBe("correct");
    expect((await submitFlag(b!, comp.id, c1.id, "CQ{one}", ip)).status).toBe("already_solved");
    expect((await submitFlag(b!, comp.id, c2.id, "CQ{two}", ip)).status).toBe("correct");

    const standings = await getStandings(a!, comp.id);
    const row = standings.rows.find((r) => r.subjectKey === `team:${team.id}`)!;
    expect(row).toMatchObject({ points: 300, solves: 2, rank: 1, isMe: true });
  });
});

describe("hints", () => {
  async function hintSetup(compOverrides = {}) {
    const ctx = await individualSetup(compOverrides);
    const h1 = await db.hint.create({ data: { challengeId: ctx.chal.id, order: 1, title: "Nudge", content: "Look at ROT13", cost: 10 } });
    const h2 = await db.hint.create({ data: { challengeId: ctx.chal.id, order: 2, title: "Big hint", content: "It is ROT13 of the flag", cost: 25, minAttempts: 1 } });
    return { ...ctx, h1, h2 };
  }

  it("charges the configured penalty once and is idempotent", async () => {
    const { comp, chal, p, h1 } = await hintSetup();
    const r1 = await unlockHint(p, comp.id, chal.id, h1.id);
    expect(r1).toMatchObject({ cost: 10, alreadyUnlocked: false, hint: { content: "Look at ROT13" } });
    const r2 = await unlockHint(p, comp.id, chal.id, h1.id);
    expect(r2).toMatchObject({ cost: 0, alreadyUnlocked: true });
    const ev = await db.scoreEvent.findMany({ where: { type: "HINT_PENALTY" } });
    expect(ev.map((e) => e.points)).toEqual([-10]);
  });

  it("enforces ordering and attempt-based unlock conditions", async () => {
    const { comp, chal, p, h1, h2 } = await hintSetup();
    await expect(unlockHint(p, comp.id, chal.id, h2.id)).rejects.toThrow(/previous hint/);
    await unlockHint(p, comp.id, chal.id, h1.id);
    await expect(unlockHint(p, comp.id, chal.id, h2.id)).rejects.toThrow(/incorrect attempt/);
    await submitFlag(p, comp.id, chal.id, "CQ{wrong}", ip);
    expect((await unlockHint(p, comp.id, chal.id, h2.id)).cost).toBe(25);
  });

  it("does not charge when hint penalties are disabled", async () => {
    const { comp, chal, p, h1 } = await hintSetup({ hintPenaltiesEnabled: false });
    expect((await unlockHint(p, comp.id, chal.id, h1.id)).cost).toBe(0);
    expect(await db.scoreEvent.count()).toBe(0);
  });

  it("net score reflects solve minus hint penalty", async () => {
    const { comp, chal, p, h1 } = await hintSetup();
    await unlockHint(p, comp.id, chal.id, h1.id);
    await submitFlag(p, comp.id, chal.id, "CQ{correct_horse}", ip);
    const s = await getStandings(p, comp.id);
    expect(s.rows[0]!.points).toBe(90);
  });
});

describe("leaderboard & score administration", () => {
  it("freezes public standings but staff see live data", async () => {
    const { org, comp, chal, p } = await individualSetup({ freezeAt: new Date(Date.now() - 60_000) });
    await submitFlag(p, comp.id, chal.id, "CQ{correct_horse}", ip);
    const pub = await getStandings(p, comp.id);
    expect(pub.frozen).toBe(true);
    expect(pub.rows[0]!.points).toBe(0);
    const staff = await getStandings(org, comp.id);
    expect(staff.frozen).toBe(false);
    expect(staff.rows[0]!.points).toBe(100);
  });

  it("anonymizes other competitors when configured", async () => {
    const { comp, p } = await individualSetup({ identityDisplay: "ANONYMIZED" });
    const other = await makeUser();
    await register(comp.id, other);
    const s = await getStandings(p, comp.id);
    expect(s.rows.find((r) => r.isMe)!.name).toContain(p.displayName);
    expect(s.rows.find((r) => !r.isMe)!.name).toMatch(/^Competitor [0-9A-F]{6}$/);
  });

  it("manual adjustments are audited and explained", async () => {
    const { org, comp, p } = await individualSetup();
    await adjustScore(org, comp.id, { subjectKey: `user:${p.id}`, points: 15, reason: "Dispute resolved in favour" });
    const ex = await explainScore(p, comp.id, `user:${p.id}`);
    expect(ex.total).toBe(15);
    expect(ex.events[0]!.reason).toBe("Dispute resolved in favour");
    expect(await db.auditLog.count({ where: { action: "score.adjust" } })).toBe(1);
  });

  it("participants cannot adjust scores or view another subject's ledger", async () => {
    const { comp, p } = await individualSetup();
    const other = await makeUser();
    await register(comp.id, other);
    await expect(adjustScore(p, comp.id, { subjectKey: `user:${p.id}`, points: 1000, reason: "I deserve it" })).rejects.toThrow(/permission/);
    await expect(explainScore(p, comp.id, `user:${other.id}`)).rejects.toThrow();
  });

  it("recalculation reconciles after an organizer changes point values, and is idempotent", async () => {
    const { org, comp, chal, p } = await individualSetup();
    await submitFlag(p, comp.id, chal.id, "CQ{correct_horse}", ip);
    await db.challenge.update({ where: { id: chal.id }, data: { points: 150 } });
    const preview = await recalculateScores(org, comp.id, false);
    expect(preview.deltas).toEqual([{ subjectKey: `user:${p.id}`, current: 100, expected: 150, delta: 50 }]);
    await recalculateScores(org, comp.id, true);
    expect((await getStandings(org, comp.id)).rows[0]!.points).toBe(150);
    expect((await recalculateScores(org, comp.id, true)).deltas).toEqual([]);
  });
});

describe("worker", () => {
  it("awards achievements and first-blood notifications after a solve", async () => {
    const { comp, chal, p } = await individualSetup();
    await db.achievement.create({ data: { key: "first-blood", name: "First Blood", description: "First solve", criteria: { type: "first_blood", count: 1 } } });
    await db.achievement.create({ data: { key: "crypto-3", name: "Crypto Specialist", description: "3 crypto", criteria: { type: "category_solves", category: "crypto", count: 3 } } });
    await submitFlag(p, comp.id, chal.id, "CQ{correct_horse}", ip);
    expect(await processJobs()).toBe(2);
    const earned = await db.userAchievement.findMany({ where: { userId: p.id }, include: { achievement: true } });
    expect(earned.map((e) => e.achievement.key)).toEqual(["first-blood"]);
    expect(await db.notification.count({ where: { userId: p.id, type: "first_blood" } })).toBe(1);
    // Re-evaluating is idempotent.
    await processJobs();
    expect(await db.userAchievement.count({ where: { userId: p.id } })).toBe(1);
  });
});
