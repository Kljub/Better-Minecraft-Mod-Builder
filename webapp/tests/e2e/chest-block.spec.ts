import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor, seedPackTexture, chestSkinBase64 } from "../support/seed";

test("Blocks: picking a chest skin turns the block into a chest with a 3D preview", async ({ page }) => {
  await seedTextures(page);
  await seedPackTexture(page, "entity/chest/normal.png", chestSkinBase64());
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) await decline.click();

  await page.getByTitle("Blocks", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  await expect(page.getByLabel("Block model")).toHaveValue("cube");
  await expect(page.getByText("Per-Face Textures")).toBeVisible();

  await page.getByTitle("Change texture").first().click();
  const picker = page.getByRole("dialog");
  await picker.getByPlaceholder("Search…").fill("chest/normal");
  await picker.getByTitle(/entity\/chest\/normal\.png/).first().click();
  const select = picker.getByRole("button", { name: /^Select/ });
  if (await select.isVisible().catch(() => false)) await select.click();

  await expect(page.getByLabel("Block model")).toHaveValue("chest");
  await expect(page.getByText("Per-Face Textures")).toHaveCount(0);
  await expect(page.getByTestId("chest-viewer").locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Open lid" }).click();
  await page.waitForTimeout(600);
  if (process.env.SHOT_DIR) await page.getByTestId("chest-viewer").screenshot({ path: `${process.env.SHOT_DIR}/chest.png` });
});
