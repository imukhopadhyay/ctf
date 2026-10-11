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
  const client = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false });
  client.on("error", (err) => console.error("[redis]", err.message));
  g.redis = client;
  return client;
}
