import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { seedTextures, seedProject, openEditor } from "../support/seed";
import type { ScreenSpec } from "../../lib/types";

const PNG = path.join(__dirname, "../fixtures/real-textures/mc_button_normal.png");

function screen(): ScreenSpec {
  return {
    id: "main", width: 320, height: 180,
    widgets: [{ id: "btn", type: "button", x: 8, y: 8, w: 60, h: 20, text: "Start", icon: null, props: {} }],
  };
}

test("'All categories' opens the workspace overview; opening a tile returns to its editor", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, screen());
  await openEditor(page);

  await page.getByTitle("All categories", { exact: true }).click();
  const overview = page.getByTestId("workspace-overview");
  await expect(overview).toBeVisible();
  await expect(overview.getByTitle("main", { exact: true })).toBeVisible();

  await overview.getByTitle("main", { exact: true }).click();
  await expect(overview).toHaveCount(0);
  await expect(page.locator('[data-widget-id="btn"]')).toHaveCount(1);
});

test("Resources: upload images, create a folder, drag an image into it", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, screen());
  await openEditor(page);

  await page.getByTitle("Resources", { exact: true }).click();
  const panel = page.getByTestId("resources-panel");
  await expect(panel).toBeVisible();

  await panel.getByTestId("resources-upload-input").setInputFiles([
    { name: "ruby.png", mimeType: "image/png", buffer: fs.readFileSync(PNG) },
    { name: "emerald.png", mimeType: "image/png", buffer: fs.readFileSync(PNG) },
  ]);
  const ruby = panel.locator('[data-texture-key="custom/ruby.png"]');
  await expect(ruby).toBeVisible();
  await expect(panel.locator('[data-texture-key="custom/emerald.png"]')).toBeVisible();

  await panel.getByTitle("New folder").click();
  await panel.getByPlaceholder("Folder name").fill("Gems");
  await panel.getByPlaceholder("Folder name").press("Enter");
  const gems = panel.locator('[data-folder="folder:Gems"]');
  await expect(gems).toBeVisible();

  // The new folder is opened and empty; go back to all images and drag ruby onto it.
  await panel.locator('[data-folder="all"]').click();
  await ruby.click(); // just-uploaded images are all selected — and dragging moves the whole selection
  await ruby.dragTo(gems);
  await expect(gems).toContainText("1");

  await gems.click();
  await expect(panel.locator('[data-texture-key="custom/ruby.png"]')).toBeVisible();
  await expect(panel.locator('[data-texture-key="custom/emerald.png"]')).toHaveCount(0);

  await panel.locator('[data-folder="unsorted"]').click();
  await expect(panel.locator('[data-texture-key="custom/emerald.png"]')).toBeVisible();
  await expect(panel.locator('[data-texture-key="custom/ruby.png"]')).toHaveCount(0);
});

test("Resources: duplicate an image — the copy lands in the same folder", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, screen());
  await openEditor(page);
  await page.getByTitle("Resources", { exact: true }).click();
  const panel = page.getByTestId("resources-panel");
  await panel.getByTestId("resources-upload-input").setInputFiles([{ name: "ruby.png", mimeType: "image/png", buffer: fs.readFileSync(PNG) }]);
  await panel.getByTitle("New folder").click();
  await panel.getByPlaceholder("Folder name").fill("Gems");
  await panel.getByPlaceholder("Folder name").press("Enter");
  const gems = panel.locator('[data-folder="folder:Gems"]');
  await panel.locator('[data-folder="all"]').click();
  const ruby = panel.locator('[data-texture-key="custom/ruby.png"]');
  await ruby.click();
  await ruby.dragTo(gems);
  await gems.click();
  await panel.locator('[data-texture-key="custom/ruby.png"]').click();

  await panel.getByRole("button", { name: "Duplicate" }).click();
  await expect(panel.locator('[data-texture-key="custom/ruby_copy.png"]')).toBeVisible(); // in "Gems" too
  await expect(gems).toContainText("2");
  // Duplicating the original again doesn't clash.
  await panel.locator('[data-texture-key="custom/ruby.png"]').click();
  await panel.getByRole("button", { name: "Duplicate" }).click();
  await expect(panel.locator('[data-texture-key="custom/ruby_copy_2.png"]')).toBeVisible();

  // Also offered in "All categories" on right-click.
  await page.getByTitle("All categories", { exact: true }).click();
  await page.getByTestId("workspace-overview").getByText("ruby", { exact: true }).click({ button: "right" });
  await page.getByTestId("workspace-context-menu").getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByText(/Duplicated as “ruby_copy_3”/)).toBeVisible();
});
