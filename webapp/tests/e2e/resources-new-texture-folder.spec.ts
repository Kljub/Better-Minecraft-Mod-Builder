import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Resources: a texture painted from inside a folder is saved into that folder", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Resources", { exact: true }).click();
  const panel = page.getByTestId("resources-panel");
  await panel.getByTitle("New folder").click();
  await panel.getByPlaceholder("Folder name").fill("Gems");
  await panel.getByPlaceholder("Folder name").press("Enter");
  const gems = panel.locator('[data-folder="folder:Gems"]');
  await gems.click();

  await panel.getByRole("button", { name: "New texture" }).click();
  await page.getByPlaceholder("texture").fill("sapphire");
  await page.getByRole("button", { name: "Save texture" }).click();

  // Back in Resources the folder is still open and holds the new texture.
  await page.getByTitle("Resources", { exact: true }).click();
  await expect(gems).toContainText("1");
  await expect(panel.locator('[data-texture-key="custom/sapphire.png"]')).toBeVisible();
  await panel.locator('[data-folder="unsorted"]').click();
  await expect(panel.locator('[data-texture-key="custom/sapphire.png"]')).toHaveCount(0);
});
