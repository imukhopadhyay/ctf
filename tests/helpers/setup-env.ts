import { beforeAll } from "vitest";
import path from "node:path";
import os from "node:os";

function applyTestEnv() {
  const e = process.env as Record<string, string | undefined>;
  e.NODE_ENV = "test";
  e.DATABASE_URL = e.TEST_DATABASE_URL ?? "postgresql://cyberquest:cyberquest_dev@localhost:5432/cyberquest_test";
  e.APP_URL = "http://localhost:3000";
  e.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789abcdef";
  e.FLAG_PEPPER = "test-flag-pepper-0123456789abcdef0123456789abcdef";
  e.INSTANCE_FLAG_SECRET = "test-instance-secret-0123456789abcdef0123456789abcdef";
  e.STORAGE_DIR = path.join(os.tmpdir(), "cyberquest-test-artifacts");
  e.MAX_UPLOAD_MB = "2";
  // Tests must never touch a shared Redis: rate limits use the in-process map
  // so they can be reset deterministically between tests.
  delete e.REDIS_URL;
  if (!e.KEEP_RUNNER_ENV) {
    delete e.RUNNER_URL;
    delete e.RUNNER_SHARED_SECRET;
  }
}

applyTestEnv();
beforeAll(applyTestEnv);
