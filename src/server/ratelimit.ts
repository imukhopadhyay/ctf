import "server-only";
import { redis } from "./redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

// In-process fallback (single instance / tests only). Pinned to globalThis so
// that, even if a bundler loads this module under two specifiers, every copy
// shares one map and resetMemoryRateLimits() clears them all.
const g = globalThis as unknown as { __cqRateLimitMemory?: Map<string, { count: number; resetAt: number }> };
const memory = (g.__cqRateLimitMemory ??= new Map<string, { count: number; resetAt: number }>());

/**
 * Fixed-window rate limiter. Uses Redis when configured so limits are shared
 * across replicas; otherwise an in-process map. Redis failures fail *open*
 * for availability but are logged.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = Math.floor(now / (windowSeconds * 1000));
  const fullKey = `rl:${key}:${bucket}`;
  const resetAt = (bucket + 1) * windowSeconds * 1000;
  const client = redis();
  let count: number;
  if (client) {
    try {
      const res = await client.multi().incr(fullKey).expire(fullKey, windowSeconds + 1).exec();
      count = Number(res?.[0]?.[1] ?? 0);
    } catch (e) {
      console.error("[ratelimit] redis unavailable, failing open:", (e as Error).message);
      return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    }
  } else {
    const entry = memory.get(fullKey);
    if (!entry || entry.resetAt <= now) {
      memory.set(fullKey, { count: 1, resetAt });
      count = 1;
    } else {
      count = ++entry.count;
    }
    if (memory.size > 50_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
  }
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

export function resetMemoryRateLimits() {
  memory.clear();
}

/** Central rate-limit policy (requests per window). */
export const LIMITS = {
  login: { limit: 10, window: 300 }, // per IP
  loginAccount: { limit: 8, window: 900 }, // per account identifier
  register: { limit: 5, window: 3600 }, // per IP
  submitPerChallenge: { limit: 10, window: 60 }, // per user+challenge
  submitPerSubject: { limit: 30, window: 60 }, // per team/user across challenges
  submitPerIp: { limit: 60, window: 60 },
  hintUnlock: { limit: 20, window: 60 },
  instance: { limit: 10, window: 300 },
  download: { limit: 120, window: 60 },
  upload: { limit: 30, window: 300 },
  mutation: { limit: 120, window: 60 }, // generic per-user mutations
} as const;
