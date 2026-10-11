import "server-only";
import { env } from "../env";
import { AppError } from "../errors";
import {
  signRequest,
  type CreateInstanceRequest,
  type CreateInstanceResponse,
  type InstanceStatusResponse,
  type RunnerHealth,
} from "./signing";

export function runnerConfigured(): boolean {
  return !!env().RUNNER_URL && !!env().RUNNER_SHARED_SECRET;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { RUNNER_URL, RUNNER_SHARED_SECRET } = env();
  if (!RUNNER_URL || !RUNNER_SHARED_SECRET) {
    throw new AppError(
      "UNAVAILABLE",
      "Challenge execution is not configured on this deployment. Use the downloadable offline artifacts instead.",
    );
  }
  const payload = body === undefined ? "" : JSON.stringify(body);
  const headers = signRequest(RUNNER_SHARED_SECRET, method, path, payload);
  let res: Response;
  try {
    res = await fetch(new URL(path, RUNNER_URL), {
      method,
      headers: { ...headers, ...(payload ? { "content-type": "application/json" } : {}) },
      body: payload || undefined,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new AppError("UNAVAILABLE", `Challenge runner unreachable: ${(e as Error).message}`);
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `runner error ${res.status}`;
    throw new AppError(res.status === 429 ? "RATE_LIMITED" : "UNAVAILABLE", `Challenge runner: ${msg}`);
  }
  return data as T;
}

export const runner = {
  health: () => call<RunnerHealth>("GET", "/v1/health"),
  create: (req: CreateInstanceRequest) => call<CreateInstanceResponse>("POST", "/v1/instances", req),
  reset: (ref: string, req: CreateInstanceRequest) => call<CreateInstanceResponse>("POST", `/v1/instances/${encodeURIComponent(ref)}/reset`, req),
  destroy: (ref: string) => call<{ ok: true }>("DELETE", `/v1/instances/${encodeURIComponent(ref)}`),
  status: (ref: string) => call<InstanceStatusResponse>("GET", `/v1/instances/${encodeURIComponent(ref)}`),
};
