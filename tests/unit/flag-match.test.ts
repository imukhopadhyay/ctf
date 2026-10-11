import { describe, expect, it } from "vitest";
import {
  deriveInstanceFlag,
  digestsEqual,
  flagDigest,
  instanceFlagMatches,
  matchStaticFlag,
  normalizeFlag,
  submissionFingerprint,
  type StoredStaticFlag,
} from "@/server/domain/flag-match";

const PEPPER = "unit-test-pepper-0123456789abcdef0123456789";
const stored = (flag: string, opts: Partial<StoredStaticFlag> = {}): StoredStaticFlag => {
  const rule = { caseSensitive: opts.caseSensitive ?? true, normalizeWhitespace: opts.normalizeWhitespace ?? false };
  return {
    id: opts.id ?? "f1",
    digest: flagDigest(PEPPER, normalizeFlag(flag, rule), opts.keyVersion ?? 1),
    keyVersion: opts.keyVersion ?? 1,
    active: opts.active ?? true,
    expiresAt: opts.expiresAt ?? null,
    ...rule,
  };
};
const now = new Date("2026-01-01T00:00:00Z");

describe("normalizeFlag", () => {
  it("always trims surrounding whitespace", () => {
    expect(normalizeFlag("  CQ{a}\n", { caseSensitive: true, normalizeWhitespace: false })).toBe("CQ{a}");
  });
  it("collapses internal whitespace only when configured", () => {
    expect(normalizeFlag("CQ{a   b}", { caseSensitive: true, normalizeWhitespace: true })).toBe("CQ{a b}");
    expect(normalizeFlag("CQ{a   b}", { caseSensitive: true, normalizeWhitespace: false })).toBe("CQ{a   b}");
  });
  it("lower-cases only when case-insensitive", () => {
    expect(normalizeFlag("CQ{AbC}", { caseSensitive: false, normalizeWhitespace: false })).toBe("cq{abc}");
    expect(normalizeFlag("CQ{AbC}", { caseSensitive: true, normalizeWhitespace: false })).toBe("CQ{AbC}");
  });
  it("applies Unicode NFC so composed and decomposed forms match", () => {
    const rule = { caseSensitive: true, normalizeWhitespace: false };
    expect(normalizeFlag("CQ{café}", rule)).toBe(normalizeFlag("CQ{café}", rule));
  });
});

describe("matchStaticFlag", () => {
  it("accepts an exact match", () => {
    expect(matchStaticFlag(PEPPER, "CQ{exact}", [stored("CQ{exact}")], now)).toBe("f1");
  });
  it("rejects wrong case for case-sensitive flags", () => {
    expect(matchStaticFlag(PEPPER, "cq{exact}", [stored("CQ{exact}")], now)).toBeNull();
  });
  it("accepts wrong case for case-insensitive flags", () => {
    expect(matchStaticFlag(PEPPER, "cq{EXACT}", [stored("CQ{exact}", { caseSensitive: false })], now)).toBe("f1");
  });
  it("supports multiple accepted flags (multi-stage)", () => {
    const flags = [stored("CQ{stage1}", { id: "s1" }), stored("CQ{stage2}", { id: "s2" })];
    expect(matchStaticFlag(PEPPER, "CQ{stage2}", flags, now)).toBe("s2");
  });
  it("ignores inactive and expired flags", () => {
    expect(matchStaticFlag(PEPPER, "CQ{x}", [stored("CQ{x}", { active: false })], now)).toBeNull();
    expect(matchStaticFlag(PEPPER, "CQ{x}", [stored("CQ{x}", { expiresAt: new Date("2025-12-31T00:00:00Z") })], now)).toBeNull();
    expect(matchStaticFlag(PEPPER, "CQ{x}", [stored("CQ{x}", { expiresAt: new Date("2026-02-01T00:00:00Z") })], now)).toBe("f1");
  });
  it("binds the digest to the key version (rotation invalidates old digests)", () => {
    const v1 = flagDigest(PEPPER, "CQ{x}", 1);
    const v2 = flagDigest(PEPPER, "CQ{x}", 2);
    expect(v1).not.toBe(v2);
  });
  it("digests depend on the pepper", () => {
    expect(flagDigest(PEPPER, "CQ{x}")).not.toBe(flagDigest(PEPPER + "!", "CQ{x}"));
  });
  it("digestsEqual rejects malformed input", () => {
    expect(digestsEqual("zz", "zz")).toBe(false);
    expect(digestsEqual("", "")).toBe(false);
  });
});

describe("instance flags", () => {
  const secret = "instance-secret-0123456789abcdef0123456789";
  it("are deterministic and bound to instance, challenge and subject", () => {
    const f = deriveInstanceFlag(secret, "i1", "c1", "team:t1");
    expect(f).toMatch(/^CQ\{[a-f0-9]{32}\}$/);
    expect(deriveInstanceFlag(secret, "i1", "c1", "team:t1")).toBe(f);
    expect(deriveInstanceFlag(secret, "i2", "c1", "team:t1")).not.toBe(f);
    expect(deriveInstanceFlag(secret, "i1", "c2", "team:t1")).not.toBe(f);
    expect(deriveInstanceFlag(secret, "i1", "c1", "team:t2")).not.toBe(f);
  });
  it("verify in constant time and tolerate surrounding whitespace", () => {
    const f = deriveInstanceFlag(secret, "i1", "c1", "user:u1");
    expect(instanceFlagMatches(secret, ` ${f} `, "i1", "c1", "user:u1")).toBe(true);
    expect(instanceFlagMatches(secret, f, "i1", "c1", "user:u2")).toBe(false);
    expect(instanceFlagMatches(secret, "CQ{short}", "i1", "c1", "user:u1")).toBe(false);
  });
});

describe("submissionFingerprint", () => {
  it("is short, keyed and normalization-insensitive", () => {
    const a = submissionFingerprint(PEPPER, "CQ{Abc}");
    expect(a).toHaveLength(24);
    expect(submissionFingerprint(PEPPER, " cq{abc} ")).toBe(a);
    expect(a).not.toContain("abc");
  });
});
