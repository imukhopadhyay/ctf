import { describe, expect, it } from "vitest";
import { challengeValue, computeStandings, dynamicValue, levelForXp, scoreProgression } from "@/server/domain/scoring";

describe("dynamicValue", () => {
  it("gives the first solver the full value", () => {
    expect(dynamicValue(500, 100, 10, 0)).toBe(500);
  });
  it("decays monotonically and reaches the minimum at `decay` prior solves", () => {
    let prev = Infinity;
    for (let n = 0; n <= 10; n++) {
      const v = dynamicValue(500, 100, 10, n);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    expect(dynamicValue(500, 100, 10, 10)).toBe(100);
    expect(dynamicValue(500, 100, 10, 50)).toBe(100);
  });
  it("matches the quadratic formula", () => {
    // ((100-500)/100)*25 + 500 = 400
    expect(dynamicValue(500, 100, 10, 5)).toBe(400);
  });
  it("handles degenerate configuration", () => {
    expect(dynamicValue(300, 100, 0, 5)).toBe(300);
    expect(dynamicValue(100, 300, 10, 5)).toBeGreaterThanOrEqual(100);
  });
  it("static model ignores solve count", () => {
    expect(challengeValue("STATIC", { points: 250, minPoints: 50, decay: 5 }, 99)).toBe(250);
    expect(challengeValue("DYNAMIC", { points: 250, minPoints: 50, decay: 5 }, 99)).toBe(50);
  });
});

const t = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m));

describe("computeStandings", () => {
  const subjects = [
    { subjectKey: "team:a", name: "Alpha" },
    { subjectKey: "team:b", name: "Bravo" },
    { subjectKey: "team:c", name: "Charlie" },
    { subjectKey: "team:h", name: "Hidden", hidden: true },
  ];
  const events = [
    { subjectKey: "team:a", points: 100, type: "SOLVE", createdAt: t(10) },
    { subjectKey: "team:b", points: 100, type: "SOLVE", createdAt: t(5) },
    { subjectKey: "team:a", points: -20, type: "HINT_PENALTY", createdAt: t(11) },
    { subjectKey: "team:a", points: 20, type: "ADJUSTMENT", createdAt: t(12) },
    { subjectKey: "team:h", points: 999, type: "SOLVE", createdAt: t(1) },
  ];
  const solves = [
    { subjectKey: "team:a", createdAt: t(10) },
    { subjectKey: "team:b", createdAt: t(5) },
    { subjectKey: "team:h", createdAt: t(1) },
  ];

  it("sums the ledger including penalties and adjustments", () => {
    const rows = computeStandings({ subjects, events, solves, tieBreak: "EARLIEST_LAST_SOLVE" });
    expect(rows.find((r) => r.subjectKey === "team:a")!.points).toBe(100);
  });
  it("breaks ties by earliest last solve", () => {
    const rows = computeStandings({ subjects, events, solves, tieBreak: "EARLIEST_LAST_SOLVE" });
    expect(rows.map((r) => r.name)).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
  it("breaks ties by fewest submissions when configured", () => {
    const rows = computeStandings({
      subjects, events, solves, tieBreak: "FEWEST_SUBMISSIONS",
      submissionCounts: new Map([["team:a", 2], ["team:b", 9]]),
    });
    expect(rows[0]!.name).toBe("Alpha");
  });
  it("excludes hidden subjects unless requested", () => {
    expect(computeStandings({ subjects, events, solves, tieBreak: "EARLIEST_LAST_SOLVE" }).some((r) => r.name === "Hidden")).toBe(false);
    expect(computeStandings({ subjects, events, solves, tieBreak: "EARLIEST_LAST_SOLVE", includeHidden: true })[0]!.name).toBe("Hidden");
  });
  it("respects the freeze cutoff", () => {
    const rows = computeStandings({ subjects, events, solves, tieBreak: "EARLIEST_LAST_SOLVE", cutoff: t(6) });
    expect(rows[0]).toMatchObject({ name: "Bravo", points: 100, solves: 1 });
    expect(rows.find((r) => r.name === "Alpha")).toMatchObject({ points: 0, solves: 0 });
  });
  it("gives identical rank to fully tied subjects", () => {
    const rows = computeStandings({
      subjects: [{ subjectKey: "x", name: "X" }, { subjectKey: "y", name: "Y" }],
      events: [], solves: [], tieBreak: "EARLIEST_LAST_SOLVE",
    });
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });
  it("aggregates team scores from multiple members' events", () => {
    const rows = computeStandings({
      subjects: [{ subjectKey: "team:z", name: "Z" }],
      events: [
        { subjectKey: "team:z", points: 50, type: "SOLVE", createdAt: t(1) },
        { subjectKey: "team:z", points: 75, type: "SOLVE", createdAt: t(2) },
      ],
      solves: [{ subjectKey: "team:z", createdAt: t(1) }, { subjectKey: "team:z", createdAt: t(2) }],
      tieBreak: "EARLIEST_LAST_SOLVE",
    });
    expect(rows[0]).toMatchObject({ points: 125, solves: 2, lastSolveAt: t(2) });
  });
});

describe("scoreProgression", () => {
  it("produces cumulative series per subject", () => {
    const p = scoreProgression(
      [
        { subjectKey: "a", points: 100, type: "SOLVE", createdAt: t(2) },
        { subjectKey: "a", points: -10, type: "HINT_PENALTY", createdAt: t(1) },
      ],
      ["a"],
    );
    expect(p[0]!.series.map((s) => s.points)).toEqual([-10, 90]);
  });
});

describe("levelForXp", () => {
  it("maps XP to levels", () => {
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(400).level).toBe(3);
    expect(levelForXp(-5).level).toBe(1);
  });
});
