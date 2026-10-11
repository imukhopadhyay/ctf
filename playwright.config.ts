import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Expect the app running at APP_URL (default localhost:3000)
 * with the development seed applied. Run: npm run test:e2e
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
});
