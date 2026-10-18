import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("right-click a tile in All categories to rename and delete it", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  // One element to work with.
  await page.getByTitle("Commands", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();

  await page.getByTitle("All categories", { exact: true }).click();
  const overview = page.getByTestId("workspace-overview");
  await overview.getByText("command_1").click({ button: "right" });
  const menu = page.getByTestId("workspace-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("Commands · command_1");
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/context-menu.png` : "test-results/context-menu.png" });

  page.once("dialog", (d) => d.accept("heal"));
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  await expect(menu).toBeHidden();
  await expect(overview.getByText("heal", { exact: true })).toBeVisible();

  // Escape closes without doing anything.
  await overview.getByText("heal", { exact: true }).click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  page.once("dialog", (d) => d.accept());
  await overview.getByText("heal", { exact: true }).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  await expect(overview.getByText("heal", { exact: true })).toBeHidden();
});

test("right-click a custom texture in All categories to rename and delete it", async ({ page }) => {
  await seedTextures(page);
  // one custom image, as if uploaded in the Resources tab (1×1 PNG)
  await page.addInitScript(() => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const req = indexedDB.open("mc-ui-builder", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("textures");
    req.onsuccess = () => req.result.transaction("textures", "readwrite").objectStore("textures").put(new Blob([png], { type: "image/png" }), "pack:custom/ruby_gem.png");
  });
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  await page.getByTitle("All categories", { exact: true }).click();
  const overview = page.getByTestId("workspace-overview");
  const menu = page.getByTestId("workspace-context-menu");

  await overview.getByText("ruby_gem", { exact: true }).click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeEnabled();
  page.once("dialog", (d) => d.accept("emerald_gem"));
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  await expect(overview.getByText("emerald_gem", { exact: true })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await overview.getByText("emerald_gem", { exact: true }).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  await expect(overview.getByText("emerald_gem", { exact: true })).toBeHidden();
});
