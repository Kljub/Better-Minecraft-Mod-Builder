import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

async function newModel(page: import("@playwright/test").Page) {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Entity Models", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  await expect(page.getByTestId("model-editor")).toBeVisible();
}

test("model editor: add a cube, edit its size, undo it", async ({ page }) => {
  await newModel(page);
  const outliner = page.getByTestId("model-outliner");
  await expect(outliner.locator('[data-outliner="body"]')).toHaveCount(2); // bone + its cube
  await expect(page.getByTestId("gpu-info")).toBeVisible();

  await page.getByTitle("Add cube").click();
  await expect(outliner.getByRole("treeitem")).toHaveCount(3);
  const props = page.getByTestId("model-properties");
  await expect(props.getByLabel("Cube name")).toHaveValue("cube");

  // Size X: second Vec3 row ("Size"), first input.
  const sizeX = props.locator("span:text-is('Size') + div input").first();
  await sizeX.fill("10");
  await sizeX.press("Enter");
  await expect(sizeX).toHaveValue("10");

  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Control+z");
  await outliner.getByRole("treeitem").nth(2).click();
  await expect(props.locator("span:text-is('Size') + div input").first()).toHaveValue("4");
});

test("model editor: imports a Bedrock geo.json", async ({ page }) => {
  await newModel(page);
  const geo = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: "geometry.blob", texture_width: 32, texture_height: 32 },
      bones: [
        { name: "root", pivot: [0, 0, 0], cubes: [{ origin: [-3, 0, -3], size: [6, 6, 6], uv: [0, 0] }] },
        { name: "eye", parent: "root", pivot: [0, 4, -3], cubes: [{ origin: [-1, 3, -4], size: [2, 2, 1], uv: [0, 12] }] },
      ],
    }],
  };
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("model-import-input").setInputFiles({ name: "blob.geo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(geo)) });
  const outliner = page.getByTestId("model-outliner");
  await expect(outliner.locator('[data-outliner="eye"]')).toHaveCount(2);
  await expect(outliner.locator('[data-outliner="root"]')).toHaveCount(2);
  await expect(page.getByTestId("model-editor").getByText("2 cubes", { exact: true })).toBeVisible();
});

test("model editor: right-click menu copies and pastes a cube", async ({ page }) => {
  await newModel(page);
  const outliner = page.getByTestId("model-outliner");
  await outliner.getByRole("treeitem").nth(1).click({ button: "right" });
  const menu = page.getByTestId("context-menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: /^Copy/ }).click();
  await outliner.getByRole("treeitem").nth(1).click({ button: "right" });
  await page.getByTestId("context-menu").getByRole("menuitem", { name: /^Paste/ }).click();
  await expect(outliner.getByRole("treeitem")).toHaveCount(3);
  await outliner.getByRole("treeitem").nth(2).click({ button: "right" });
  await page.getByTestId("context-menu").getByRole("menuitem", { name: /^Delete/ }).click();
  await expect(outliner.getByRole("treeitem")).toHaveCount(2);
});

test("model editor: animation tab keys a bone and plays", async ({ page }) => {
  await newModel(page);
  await page.getByRole("tab", { name: "Animation" }).click();
  page.once("dialog", (d) => d.accept("wave"));
  await page.getByTestId("animation-timeline").getByRole("button", { name: "New animation" }).last().click();
  await page.getByTestId("model-outliner").getByRole("treeitem").first().click();
  await page.getByRole("button", { name: "Key rotation" }).click();
  await expect(page.locator("[data-kf]")).toHaveCount(1);
  // second keyframe at 0.5 s with a value
  const track = page.getByTestId("timeline-track");
  const box = (await track.boundingBox())!;
  await page.mouse.click(box.x + 0.5 * 160 + 1, box.y + 10);
  await page.getByRole("button", { name: "Key rotation" }).click();
  await expect(page.locator("[data-kf]")).toHaveCount(2);
  const rotX = page.getByTestId("model-properties").locator("span:text-is('Rotation (°)') + div input").first();
  await rotX.fill("45");
  await rotX.press("Enter");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("timeline-time")).not.toHaveText(/^0\.50 /, { timeout: 3000 });
  await page.keyboard.press("Space");
});

test("model editor: settings tab stores entity stats", async ({ page }) => {
  await newModel(page);
  await page.getByRole("tab", { name: "Settings" }).click();
  const settings = page.getByTestId("entity-settings");
  await settings.locator('[data-field="displayName"] input').fill("Rail Gnawer");
  await settings.locator('[data-field="behavior"] select').selectOption("hostile_melee");
  await expect(settings.locator('[data-field="damageType"]')).toBeVisible();
  await page.getByRole("tab", { name: "Design" }).click();
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByTestId("entity-settings").locator('[data-field="displayName"] input')).toHaveValue("Rail Gnawer");
});

