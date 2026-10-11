import "server-only";
import Redis from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { redis?: Redis | null };

/** Shared Redis client, or null when REDIS_URL is not configured. */
export function redis(): Redis | null {
  if (g.redis !== undefined) return g.redis;
  const url = env().REDIS_URL;
  if (!url) {
    g.redis = null;
    return null;
  }
  // Offline queue stays enabled so commands issued while the socket is still
  // connecting are not rejected (which would make rate limits fail open).
  const client = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 5000, commandTimeout: 2000 });
  client.on("error", (err) => console.error("[redis]", err.message));
  g.redis = client;
  return client;
}
