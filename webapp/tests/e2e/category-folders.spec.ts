import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("organize Entity Models into folders", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  const open = async () => { await page.getByTitle("Entity Models", { exact: true }).click(); };
  await open();
  const view = page.getByTestId("category-view");
  const folders = page.getByTestId("category-folders");

  // Two models, then a folder.
  for (let i = 0; i < 2; i++) {
    await view.getByRole("button", { name: "New" }).first().click();
    await open();
  }
  await folders.getByTitle("New folder").click();
  await folders.getByLabel("New folder name").fill("Bosses");
  await folders.getByLabel("New folder name").press("Enter");
  await expect(folders.getByText("Bosses")).toBeVisible();
  await expect(view.getByText("is empty")).toBeVisible();

  // "New" inside a folder lands in it.
  await view.getByRole("button", { name: "New" }).first().click();
  await open();
  await folders.getByText("Bosses").click();
  const tiles = view.locator("[data-entry]");
  await expect(tiles).toHaveCount(1);

  // Move another one in via the tile's folder button, one via drag & drop.
  await folders.getByText("No folder").click();
  await expect(tiles).toHaveCount(2);
  await tiles.first().hover();
  await tiles.first().getByTitle("Move to folder").click();
  await page.getByTestId("move-to-folder-menu").getByRole("menuitem", { name: "Bosses" }).click();
  await expect(tiles).toHaveCount(1);
  await tiles.first().dragTo(folders.locator('[data-folder="f:Bosses"]'));
  await expect(view.getByText("Everything is in a folder.")).toBeVisible();
  await expect(folders.locator('[data-folder="f:Bosses"]')).toContainText("3");
  await folders.getByText("Bosses").click();
  await tiles.first().hover();
  await tiles.first().getByTitle("Move to folder").click();
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/folders.png` });
  await page.keyboard.press("Escape");

  // Survives leaving the category; rename and delete keep the elements.
  await page.getByTitle("All categories", { exact: true }).click();
  await open();
  await folders.locator('[data-folder="f:Bosses"]').hover();
  await folders.getByTitle("Rename folder").click();
  await folders.getByLabel("Folder name").fill("Endgame");
  await folders.getByLabel("Folder name").press("Enter");
  await expect(folders.locator('[data-folder="f:Endgame"]')).toContainText("3");
  page.once("dialog", (d) => d.accept());
  await folders.locator('[data-folder="f:Endgame"]').hover();
  await folders.getByTitle("Delete folder").click();
  await expect(folders.locator('[data-folder="f:Endgame"]')).toHaveCount(0);
  await folders.getByText(/^All /).click();
  await expect(tiles).toHaveCount(3);
  await expect(folders.locator('[data-folder=""]')).toContainText("3");
});

test("built-in categories (Items, Screens, …) have folders too", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  const open = async () => { await page.getByTitle("Items", { exact: true }).click(); };
  await open();
  const view = page.getByTestId("category-view");
  const folders = page.getByTestId("category-folders");
  await view.getByRole("button", { name: "New" }).first().click();
  await open();
  await folders.getByTitle("New folder").click();
  await folders.getByLabel("New folder name").fill("Weapons");
  await folders.getByLabel("New folder name").press("Enter");
  await folders.getByText(/^All /).click();
  const tiles = view.locator("[data-entry]");
  await expect(tiles).toHaveCount(1);
  await tiles.first().dragTo(folders.locator('[data-folder="f:Weapons"]'));
  await expect(folders.locator('[data-folder="f:Weapons"]')).toContainText("1");

  // Kept after leaving and coming back; Screens has its own folder list.
  await page.getByTitle("Screens", { exact: true }).click();
  await expect(page.getByTestId("category-folders")).toBeVisible();
  await expect(page.getByTestId("category-folders").locator('[data-folder="f:Weapons"]')).toHaveCount(0);
  await open();
  await expect(folders.locator('[data-folder="f:Weapons"]')).toContainText("1");
});
