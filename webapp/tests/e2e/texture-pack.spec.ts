import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import JSZip from "jszip";
import { seedTextures, seedProject, openEditor } from "../support/seed";

const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("build a texture pack and download it as a resource pack zip", async ({ page }) => {
  await seedTextures(page);
  await page.addInitScript((b64) => {
    const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const req = indexedDB.open("mc-ui-builder", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("textures");
    req.onsuccess = () => req.result.transaction("textures", "readwrite").objectStore("textures").put(new Blob([png], { type: "image/png" }), "pack:custom/golden_sword.png");
  }, PNG_1x1);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  await page.getByTitle("Texture Packs", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const editor = page.getByTestId("element-editor");
  const download = editor.getByRole("button", { name: "Download resource pack" });
  await expect(download).toBeDisabled();

  await editor.locator('[data-field="name"] input').fill("Shiny Swords");
  await editor.locator('[data-field="description"] input').fill("Golden diamond swords");
  await editor.locator('[data-field="target"] input').first().fill("item/diamond_sword");
  await editor.locator('[data-field="texture"]').first().getByTitle("Change texture").click();
  await page.getByTitle("custom/golden_sword.png").click();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("assets/minecraft/textures/item/diamond_sword.png")).toBeVisible();

  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toBe("shiny_swords.zip"); // the id follows the name
  const zip = await JSZip.loadAsync(readFileSync((await file.path())!));
  expect(Object.keys(zip.files).filter((p) => !zip.files[p].dir).sort()).toEqual(["assets/minecraft/textures/item/diamond_sword.png", "pack.mcmeta"]);
  expect(JSON.parse(await zip.file("pack.mcmeta")!.async("string"))).toEqual({ pack: { description: "Golden diamond swords", min_format: 88, max_format: 88 } });
  expect((await zip.file("assets/minecraft/textures/item/diamond_sword.png")!.async("uint8array")).length).toBeGreaterThan(0);
});
