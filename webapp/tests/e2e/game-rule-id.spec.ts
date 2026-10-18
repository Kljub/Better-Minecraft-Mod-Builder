import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Game rule id follows its display name (lowercase, spaces to _)", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, widgets: [] });
  await openEditor(page);

  await page.getByTitle("Game Rules", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const editor = page.getByTestId("element-editor");
  await editor.locator('[data-field="name"] input').fill("Do Mob Raids");
  await expect(editor.getByText(/:do_mob_raids$/)).toBeVisible();
});
