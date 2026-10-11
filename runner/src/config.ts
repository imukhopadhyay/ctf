import { z } from "zod";

const schema = z.object({
  RUNNER_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  RUNNER_SHARED_SECRET: z.string().min(32, "RUNNER_SHARED_SECRET must be at least 32 characters"),
  RUNNER_BACKEND: z.enum(["docker", "disabled"]).default("disabled"),
  RUNNER_PUBLIC_HOST: z.string().default("127.0.0.1"),
  RUNNER_BIND_HOST: z.string().default("127.0.0.1"),
  RUNNER_ALLOWED_IMAGES: z.string().default(""),
  RUNNER_MAX_INSTANCES: z.coerce.number().int().min(1).max(1000).default(50),
  RUNNER_DOCKER_RUNTIME: z.string().optional(),
  RUNNER_PORT_MIN: z.coerce.number().int().default(21000),
  RUNNER_PORT_MAX: z.coerce.number().int().default(21999),
});

export type RunnerConfig = z.infer<typeof schema> & { allowedImagePrefixes: string[] };

export function loadConfig(): RunnerConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[runner] invalid configuration:\n" + parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"));
    process.exit(1);
  }
  return { ...parsed.data, allowedImagePrefixes: parsed.data.RUNNER_ALLOWED_IMAGES.split(",").map((s) => s.trim()).filter(Boolean) };
}
