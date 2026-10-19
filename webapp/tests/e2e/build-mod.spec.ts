import { test, expect } from "@playwright/test";
import JSZip from "jszip";
import { readFileSync } from "fs";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Build Mod: one jar with mod metadata, the project's content and the runtime nested", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  // An element so the jar has data content too.
  await page.getByTitle("Enchantments", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  await page.getByTestId("element-editor").locator('[data-field="name"] input').fill("Zap");

  await page.getByRole("button", { name: "Build Mod" }).click();
  const dialog = page.getByTestId("build-mod-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Mod version").fill("v1");
  await expect(dialog.getByRole("alert")).toContainText("not a valid version");
  await dialog.getByLabel("Mod version").fill("2.0.0");
  await dialog.getByLabel("Mod name").fill("My Mod");

  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Build mymod-2.0.0.jar" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("mymod-2.0.0.jar");
  const zip = await JSZip.loadAsync(readFileSync((await file.path())!));
  const toml = await zip.file("META-INF/neoforge.mods.toml")!.async("string");
  expect(toml).toContain('modId = "mymod"');
  expect(toml).toContain('displayName = "My Mod"');
  expect(zip.file("data/mymod/enchantment/zap.json")).toBeTruthy();
  expect(zip.file("assets/mymod/screenspec/main.json")).toBeTruthy();
  // This dev server has neoforge-runtime's jar for the default Minecraft version.
  expect(zip.file("META-INF/jarjar/metadata.json")).toBeTruthy();
  await expect(page.getByText("mymod-2.0.0.jar built")).toBeVisible();
});
