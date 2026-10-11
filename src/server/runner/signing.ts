/**
 * Request signing shared by the runner client (web/worker) and the runner
 * service. Pure module — no framework imports.
 *
 * signature = HMAC-SHA256(secret, `${timestamp}\n${nonce}\n${METHOD}\n${path}\n${sha256(body)}`)
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MAX_CLOCK_SKEW_MS = 60_000;

export interface SignedHeaders {
  "x-cq-timestamp": string;
  "x-cq-nonce": string;
  "x-cq-signature": string;
}

function canonical(ts: string, nonce: string, method: string, path: string, body: string) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return `${ts}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash}`;
}

export function signRequest(secret: string, method: string, path: string, body: string, now = Date.now()): SignedHeaders {
  const ts = String(now);
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", secret).update(canonical(ts, nonce, method, path, body)).digest("hex");
  return { "x-cq-timestamp": ts, "x-cq-nonce": nonce, "x-cq-signature": sig };
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyRequest(
  secret: string,
  headers: { timestamp?: string; nonce?: string; signature?: string },
  method: string,
  path: string,
  body: string,
  seenNonce: (nonce: string) => boolean,
  now = Date.now(),
): VerifyResult {
  const { timestamp, nonce, signature } = headers;
  if (!timestamp || !nonce || !signature) return { ok: false, reason: "missing signature headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_CLOCK_SKEW_MS) return { ok: false, reason: "stale timestamp" };
  if (!/^[a-f0-9]{32}$/.test(nonce)) return { ok: false, reason: "bad nonce" };
  const expected = createHmac("sha256", secret).update(canonical(timestamp, nonce, method, path, body)).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature, "hex");
  } catch {
    return { ok: false, reason: "bad signature encoding" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "invalid signature" };
  if (seenNonce(nonce)) return { ok: false, reason: "replayed nonce" };
  return { ok: true };
}

/** Shapes exchanged with the runner. */
export interface CreateInstanceRequest {
  instanceId: string;
  image: string;
  internalPort: number;
  protocol: "http" | "tcp";
  memoryMb: number;
  cpuMillis: number;
  pidsLimit: number;
  ttlSeconds: number;
  env: Record<string, string>;
}

export interface InstanceConnection {
  host: string;
  port: number;
  protocol: "http" | "tcp";
  url?: string;
}

export interface CreateInstanceResponse {
  runnerRef: string;
  connection: InstanceConnection;
  backend: string;
}

export interface InstanceStatusResponse {
  runnerRef: string;
  state: "running" | "exited" | "missing";
  stats?: { cpuPercent?: number; memoryBytes?: number; pids?: number };
}

export interface RunnerHealth {
  ok: boolean;
  backend: string;
  isolation: Record<string, unknown>;
  activeInstances: number;
  maxInstances: number;
}
