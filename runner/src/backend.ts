import type { CreateInstanceRequest, CreateInstanceResponse, InstanceStatusResponse } from "../../src/server/runner/signing";

export interface RunnerBackend {
  readonly name: string;
  isolationReport(): Record<string, unknown>;
  create(req: CreateInstanceRequest): Promise<CreateInstanceResponse>;
  reset(runnerRef: string, req: CreateInstanceRequest): Promise<CreateInstanceResponse>;
  destroy(runnerRef: string): Promise<void>;
  status(runnerRef: string): Promise<InstanceStatusResponse>;
  activeCount(): Promise<number>;
  reap(): Promise<number>;
}

/** Honest "not available" backend: refuses to run anything. */
export class DisabledBackend implements RunnerBackend {
  readonly name = "disabled";
  isolationReport() {
    return { backend: "disabled", note: "Execution is not available; offline artifacts only. Configure RUNNER_BACKEND=docker on a properly isolated host to enable." };
  }
  async create(): Promise<CreateInstanceResponse> {
    throw new Error("execution backend is disabled");
  }
  async reset(): Promise<CreateInstanceResponse> {
    throw new Error("execution backend is disabled");
  }
  async destroy() {}
  async status(): Promise<InstanceStatusResponse> {
    return { runnerRef: "", state: "missing" };
  }
  async activeCount() {
    return 0;
  }
  async reap() {
    return 0;
  }
}