test("model editor: skin tab paints on the texture and on the 3D model, saves as the mob's texture", async ({ page }) => {
  await newModel(page);
  await page.getByRole("tab", { name: "Skin" }).click();
  const canvas = page.getByTestId("skin-canvas");
  await expect(canvas).toBeVisible();
  const px = (x: number, y: number) => canvas.evaluate((c: HTMLCanvasElement, [x, y]) => Array.from(c.getContext("2d")!.getImageData(x, y, 1, 1).data), [x, y] as [number, number]);

  // Flat texture: click at texture pixel (10, 12) with the palette's pure red.
  await page.getByTestId("skin-palette").getByTitle("#d94f4f").click();
  const box = (await canvas.boundingBox())!;
  const W = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
  const scale = box.width / W;
  await page.mouse.click(box.x + (10 + 0.5) * scale, box.y + (12 + 0.5) * scale);
  expect(await px(10, 12)).toEqual([217, 79, 79, 255]);

  // 3D: left-click the cube in the middle of the viewport paints somewhere on its UV.
  const before = await canvas.evaluate((c: HTMLCanvasElement) => { const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  const vp = (await page.getByTestId("model-viewport").first().boundingBox())!;
  await page.mouse.click(vp.x + vp.width / 2, vp.y + vp.height / 2 + 10);
  const after = await canvas.evaluate((c: HTMLCanvasElement) => { const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  expect(after).toBe(before + 1);

  // Local undo removes the 3D dab only.
  await page.keyboard.press("Control+z");
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => { const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })).toBe(before);

  // Saved as the model's own custom texture.
  await expect(page.getByTestId("skin-painter")).toContainText("custom/", { timeout: 5000 });
});

test("model editor: skin tab moves UV areas (with pixels) and shares one face on all sides", async ({ page }) => {
  await newModel(page);
  await page.getByRole("tab", { name: "Skin" }).click();
  const canvas = page.getByTestId("skin-canvas");
  await expect(canvas).toBeVisible();
  const px = (x: number, y: number) => canvas.evaluate((c: HTMLCanvasElement, [x, y]) => Array.from(c.getContext("2d")!.getImageData(x, y, 1, 1).data), [x, y] as [number, number]);
  const box = (await canvas.boundingBox())!;
  const scale = box.width / (await canvas.evaluate((c: HTMLCanvasElement) => c.width));
  const at = (x: number, y: number) => [box.x + (x + 0.5) * scale, box.y + (y + 0.5) * scale] as const;

  // Paint a pixel on the 8x8x8 body's top face (box UV island at 0,0; "up" = 8..16 x 0..8).
  await page.getByTestId("skin-palette").getByTitle("#d94f4f").click();
  await page.mouse.click(...at(10, 2));
  expect(await px(10, 2)).toEqual([217, 79, 79, 255]);

  // UV tool: drag the island by (+20, +20); the painted pixel moves with it.
  await page.keyboard.press("m");
  await expect(page.getByTestId("uv-panel")).toBeVisible();
  await page.mouse.move(...at(10, 2));
  await page.mouse.down();
  await page.mouse.move(...at(20, 12), { steps: 3 });
  await page.mouse.move(...at(30, 22), { steps: 3 });
  await page.mouse.up();
  expect(await px(30, 22)).toEqual([217, 79, 79, 255]);
  expect((await px(10, 2))[3]).toBe(0);
  await expect(page.getByTestId("uv-panel")).toContainText("box UV");

  // Per-face UV, then point every side at the north face.
  await page.getByTestId("uv-panel").getByRole("button", { name: "Edit faces separately" }).click();
  await expect(page.getByTestId("uv-panel")).toContainText("face: north");
  await page.getByTestId("uv-panel").getByRole("button", { name: "Use north on all sides" }).click();
  const rects = await page.getByTestId("uv-overlay").locator("rect").evaluateAll((els) =>
    new Set(els.map((e) => ["x", "y", "width", "height"].map((a) => e.getAttribute(a)).join(","))).size);
  expect(rects).toBe(1);

  // Back to box UV restores the unfolded layout (6 distinct rects).
  await page.getByTestId("uv-panel").getByRole("button", { name: "Back to box UV" }).click();
  await expect.poll(() => page.getByTestId("uv-overlay").locator("rect").evaluateAll((els) =>
    new Set(els.map((e) => ["x", "y", "width", "height"].map((a) => e.getAttribute(a)).join(","))).size)).toBe(6);
});
