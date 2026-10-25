import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("custom attribute: the id follows the display name as {modid}_attribute_{name}, references move along", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Attributes", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const idInput = page.locator("div:has(> :text-is('ID')) input").first();
  const nameInput = page.locator("div:has(> :text-is('Display Name')) input").first();
  await expect(idInput).toHaveValue("mymod_attribute_new_attribute");
  await nameInput.fill("Mana");
  await expect(idInput).toHaveValue("mymod_attribute_mana");

  // An item uses it…
  await page.getByTitle("Items", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  await page.getByRole("button", { name: "+ Add attribute" }).evaluate((b: HTMLElement) => b.click());
  const select = page.locator("select").filter({ has: page.locator('option[value="mymod_attribute_mana"]') }).first();
  await select.selectOption("mymod_attribute_mana");

  // …and follows a new display name.
  await page.getByRole("button", { name: "Edit custom attribute" }).evaluate((b: HTMLElement) => b.click());
  await nameInput.fill("Mana Regen");
  await expect(idInput).toHaveValue("mymod_attribute_mana_regen");
  await page.getByTitle("Items", { exact: true }).click();
  await page.getByTestId("category-view").locator("[data-entry]").first().dblclick();
  await expect(page.locator('select option[value="mymod_attribute_mana_regen"]:checked')).toHaveCount(1);

  // Edited by hand → no longer follows.
  await page.getByRole("button", { name: "Edit custom attribute" }).evaluate((b: HTMLElement) => b.click());
  await idInput.fill("mana_custom");
  await idInput.press("Enter");
  await nameInput.fill("Mana Boost");
  await expect(idInput).toHaveValue("mana_custom");
});
