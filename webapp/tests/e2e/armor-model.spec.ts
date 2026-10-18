import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("armor: create a custom 3D model from the vanilla template, around a see-through player", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Armor", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const ws = page.getByTestId("armor-workspace");
  await expect(ws).toBeVisible();
  await ws.getByRole("tab", { name: /3D model/ }).click();
  await ws.getByRole("button", { name: "Create 3D armor model" }).click();

  const editor = page.getByTestId("model-editor");
  await expect(editor).toBeVisible();
  // Armor variant: Design + Skin only.
  await expect(editor.getByRole("tab", { name: "Animation" })).toHaveCount(0);
  await expect(editor.getByRole("tab", { name: "Settings" })).toHaveCount(0);
  const outliner = page.getByTestId("model-outliner");
  for (const bone of ["armorHead", "armorBody", "armorRightArm", "armorLeftBoot", "armorWaist"]) await expect(outliner).toContainText(bone);
  await expect(ws).toContainText("no texture");

  // Survives switching to Properties and back (stored on the armor).
  await ws.getByRole("tab", { name: "Properties" }).click();
  await ws.getByRole("tab", { name: "3D model" }).click();
  await expect(page.getByTestId("model-outliner")).toContainText("armorHead");
});
