import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("item fields open a creative-inventory picker (tabs, search, This Mod)", async ({ page }) => {
  // Icons come from GitHub; serve a grey square so the test runs offline.
  await page.route("https://raw.githubusercontent.com/Faithful-Pack/**", async (route) => {
    if (process.env.SHOT_DIR) return route.continue();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNgGAWjYBSMglEwCkYBhQAAkAAAAX0BJ8UAAAAASUVORK5CYII=", "base64");
    return route.fulfill({ body: png, contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Entity Models", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  await page.getByRole("tab", { name: "Settings" }).click();
  const settings = page.getByTestId("entity-settings");
  // Only item/block fields get the picker, not e.g. the animation name fields.
  await expect(settings.locator('[data-field="idleAnimation"]').getByRole("button", { name: "Pick item" })).toHaveCount(0);
  await settings.getByRole("button", { name: "Add drop" }).click();
  await settings.locator('[data-field="drops"]').getByRole("button", { name: "Pick item" }).click();

  const picker = page.getByTestId("creative-item-picker");
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Combat" }).click();
  await expect(picker.locator('[data-item="minecraft:diamond_sword"]')).toBeVisible();
  await picker.getByRole("button", { name: "Building Blocks" }).click();
  await expect(picker.locator('[data-item="minecraft:oak_log"]')).toBeVisible();
  if (process.env.SHOT_DIR) { await page.waitForTimeout(1500); await page.screenshot({ path: `${process.env.SHOT_DIR}/picker.png` }); }
  await picker.getByRole("textbox", { name: "Search items" }).fill("ender pearl");
  const cells = picker.locator("[data-item]");
  await expect(cells).toHaveCount(1);
  await cells.first().click();
  await expect(picker).toBeHidden();
  await expect(settings.locator('[data-field="drops"] [data-field="item"] input')).toHaveValue("minecraft:ender_pearl");
});
