import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("create an enchantment from the rail, edit it, and see its exported files", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  await page.getByTitle("Enchantments", { exact: true }).click();
  await expect(page.getByTestId("category-view")).toBeVisible();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();

  const editor = page.getByTestId("element-editor");
  await expect(editor).toBeVisible();
  await editor.locator('[data-field="name"] input').fill("Life Steal");
  // The id follows the name (lowercase, spaces → "_").
  await expect(page.getByText("data/mymod/enchantment/life_steal.json")).toBeVisible();

  // Back in the category grid the tile shows the name, not the id.
  await page.getByTitle("Enchantments", { exact: true }).click();
  await expect(page.getByTestId("category-view").getByText("Life Steal")).toBeVisible();

  // And it's listed in the workspace overview.
  await page.getByTitle("All categories", { exact: true }).click();
  await expect(page.getByTestId("workspace-overview").getByText("Life Steal")).toBeVisible();
});

test("function editor flags an empty function", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  await page.getByTitle("Functions", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const editor = page.getByTestId("element-editor");
  await editor.locator('[data-field="code"] textarea').fill("");
  await expect(editor.getByRole("alert")).toContainText("no commands");
});

test("built-in categories: the id follows the display name", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Potions", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const idInput = page.locator("div:has(> :text-is('ID')) input").first();
  const nameInput = page.locator("div:has(> :text-is('Display Name')) input").first();
  await nameInput.fill("Elixir of Speed");
  await expect(idInput).toHaveValue("elixir_of_speed");
  await nameInput.fill("Elixir of Haste");
  await expect(idInput).toHaveValue("elixir_of_haste");
});

test("attribute pickers show namespaces; a custom attribute opens in its editor from the item", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Custom Attributes", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const attrPanel = page.locator("div:has(> :text-is('Custom Attribute'))").first();
  await expect(attrPanel).toContainText("mymod:");
  const attrId = await page.locator("div:has(> :text-is('ID')) input").first().inputValue();

  await page.getByTitle("Items", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  await page.getByRole("button", { name: "+ Add attribute" }).evaluate((b: HTMLElement) => b.click()); // cookie banner may overlap
  const select = page.locator("select").filter({ has: page.locator(`option[value="${attrId}"]`) }).first();
  await expect(select.locator('option[value="generic.max_health"]')).toHaveText("minecraft:max_health");
  await expect(select.locator("option:checked")).toHaveText("minecraft:max_health"); // closed control shows the label
  await expect(select.locator(`option[value="${attrId}"]`)).toContainText(`mymod:${attrId}`);
  await select.selectOption(attrId);
  await page.getByRole("button", { name: "Edit custom attribute" }).evaluate((b: HTMLElement) => b.click());
  await expect(page.locator("div:has(> :text-is('Custom Attribute'))").first()).toBeVisible();
  await expect(page.locator("div:has(> :text-is('ID')) input").first()).toHaveValue(attrId);
});
