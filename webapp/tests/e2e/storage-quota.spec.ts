import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

const storedHistory = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("mc-ui-builder-projects") ?? "[]") as { key: string; session: { history: unknown[]; cursor: number } }[];
    const p = list.find((x) => x.key === "e2e");
    return p ? { length: p.session.history.length, cursor: p.session.cursor } : null;
  });

test("only the last 10 undo steps are written to browser storage", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Commands", { exact: true }).click();
  for (let i = 0; i < 12; i++) {
    await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
    await page.getByTitle("Commands", { exact: true }).click();
  }
  await expect(page.getByTestId("category-view").locator("[data-entry]")).toHaveCount(12);
  await expect.poll(() => storedHistory(page)).toEqual({ length: 10, cursor: 9 });
  // the live editor still has its full undo history
  for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Undo" }).click();
  await page.getByTitle("Commands", { exact: true }).click();
  await expect(page.getByTestId("category-view").locator("[data-entry]")).toHaveCount(0);
});

test("a full browser storage shows a warning instead of failing silently", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  // Fill localStorage up to its quota with junk.
  await page.evaluate(() => {
    const chunk = "x".repeat(256 * 1024);
    for (let i = 0; i < 100; i++) {
      try { localStorage.setItem(`junk_${i}`, chunk); } catch { break; }
    }
    for (let size = 64 * 1024; size >= 16; size = Math.floor(size / 2)) {
      for (let i = 0; i < 64; i++) {
        try { localStorage.setItem(`junk_s${size}_${i}`, "x".repeat(size)); } catch { break; }
      }
    }
  });
  await page.getByTitle("Commands", { exact: true }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
    await page.getByTitle("Commands", { exact: true }).click();
  }
  await expect(page.getByText(/Browser storage is full/)).toBeVisible();
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("junk_")).forEach((k) => localStorage.removeItem(k)));
});
