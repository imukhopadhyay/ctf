import { test, expect } from "@playwright/test";

// Public, read-only smoke checks against a seeded instance. No mutations, so
// these are safe to run against any environment with the dev seed applied.
test.describe("public pages", () => {
  test("landing page shows branding, stats and categories", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Registered participants/i)).toBeVisible();
    await expect(page.getByText("Challenges solved")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Web Exploitation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cryptography" })).toBeVisible();
  });

  test("competition directory lists the seeded competition", async ({ page }) => {
    await page.goto("/competitions");
    await expect(page.getByRole("heading", { name: "Competitions" })).toBeVisible();
    await expect(page.getByText("CyberQuest Open 2026")).toBeVisible();
  });

  test("public leaderboard is reachable without login", async ({ page }) => {
    await page.goto("/competitions/cyberquest-open-2026/leaderboard");
    await expect(page.getByText(/Rank|No participants/)).toBeVisible();
  });

  test("help page documents rules and responsible use", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: /Responsible-use policy/i })).toBeVisible();
  });

  test("protected pages redirect anonymous users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/Username or email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
  });
});
