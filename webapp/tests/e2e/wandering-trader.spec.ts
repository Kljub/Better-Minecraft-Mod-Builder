import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Village Professions: a custom wandering trader", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  // The analytics banner covers the bottom of the rail.
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.getByTitle("Village Professions", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const editor = page.getByTestId("element-editor");
  await expect(editor.locator('[data-field="jobSiteBlock"]')).toBeVisible();

  await editor.locator('[data-field="type"] select').selectOption("wandering");
  await expect(editor.locator('[data-field="jobSiteBlock"]')).toHaveCount(0);
  for (const f of ["spawnChance", "spawnIntervalMinutes", "stayMinutes", "llamas", "wanderingTrades"]) await expect(editor.locator(`[data-field="${f}"]`)).toBeVisible();
  await expect(editor.getByRole("alert")).toHaveCount(0);
  for (const path of ["data/mymod/trade_set/profession_1/common.json", "data/mymod/trade_set/profession_1/buying.json", "assets/mymod/items/profession_1_spawn_egg.json"]) {
    await expect(page.getByText(path, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("assets/mymod/screenspec/elements/wandering_traders.json", { exact: true })).toBeVisible();
});
