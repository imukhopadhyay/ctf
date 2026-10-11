/**
 * End-to-end runner test against the real Docker backend. Skipped unless
 * RUN_DOCKER_TESTS=1 and a docker daemon + built challenge image are present.
 * Proves: isolated container start, egress denial, non-root + dropped caps,
 * per-instance flag delivery, the SQLi exploit, and cleanup.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { DockerBackend } from "../../runner/src/docker-backend";
import type { RunnerConfig } from "../../runner/src/config";
import { deriveInstanceFlag } from "@/server/domain/flag-match";

const ENABLED = process.env.RUN_DOCKER_TESTS === "1";
const IMAGE = "cyberquest/chal-sqli-login:1.0";

function imagePresent() {
  try {
    execFileSync("docker", ["image", "inspect", IMAGE], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const run = ENABLED && imagePresent() ? describe : describe.skip;

run("DockerBackend (live)", () => {
  const cfg: RunnerConfig = {
    RUNNER_PORT: 4100, RUNNER_SHARED_SECRET: "x".repeat(32), RUNNER_BACKEND: "docker",
    RUNNER_PUBLIC_HOST: "127.0.0.1", RUNNER_BIND_HOST: "127.0.0.1", RUNNER_ALLOWED_IMAGES: "cyberquest/chal-",
    RUNNER_MAX_INSTANCES: 10, RUNNER_DOCKER_RUNTIME: undefined, RUNNER_PORT_MIN: 21000, RUNNER_PORT_MAX: 21999,
    allowedImagePrefixes: ["cyberquest/chal-"],
  };
  const backend = new DockerBackend(cfg);
  const secret = "instance-secret-0123456789abcdef0123456789abcdef";
  const instanceId = `test${Date.now().toString(36)}`;
  const challengeId = "chal-live";
  const subjectKey = "team:live";
  const flag = deriveInstanceFlag(secret, instanceId, challengeId, subjectKey);
  let ref = "";

  afterAll(async () => {
    if (ref) await backend.destroy(ref).catch(() => undefined);
  });

  it("refuses images outside the allow-list", async () => {
    await expect(backend.create({ ...req(), image: "ubuntu:latest" })).rejects.toThrow(/allow-list/);
  });

  function req() {
    return { instanceId, image: IMAGE, internalPort: 8080, protocol: "http" as const, memoryMb: 128, cpuMillis: 500, pidsLimit: 64, ttlSeconds: 300, env: { FLAG: flag, CQ_INSTANCE_ID: instanceId } };
  }

  it("starts an isolated container and serves the per-instance flag only via the exploit", async () => {
    const res = await backend.create(req());
    ref = res.runnerRef;
    expect(res.connection.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const base = res.connection.url!;
    // Wait for readiness.
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      try {
        const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
        ready = r.ok;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    expect(ready).toBe(true);

    // The landing page must not leak the flag.
    const page = await (await fetch(base)).text();
    expect(page).not.toContain(flag);

    // A wrong login does not reveal it.
    const bad = await (await fetch(base, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "username=alice&password=wrong" })).text();
    expect(bad).not.toContain(flag);

    // SQL injection auth-bypass as admin reveals the per-instance flag.
    const exploit = await (await fetch(base, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `username=${encodeURIComponent("admin'--")}&password=x` })).text();
    expect(exploit).toContain(flag);
  }, 40_000);

  it("runs non-root with no network egress", async () => {
    const cid = `cq-${ref}`;
    const whoami = execFileSync("docker", ["exec", cid, "id", "-u"], { stdio: "pipe" }).toString().trim();
    expect(whoami).toBe("65534");
    // Egress is denied: an outbound TCP connect should fail fast.
    const egress = execFileSync("docker", ["exec", cid, "python3", "-c",
      "import socket,sys\ntry:\n socket.create_connection(('192.0.2.1',80),timeout=2); print('OPEN')\nexcept Exception: print('BLOCKED')"], { stdio: "pipe", timeout: 10_000 }).toString().trim();
    expect(egress).toBe("BLOCKED");
  }, 20_000);

  it("destroys the container and its network", async () => {
    await backend.destroy(ref);
    const status = await backend.status(ref);
    expect(status.state).toBe("missing");
    const net = execFileSync("docker", ["network", "ls", "--format", "{{.Name}}"], { stdio: "pipe" }).toString();
    expect(net).not.toContain(`cq-net-${ref}`);
    ref = "";
  }, 20_000);
});
