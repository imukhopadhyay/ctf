import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_FLAG_LENGTH = 512;

export interface FlagRule {
  caseSensitive: boolean;
  normalizeWhitespace: boolean;
}

/**
 * Normalization applied identically when a flag is configured and when it is
 * submitted:
 *  - Unicode NFC normalization and trimming of surrounding whitespace (always)
 *  - collapsing internal whitespace runs to one space (if normalizeWhitespace)
 *  - lower-casing (if !caseSensitive)
 */
export function normalizeFlag(input: string, rule: FlagRule): string {
  let v = input.normalize("NFC").trim();
  if (rule.normalizeWhitespace) v = v.replace(/\s+/gu, " ");
  if (!rule.caseSensitive) v = v.toLowerCase();
  return v;
}

export function flagDigest(pepper: string, normalized: string, keyVersion = 1): string {
  return createHmac("sha256", pepper).update(`flag:v${keyVersion}:${normalized}`, "utf8").digest("hex");
}

/** Constant-time digest comparison. */
export function digestsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== 32 || bb.length !== 32) return false;
  return timingSafeEqual(ab, bb);
}

export interface StoredStaticFlag extends FlagRule {
  id: string;
  digest: string;
  keyVersion: number;
  active: boolean;
  expiresAt: Date | null;
}

/** Returns the id of the matching static flag, or null. Checks every flag (no early exit). */
export function matchStaticFlag(
  pepper: string,
  submitted: string,
  flags: readonly StoredStaticFlag[],
  now: Date,
): string | null {
  let match: string | null = null;
  for (const f of flags) {
    if (!f.active) continue;
    if (f.expiresAt && f.expiresAt.getTime() <= now.getTime()) continue;
    const candidate = flagDigest(pepper, normalizeFlag(submitted, f), f.keyVersion);
    if (digestsEqual(candidate, f.digest) && match === null) match = f.id;
  }
  return match;
}

/**
 * Per-instance flags are derived with HMAC and never stored. The output uses
 * lowercase hex so it survives case-insensitive matching unchanged.
 */
export function deriveInstanceFlag(
  secret: string,
  instanceId: string,
  challengeId: string,
  subjectKey: string,
): string {
  const mac = createHmac("sha256", secret)
    .update(`instance:${instanceId}|${challengeId}|${subjectKey}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `CQ{${mac}}`;
}

export function instanceFlagMatches(
  secret: string,
  submitted: string,
  instanceId: string,
  challengeId: string,
  subjectKey: string,
): boolean {
  const expected = deriveInstanceFlag(secret, instanceId, challengeId, subjectKey);
  const a = Buffer.from(submitted.normalize("NFC").trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Short keyed fingerprint of a submission for duplicate / sharing analysis. */
export function submissionFingerprint(pepper: string, submitted: string): string {
  const normalized = normalizeFlag(submitted, { caseSensitive: false, normalizeWhitespace: true });
  return createHmac("sha256", pepper).update(`fp:${normalized}`, "utf8").digest("hex").slice(0, 24);
}
