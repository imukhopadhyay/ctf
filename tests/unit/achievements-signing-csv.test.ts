import { describe, expect, it } from "vitest";
import { achievementCriteriaSchema, achievementProgress, isAchieved, longestDailyStreak, type SolveFact } from "@/server/domain/achievement-rules";
import { signRequest, verifyRequest } from "@/server/runner/signing";
import { csvCell, toCsv } from "@/server/http/csv";

const day = (d: number, h = 12) => new Date(Date.UTC(2026, 0, d, h));
const fact = (o: Partial<SolveFact>): SolveFact => ({ categorySlug: "web", createdAt: day(1), isFirstBlood: false, usedHint: false, solverUserId: "u1", ...o });

describe("achievement rules", () => {
  const solves = [
    fact({ categorySlug: "crypto", createdAt: day(1), isFirstBlood: true }),
    fact({ categorySlug: "crypto", createdAt: day(2), usedHint: true }),
    fact({ categorySlug: "crypto", createdAt: day(3), solverUserId: "u2" }),
    fact({ categorySlug: "web", createdAt: day(5) }),
  ];
  it("first blood", () => expect(isAchieved({ type: "first_blood", count: 1 }, solves)).toBe(true));
  it("category specialist", () => {
    expect(isAchieved({ type: "category_solves", category: "crypto", count: 3 }, solves)).toBe(true);
    expect(isAchieved({ type: "category_solves", category: "web", count: 3 }, solves)).toBe(false);
  });
  it("all-rounder progress", () => {
    expect(achievementProgress({ type: "all_categories", categories: ["web", "crypto", "reverse", "forensics"], minEach: 1 }, solves)).toEqual([2, 4]);
  });
  it("consistency streak counts consecutive UTC days", () => {
    expect(longestDailyStreak(solves.map((s) => s.createdAt))).toBe(3);
    expect(isAchieved({ type: "streak_days", days: 3 }, solves)).toBe(true);
    expect(longestDailyStreak([])).toBe(0);
  });
  it("hintless solves", () => expect(achievementProgress({ type: "hintless_solves", count: 5 }, solves)).toEqual([3, 5]));
  it("team collaboration counts distinct solvers", () => expect(isAchieved({ type: "team_contributors", minMembers: 2 }, solves)).toBe(true));
  it("rejects malformed admin criteria", () => {
    expect(achievementCriteriaSchema.safeParse({ type: "total_solves" }).success).toBe(false);
    expect(achievementCriteriaSchema.safeParse({ type: "hack_the_platform", count: 1 }).success).toBe(false);
  });
});

describe("runner request signing", () => {
  const secret = "runner-secret-0123456789abcdef0123456789abcdef";
  const seen = new Set<string>();
  const seenNonce = (n: string) => (seen.has(n) ? true : (seen.add(n), false));
  it("verifies a valid signature once and rejects replays", () => {
    const h = signRequest(secret, "POST", "/v1/instances", '{"a":1}');
    const hdr = { timestamp: h["x-cq-timestamp"], nonce: h["x-cq-nonce"], signature: h["x-cq-signature"] };
    expect(verifyRequest(secret, hdr, "POST", "/v1/instances", '{"a":1}', seenNonce)).toEqual({ ok: true });
    expect(verifyRequest(secret, hdr, "POST", "/v1/instances", '{"a":1}', seenNonce)).toEqual({ ok: false, reason: "replayed nonce" });
  });
  it("rejects tampered body, path, method, secret and stale timestamps", () => {
    const h = signRequest(secret, "POST", "/v1/instances", "{}");
    const hdr = { timestamp: h["x-cq-timestamp"], nonce: h["x-cq-nonce"], signature: h["x-cq-signature"] };
    const fresh = () => false;
    expect(verifyRequest(secret, hdr, "POST", "/v1/instances", '{"x":1}', fresh).ok).toBe(false);
    expect(verifyRequest(secret, hdr, "POST", "/v1/other", "{}", fresh).ok).toBe(false);
    expect(verifyRequest(secret, hdr, "DELETE", "/v1/instances", "{}", fresh).ok).toBe(false);
    expect(verifyRequest(secret + "x", hdr, "POST", "/v1/instances", "{}", fresh).ok).toBe(false);
    const old = signRequest(secret, "GET", "/v1/health", "", Date.now() - 120_000);
    expect(verifyRequest(secret, { timestamp: old["x-cq-timestamp"], nonce: old["x-cq-nonce"], signature: old["x-cq-signature"] }, "GET", "/v1/health", "", fresh)).toEqual({ ok: false, reason: "stale timestamp" });
    expect(verifyRequest(secret, {}, "GET", "/", "", fresh).ok).toBe(false);
  });
});

describe("CSV export", () => {
  it("neutralizes spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
  it("quotes commas and newlines", () => {
    expect(toCsv(["a"], [["x,y"], ["l1\nl2"]])).toBe('a\r\n"x,y"\r\n"l1\nl2"\r\n');
  });
});
