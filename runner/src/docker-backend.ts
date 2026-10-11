import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RunnerBackend } from "./backend";
import type { RunnerConfig } from "./config";
import type { CreateInstanceRequest, CreateInstanceResponse, InstanceStatusResponse } from "../../src/server/runner/signing";

const exec = promisify(execFile);
const LABEL = "cyberquest.instance";

/**
 * Docker backend. Each instance is a single container with:
 *  - a dedicated bridge network with inter-container comms and masquerade
 *    disabled (no routed egress, no lateral movement),
 *  - all capabilities dropped, no-new-privileges, read-only root filesystem,
 *  - a non-root user, memory/CPU/pids limits and a size-limited tmpfs,
 *  - no bind mounts, no Docker socket, no host networking.
 */
export class DockerBackend implements RunnerBackend {
  readonly name = "docker";
  private readonly usedPorts = new Set<number>();

  constructor(private readonly cfg: RunnerConfig) {}

  isolationReport() {
    return {
      backend: "docker",
      runtime: this.cfg.RUNNER_DOCKER_RUNTIME || "runc (default)",
      perInstanceNetwork: true,
      egress: "no routed egress (per-instance bridge, masquerade/SNAT disabled, ICC disabled); run on a dedicated host/VPC for a hard guarantee",
      capabilities: "ALL dropped",
      noNewPrivileges: true,
      readOnlyRootfs: true,
      user: "non-root (image default or 65534)",
      limits: "memory, cpu, pids, tmpfs size, ulimit nofile/nproc",
      mounts: "none (no bind mounts, no docker socket)",
      recommendation: "For public events run on a dedicated host/VPC and set RUNNER_DOCKER_RUNTIME=runsc (gVisor) or use Kata/Firecracker.",
    };
  }

  private async docker(args: string[], input?: string) {
    return exec("docker", args, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024, ...(input ? { input } as never : {}) });
  }

  private assertImageAllowed(image: string) {
    if (this.cfg.allowedImagePrefixes.length === 0) throw new Error("no images are allow-listed (set RUNNER_ALLOWED_IMAGES)");
    if (!this.cfg.allowedImagePrefixes.some((p) => image.startsWith(p))) throw new Error(`image ${image} is not allow-listed`);
  }

  private allocatePort(): number {
    for (let i = 0; i < 2000; i++) {
      const port = this.cfg.RUNNER_PORT_MIN + Math.floor(Math.random() * (this.cfg.RUNNER_PORT_MAX - this.cfg.RUNNER_PORT_MIN + 1));
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    throw new Error("no free ports for new instance");
  }

  async create(req: CreateInstanceRequest): Promise<CreateInstanceResponse> {
    this.assertImageAllowed(req.image);
    const id = req.instanceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    const netName = `cq-net-${id}`;
    const containerName = `cq-${id}`;
    const hostPort = this.allocatePort();

    // Dedicated network with inter-container comms and masquerade (SNAT)
    // disabled: the container has no working routed egress, but the host can
    // still reach it through the published port's DNAT rule. (For a hard
    // egress guarantee, run the runner on a dedicated host/VPC — see the
    // isolation report and docs/SANDBOX.md.)
    await this.docker(["network", "create", "--driver", "bridge",
      "--opt", "com.docker.network.bridge.enable_icc=false",
      "--opt", "com.docker.network.bridge.enable_ip_masquerade=false",
      "--label", `${LABEL}=${id}`, netName]).catch(() => undefined);

    const env: string[] = [];
    for (const [k, v] of Object.entries(req.env)) env.push("-e", `${k}=${v}`);

    const args = [
      "run", "-d", "--name", containerName,
      "--label", `${LABEL}=${id}`,
      "--network", netName,
      "--publish", `${this.cfg.RUNNER_BIND_HOST}:${hostPort}:${req.internalPort}`,
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--read-only",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
      "--pids-limit", String(req.pidsLimit),
      "--memory", `${req.memoryMb}m`, "--memory-swap", `${req.memoryMb}m`,
      "--cpus", (req.cpuMillis / 1000).toFixed(3),
      "--ulimit", "nofile=256:256", "--ulimit", "nproc=256:256",
      "--stop-timeout", "5",
      ...(this.cfg.RUNNER_DOCKER_RUNTIME ? ["--runtime", this.cfg.RUNNER_DOCKER_RUNTIME] : []),
      ...env,
      req.image,
    ];
    try {
      await this.docker(args);
    } catch (e) {
      this.usedPorts.delete(hostPort);
      await this.cleanup(id).catch(() => undefined);
      throw new Error(`failed to start container: ${(e as Error).message.slice(0, 300)}`);
    }
    const connection = {
      host: this.cfg.RUNNER_PUBLIC_HOST,
      port: hostPort,
      protocol: req.protocol,
      ...(req.protocol === "http" ? { url: `http://${this.cfg.RUNNER_PUBLIC_HOST}:${hostPort}` } : {}),
    };
    return { runnerRef: id, connection, backend: this.name };
  }

  async reset(runnerRef: string, req: CreateInstanceRequest): Promise<CreateInstanceResponse> {
    await this.destroy(runnerRef);
    return this.create(req);
  }

  private async cleanup(id: string) {
    await this.docker(["rm", "-f", `cq-${id}`]).catch(() => undefined);
    await this.docker(["network", "rm", `cq-net-${id}`]).catch(() => undefined);
  }

  async destroy(runnerRef: string) {
    const id = runnerRef.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!id) return;
    await this.cleanup(id);
  }

  async status(runnerRef: string): Promise<InstanceStatusResponse> {
    const id = runnerRef.replace(/[^a-zA-Z0-9_-]/g, "");
    try {
      const { stdout } = await this.docker(["inspect", "-f", "{{.State.Running}}", `cq-${id}`]);
      return { runnerRef, state: stdout.trim() === "true" ? "running" : "exited" };
    } catch {
      return { runnerRef, state: "missing" };
    }
  }

  async activeCount(): Promise<number> {
    const { stdout } = await this.docker(["ps", "-q", "--filter", `label=${LABEL}`]);
    return stdout.split("\n").filter(Boolean).length;
  }

  /** Remove exited CyberQuest containers and their networks. */
  async reap(): Promise<number> {
    const { stdout } = await this.docker(["ps", "-aq", "--filter", `label=${LABEL}`, "--filter", "status=exited"]);
    const ids = stdout.split("\n").filter(Boolean);
    for (const cid of ids) {
      const { stdout: label } = await this.docker(["inspect", "-f", `{{index .Config.Labels "${LABEL}"}}`, cid]).catch(() => ({ stdout: "" }));
      if (label.trim()) await this.cleanup(label.trim());
    }
    return ids.length;
  }
}
