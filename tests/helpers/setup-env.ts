import path from "node:path";
import os from "node:os";

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://cyberquest:cyberquest_dev@localhost:5432/cyberquest_test";
process.env.APP_URL = "http://localhost:3000";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789abcdef";
process.env.FLAG_PEPPER = "test-flag-pepper-0123456789abcdef0123456789abcdef";
process.env.INSTANCE_FLAG_SECRET = "test-instance-secret-0123456789abcdef0123456789abcdef";
process.env.STORAGE_DIR = path.join(os.tmpdir(), "cyberquest-test-artifacts");
process.env.MAX_UPLOAD_MB = "2";
delete process.env.REDIS_URL;
if (!process.env.KEEP_RUNNER_ENV) {
  delete process.env.RUNNER_URL;
  delete process.env.RUNNER_SHARED_SECRET;
}
