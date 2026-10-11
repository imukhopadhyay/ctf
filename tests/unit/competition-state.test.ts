import { describe, expect, it } from "vitest";
import {
  acceptsSubmissions,
  canTransition,
  clockTransition,
  registrationOpen,
  validateCompetitionConfig,
  type CompetitionConfig,
} from "@/server/domain/competition-state";

const base: CompetitionConfig = {
  name: "Spring CTF",
  startsAt: new Date("2026-03-01T09:00:00Z"),
  endsAt: new Date("2026-03-02T09:00:00Z"),
  registrationDeadline: null,
  mode: "TEAM",
  minTeamSize: 1,
  maxTeamSize: 4,
  freezeAt: null,
  rules: "Only attack the provided targets. No sharing of flags.",
  accessMode: "PUBLIC",
  hasInviteCode: false,
  isPractice: false,
  timezone: "Asia/Kolkata",
};

describe("competition transitions", () => {
  it.each([
    ["DRAFT", "SCHEDULED", true],
    ["DRAFT", "ACTIVE", false],
    ["SCHEDULED", "ACTIVE", true],
    ["ACTIVE", "PAUSED", true],
    ["PAUSED", "ACTIVE", true],
    ["ACTIVE", "COMPLETED", true],
    ["COMPLETED", "ARCHIVED", true],
    ["ARCHIVED", "ACTIVE", false],
    ["ACTIVE", "DRAFT", false],
  ] as const)("%s -> %s = %s", (from, to, ok) => {
    expect(canTransition(from, to)).toBe(ok);
  });
});

describe("validateCompetitionConfig", () => {
  it("accepts a valid configuration", () => {
    expect(validateCompetitionConfig(base, 3)).toEqual([]);
  });
  it("reports each problem", () => {
    const problems = validateCompetitionConfig(
      { ...base, endsAt: new Date("2026-02-01T00:00:00Z"), maxTeamSize: 0, rules: "short", timezone: "Mars/Olympus", accessMode: "INVITATION" },
      0,
    );
    expect(problems.join("\n")).toMatch(/End time/);
    expect(problems.join("\n")).toMatch(/team size/);
    expect(problems.join("\n")).toMatch(/rules/);
    expect(problems.join("\n")).toMatch(/timezone/);
    expect(problems.join("\n")).toMatch(/invitation code/);
    expect(problems.join("\n")).toMatch(/challenge/);
  });
  it("requires an end time except for practice arenas", () => {
    expect(validateCompetitionConfig({ ...base, endsAt: null }, 1)).toContain("An end time is required (except for practice arenas).");
    expect(validateCompetitionConfig({ ...base, endsAt: null, isPractice: true }, 1)).toEqual([]);
  });
  it("requires freeze inside the competition window", () => {
    expect(validateCompetitionConfig({ ...base, freezeAt: new Date("2026-03-03T00:00:00Z") }, 1).length).toBe(1);
  });
});

describe("time-based rules", () => {
  const c = { status: "ACTIVE" as const, startsAt: base.startsAt, endsAt: base.endsAt };
  it("accepts submissions only while ACTIVE and inside the window", () => {
    expect(acceptsSubmissions(c, new Date("2026-03-01T10:00:00Z"))).toBe(true);
    expect(acceptsSubmissions(c, new Date("2026-03-02T09:00:00Z"))).toBe(false);
    expect(acceptsSubmissions({ ...c, status: "PAUSED" }, new Date("2026-03-01T10:00:00Z"))).toBe(false);
    expect(acceptsSubmissions(c, new Date("2026-02-28T10:00:00Z"))).toBe(false);
  });
  it("clock moves SCHEDULED to ACTIVE to COMPLETED", () => {
    expect(clockTransition({ ...c, status: "SCHEDULED" }, new Date("2026-03-01T09:00:01Z"))).toBe("ACTIVE");
    expect(clockTransition({ ...c, status: "SCHEDULED" }, new Date("2026-02-01T00:00:00Z"))).toBeNull();
    expect(clockTransition(c, new Date("2026-03-02T09:00:00Z"))).toBe("COMPLETED");
    expect(clockTransition({ ...c, status: "PAUSED" }, new Date("2026-03-05T00:00:00Z"))).toBeNull();
  });
  it("registration window", () => {
    const r = { status: "SCHEDULED" as const, registrationOpensAt: null, registrationDeadline: new Date("2026-03-01T00:00:00Z"), endsAt: base.endsAt };
    expect(registrationOpen(r, new Date("2026-02-15T00:00:00Z"))).toBe(true);
    expect(registrationOpen(r, new Date("2026-03-01T00:00:01Z"))).toBe(false);
    expect(registrationOpen({ ...r, status: "DRAFT" as never }, new Date("2026-02-15T00:00:00Z"))).toBe(false);
  });
});
