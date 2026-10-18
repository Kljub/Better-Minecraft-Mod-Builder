import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Tests live either under tests/ (shared e2e/support/fixtures) or alongside
  // each widget in components/widgets/<type>/ (one folder per widget: its
  // Visual, Edit/Try components, and its own tests).
  testDir: ".",
  testMatch: ["tests/**/*.spec.ts", "components/widgets/**/*.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: "pnpm run dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // MMB_DB_NAME="" keeps accounts off for the test server (no login screen; projects seeded into
    // localStorage as before) even when .env.local configures the database. tests/e2e/accounts.spec.ts
    // runs against a server with accounts on.
    env: { PLAYWRIGHT_TEST: "1", MMB_DB_NAME: "" },
  },
});
