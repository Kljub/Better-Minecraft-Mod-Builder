import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { seedTextures } from "../support/seed";

/**
 * Accounts + cloud storage. Needs a server with accounts on (MMB_DB_* in .env.local); the default
 * Playwright server runs with accounts off, so this skips there.
 */
test.describe.configure({ mode: "serial" });

const username = `e2e_${Date.now().toString(36)}`;
const password = "correct-horse-42";

function dbEnv(): Record<string, string> {
  const file = path.join(__dirname, "../../.env.local");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split("\n").filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
}

test.beforeEach(async ({ page }) => {
  const me = await (await page.request.get("/api/auth/me")).json();
  test.skip(!me.enabled, "accounts are off on this server");
});

test.afterAll(async () => {
  const env = dbEnv();
  if (!env.MMB_DB_NAME) return;
  const conn = await mysql.createConnection({ host: env.MMB_DB_HOST, port: Number(env.MMB_DB_PORT || 3306), user: env.MMB_DB_USER, password: env.MMB_DB_PASSWORD, database: env.MMB_DB_NAME });
  await conn.execute("DELETE FROM mmb_users WHERE username = ?", [username]); // cascades to sessions/projects/files
  await conn.end();
});

async function seedLocalProject(page: Page) {
  // A project from before accounts existed: only in this browser's localStorage.
  await page.goto("/api/auth/me");
  await page.evaluate(() => {
    const session = { history: [{ screens: [{ id: "legacy_screen", modId: "acctmod", width: 100, height: 100, widgets: [] }], activeIdx: 0 }], cursor: 0, gridSize: 4, showGrid: false, scale: 3 };
    localStorage.setItem("mc-ui-builder-projects", JSON.stringify([{ key: "project_legacy", session, updatedAt: 1000 }]));
  });
}

test("register moves local projects into the account; another browser sees them after login", async ({ page, browser }) => {
  await seedTextures(page);
  await seedLocalProject(page);
  await page.goto("/");
  const form = page.getByTestId("login-form");
  await expect(form).toBeVisible();

  // Wrong password for an unknown user.
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password", { exact: true }).fill("nope-nope");
  await form.getByRole("button", { name: "Log in" }).click();
  await expect(form.getByRole("alert")).toContainText("Wrong username or password");

  await form.getByRole("button", { name: /Create one/ }).click();
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByLabel("Repeat password").fill(password);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("account-menu")).toContainText(username);
  await expect(page.getByText("legacy_screen")).toBeVisible();

  const sync = await (await page.request.get("/api/sync")).json();
  expect(sync.projects.map((p: { key: string }) => p.key)).toContain("project_legacy");

  // A fresh browser (no localStorage) gets the project from the account.
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await seedTextures(page2);
  await page2.goto("/");
  const form2 = page2.getByTestId("login-form");
  await form2.getByLabel("Username").fill(username);
  await form2.getByLabel("Password", { exact: true }).fill(password);
  await form2.getByRole("button", { name: "Log in" }).click();
  await expect(page2.getByText("legacy_screen")).toBeVisible();

  // Deleting there removes it from the account; logout clears the browser's copy.
  await page2.getByRole("button", { name: "Delete project legacy_screen" }).click();
  await page2.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect.poll(async () => (await (await page2.request.get("/api/sync")).json()).projects.find((p: { key: string }) => p.key === "project_legacy")?.deletedAt).toBeTruthy();
  await page2.getByRole("button", { name: "Log out" }).click();
  await expect(page2.getByTestId("login-form")).toBeVisible();
  expect(await page2.evaluate(() => localStorage.getItem("mc-ui-builder-projects"))).toBeNull();
  await other.close();

  // The first browser drops the deleted project on its next load.
  await page.reload();
  await expect(page.getByTestId("account-menu")).toBeVisible();
  await expect(page.getByText("legacy_screen")).toHaveCount(0);
});

test("Settings → AI links a Claude account (stored encrypted, never sent back) and removes it", async ({ page }) => {
  await seedTextures(page);
  await page.goto("/");
  const form = page.getByTestId("login-form");
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByTestId("account-menu")).toBeVisible();
  const session = { history: [{ screens: [{ id: "main", modId: "acctmod", width: 100, height: 100, widgets: [] }], activeIdx: 0 }], cursor: 0, gridSize: 4, showGrid: false, scale: 3 };
  expect((await page.request.put("/api/projects?key=project_acct", { data: { updatedAt: Date.now(), session } })).ok()).toBe(true);
  await page.goto("/editor/project_acct");
  // On a plain dev server the Next.js dev-tools badge sits over the rail's Settings button.
  await page.getByTitle("Settings").first().evaluate((b: HTMLElement) => b.click());
  await page.getByRole("button", { name: "AI", exact: true }).click();
  const panel = page.getByTestId("ai-accounts");
  await panel.getByRole("button", { name: "Add account" }).click();
  const add = page.getByTestId("ai-account-form");
  await add.getByLabel("Account name").fill("work@example.com");
  await add.getByLabel("Token or key").fill("sk-ant-oat01-not-a-real-token-0123456789");
  await add.getByRole("button", { name: "Link" }).click();
  await expect(panel.getByTestId("ai-account")).toHaveCount(1);
  await expect(panel.getByTestId("ai-account")).toContainText("work@example.com");
  await expect(panel.getByTestId("ai-account")).toContainText("Next");

  const listed = await (await page.request.get("/api/ai/accounts")).text();
  expect(listed).toContain("work@example.com");
  expect(listed).not.toContain("not-a-real-token");

  page.on("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "Remove" }).click();
  await expect(panel.getByTestId("ai-account")).toHaveCount(0);
});

test("API refuses requests without a session or from another origin", async ({ request }) => {
  expect((await request.get("/api/sync")).status()).toBe(401);
  expect((await request.put("/api/projects?key=x", { data: { session: {} }, headers: { origin: "http://evil.example" } })).status()).toBe(403);
});
