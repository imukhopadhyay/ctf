import "server-only";
import { z } from "zod";

const secret = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters (use: openssl rand -hex 32)`);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: secret("SESSION_SECRET"),
  FLAG_PEPPER: secret("FLAG_PEPPER"),
  INSTANCE_FLAG_SECRET: secret("INSTANCE_FLAG_SECRET"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
  STORAGE_DIR: z.string().default("./storage/artifacts"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(2048).default(50),
  RUNNER_URL: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  RUNNER_SHARED_SECRET: z.string().min(32).optional().or(z.literal("").transform(() => undefined)),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  REGISTRATION_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.APP_URL.startsWith("http://")) {
    console.warn("[cyberquest] APP_URL uses http:// in production — TLS is required for secure cookies.");
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: forget the cached environment so tests can change process.env. */
export function resetEnvCache() {
  cached = undefined;
}
