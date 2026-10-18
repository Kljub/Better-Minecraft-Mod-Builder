import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { seedTextures, seedProject, openEditor } from "../support/seed";

/** A 16x16 grey square with a transparent border — stands in for every MCreator template. */
function templatePng(): Buffer {
  const png = new PNG({ width: 16, height: 16 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    const inside = x > 3 && x < 12 && y > 3 && y < 12;
    png.data.set(inside ? [128, 128, 128, 255] : [0, 0, 0, 0], i);
  }
  return PNG.sync.write(png);
}

test("texture editor: From template builds tinted layers (MCreator style)", async ({ page }) => {
  const requested: string[] = [];
  await page.route("https://raw.githubusercontent.com/MCreator/MCreator/**", (route) => {
    requested.push(decodeURIComponent(route.request().url().split("/").pop()!));
    return route.fulfill({ body: templatePng(), contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Resources", { exact: true }).click();
  await page.getByRole("button", { name: "New texture" }).click();
  await page.getByRole("button", { name: "From template" }).click();

  const dialog = page.getByTestId("template-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Generator template").selectOption("Sword");
  await expect(dialog.getByLabel("Layer 1 template")).toHaveValue("tool_base_stick");
  // Layer 2: pure red, locked → exact hue at the template's brightness.
  await dialog.getByLabel("Layer 2 template").selectOption("tool_sword");
  await dialog.getByLabel("Layer 2 colour").fill("#ff0000");
  await dialog.getByTestId("template-layer-2").getByLabel("Lock saturation and brightness").check();
  await dialog.getByLabel("Layer 3 template").selectOption("");
  await dialog.getByLabel("Layer 4 template").selectOption("");
  const preview = dialog.getByTestId("template-preview");
  await expect.poll(() => preview.evaluate((c: HTMLCanvasElement) => Array.from(c.getContext("2d")!.getImageData(8, 8, 1, 1).data))).toEqual([128, 0, 0, 255]);
  expect(requested).toEqual(expect.arrayContaining(["tool_base_stick.png", "tool_sword.png"]));

  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
  // On a blank texture the template replaces the empty "Layer 1" (top of the stack listed first).
  const layerNames = page.locator('input[class*="truncate"]');
  await expect(layerNames).toHaveCount(2);
  expect(await layerNames.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(["tool_sword", "tool_base_stick"]);

  // Painting on the lower layer where the upper one is opaque: the editor says why nothing shows.
  await layerNames.nth(1).locator("..").click({ position: { x: 2, y: 4 } });
  const canvases = page.locator("canvas");
  let box = null;
  for (let i = 0; i < await canvases.count(); i++) { const b = await canvases.nth(i).boundingBox(); if (b && b.width > 200) { box = b; break; } }
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const hint = page.getByTestId("paint-hint");
  await expect(hint).toContainText('"tool_sword" above covers this spot');
  await hint.getByRole("button", { name: "Select that layer" }).click();
  await expect(hint).toBeHidden();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByTestId("paint-hint")).toBeHidden();
});
