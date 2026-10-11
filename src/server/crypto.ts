import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacHex(key: string, input: string): string {
  return createHmac("sha256", key).update(input, "utf8").digest("hex");
}

/** URL-safe random token with `bytes` of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Human-friendly code (no ambiguous characters) e.g. for team invitations. */
export function randomCode(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Constant-time comparison of two hex digests of equal expected length. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

/** Keyed hash of an IP address so raw IPs are not stored. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmacHex(env().SESSION_SECRET, `ip:${ip}`).slice(0, 32);
}

/** HMAC of an invitation code so the plaintext code is not stored. */
export function hashInviteCode(code: string): string {
  return hmacHex(env().SESSION_SECRET, `invite:${code.trim().toUpperCase()}`);
}
