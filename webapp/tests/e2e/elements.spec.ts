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
  await editor.locator('[data-field="name"] input').fill("Lifesteal");
  await expect(page.getByText("data/mymod/enchantment/enchantment_1.json")).toBeVisible();

  // Back in the category grid the tile shows the name, not the id.
  await page.getByTitle("Enchantments", { exact: true }).click();
  await expect(page.getByTestId("category-view").getByText("Lifesteal")).toBeVisible();

  // And it's listed in the workspace overview.
  await page.getByTitle("All categories", { exact: true }).click();
  await expect(page.getByTestId("workspace-overview").getByText("Lifesteal")).toBeVisible();
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
