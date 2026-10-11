/**
 * CyberQuest challenge runner — a separate, minimal HTTP service that is the
 * only component permitted to talk to a container engine. Requests are
 * authenticated with HMAC-SHA256 (see src/server/runner/signing.ts).
 *
 * Run with: npm run runner
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { verifyRequest } from "../../src/server/runner/signing";
import { loadConfig } from "./config";
import { DisabledBackend, type RunnerBackend } from "./backend";
import { DockerBackend } from "./docker-backend";

const cfg = loadConfig();
const backend: RunnerBackend = cfg.RUNNER_BACKEND === "docker" ? new DockerBackend(cfg) : new DisabledBackend();

// Bounded replay-protection nonce cache (TTL ~ 2× clock skew).
const nonces = new Map<string, number>();
function seenNonce(nonce: string): boolean {
  const now = Date.now();
  for (const [n, t] of nonces) if (now - t > 120_000) nonces.delete(n);
  if (nonces.has(nonce)) return true;
  nonces.set(nonce, now);
  return false;
}

const createSchema = z.object({
  instanceId: z.string().min(1).max(64),
  image: z.string().min(1).max(256),
  internalPort: z.number().int().min(1).max(65535),
  protocol: z.enum(["http", "tcp"]),
  memoryMb: z.number().int().min(16).max(4096),
  cpuMillis: z.number().int().min(50).max(4000),
  pidsLimit: z.number().int().min(8).max(1024),
  ttlSeconds: z.number().int().min(30).max(86400),
  env: z.record(z.string().max(128), z.string().max(4096)),
});

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(json) });
  res.end(json);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://runner");
    const path = url.pathname;
    const method = req.method ?? "GET";
    const body = method === "GET" || method === "DELETE" ? "" : await readBody(req);

    const verdict = verifyRequest(
      cfg.RUNNER_SHARED_SECRET,
      { timestamp: req.headers["x-cq-timestamp"] as string, nonce: req.headers["x-cq-nonce"] as string, signature: req.headers["x-cq-signature"] as string },
      method, path, body, seenNonce,
    );
    if (!verdict.ok) return send(res, 401, { error: `unauthorized: ${verdict.reason}` });

    if (method === "GET" && path === "/v1/health") {
      return send(res, 200, { ok: true, backend: backend.name, isolation: backend.isolationReport(), activeInstances: await backend.activeCount().catch(() => -1), maxInstances: cfg.RUNNER_MAX_INSTANCES });
    }
    if (method === "POST" && path === "/v1/instances") {
      if ((await backend.activeCount()) >= cfg.RUNNER_MAX_INSTANCES) return send(res, 429, { error: "runner at capacity" });
      const parsed = createSchema.safeParse(JSON.parse(body));
      if (!parsed.success) return send(res, 400, { error: "invalid request", details: parsed.error.issues });
      return send(res, 200, await backend.create(parsed.data));
    }
    const resetMatch = path.match(/^\/v1\/instances\/([^/]+)\/reset$/);
    if (method === "POST" && resetMatch) {
      const parsed = createSchema.safeParse(JSON.parse(body));
      if (!parsed.success) return send(res, 400, { error: "invalid request" });
      return send(res, 200, await backend.reset(decodeURIComponent(resetMatch[1]!), parsed.data));
    }
    const refMatch = path.match(/^\/v1\/instances\/([^/]+)$/);
    if (refMatch) {
      const ref = decodeURIComponent(refMatch[1]!);
      if (method === "DELETE") {
        await backend.destroy(ref);
        return send(res, 200, { ok: true });
      }
      if (method === "GET") return send(res, 200, await backend.status(ref));
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error("[runner]", (e as Error).message);
    send(res, 500, { error: (e as Error).message.slice(0, 300) });
  }
});

// Periodic reaping of exited containers.
const reaper = setInterval(() => {
  backend.reap().then((n) => n > 0 && console.log(`[runner] reaped ${n} exited instance(s)`)).catch(() => undefined);
}, 60_000);
reaper.unref();

server.listen(cfg.RUNNER_PORT, () => console.log(`[runner] listening on :${cfg.RUNNER_PORT} (backend: ${backend.name}, max ${cfg.RUNNER_MAX_INSTANCES})`));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => server.close(() => process.exit(0)));
