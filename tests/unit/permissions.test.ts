import { describe, expect, it } from "vitest";
import {
  assignableStaffRoles,
  COMPETITION_PERMISSIONS,
  hasCompetitionPermission,
  hasPlatformPermission,
  PLATFORM_PERMISSIONS,
} from "@/server/domain/permissions";

describe("platform permissions", () => {
  it("admins hold every platform permission", () => {
    for (const p of PLATFORM_PERMISSIONS) expect(hasPlatformPermission("ADMIN", p)).toBe(true);
  });
  it("participants hold none", () => {
    for (const p of PLATFORM_PERMISSIONS) expect(hasPlatformPermission("PARTICIPANT", p)).toBe(false);
  });
  it("organizers can only create competitions at platform level", () => {
    expect(hasPlatformPermission("ORGANIZER", "competition.create")).toBe(true);
    expect(hasPlatformPermission("ORGANIZER", "platform.users.manage")).toBe(false);
    expect(hasPlatformPermission("ORGANIZER", "platform.audit.view")).toBe(false);
  });
  it("evaluators cannot create competitions", () => {
    expect(hasPlatformPermission("EVALUATOR", "competition.create")).toBe(false);
  });
});

describe("competition permissions", () => {
  it("admins hold everything regardless of assignment", () => {
    for (const p of COMPETITION_PERMISSIONS) expect(hasCompetitionPermission({ globalRole: "ADMIN", staffRoles: [] }, p)).toBe(true);
  });
  it("unassigned organizers hold nothing on other competitions", () => {
    for (const p of COMPETITION_PERMISSIONS) expect(hasCompetitionPermission({ globalRole: "ORGANIZER", staffRoles: [] }, p)).toBe(false);
  });
  it("evaluator assignment grants review/grading but not configuration", () => {
    const ctx = { globalRole: "EVALUATOR" as const, staffRoles: ["EVALUATOR" as const] };
    expect(hasCompetitionPermission(ctx, "challenge.review")).toBe(true);
    expect(hasCompetitionPermission(ctx, "submission.grade")).toBe(true);
    expect(hasCompetitionPermission(ctx, "challenge.manage")).toBe(false);
    expect(hasCompetitionPermission(ctx, "score.adjust")).toBe(false);
    expect(hasCompetitionPermission(ctx, "competition.configure")).toBe(false);
  });
  it("a participant account cannot act as staff even if assigned", () => {
    for (const p of COMPETITION_PERMISSIONS)
      expect(hasCompetitionPermission({ globalRole: "PARTICIPANT", staffRoles: ["ORGANIZER"] }, p)).toBe(false);
  });
  it("assignable roles follow global role", () => {
    expect(assignableStaffRoles("PARTICIPANT")).toEqual([]);
    expect(assignableStaffRoles("EVALUATOR")).toEqual(["EVALUATOR"]);
    expect(assignableStaffRoles("ORGANIZER")).toEqual(["ORGANIZER", "EVALUATOR"]);
  });
});
