import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor, seedPackTexture, chestSkinBase64 } from "../support/seed";

async function newModel(page: import("@playwright/test").Page) {
  await seedTextures(page);
  await seedPackTexture(page, "entity/chest/normal.png", chestSkinBase64());
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

test("model editor: settings tab edits death and hurt drops", async ({ page }) => {
  await newModel(page);
  await page.getByRole("tab", { name: "Settings" }).click();
  const settings = page.getByTestId("entity-settings");
  await settings.getByRole("button", { name: "Add drop" }).click();
  const drop = settings.locator('[data-field="drops"]');
  await drop.locator('[data-field="item"] input').fill("minecraft:bone");
  await drop.locator('[data-field="max"] input').fill("3");
  await drop.locator('[data-field="max"] input').press("Enter");
  await settings.getByRole("button", { name: "Add hurt drop" }).click();
  await expect(settings.locator('[data-field="hurtDrops"] [data-field="chance"] input')).toHaveValue("0.25");
  // Survives switching tabs (stored on the element).
  await page.getByRole("tab", { name: "Design" }).click();
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByTestId("entity-settings").locator('[data-field="drops"] [data-field="item"] input')).toHaveValue("minecraft:bone");
  await expect(page.getByTestId("entity-settings").locator('[data-field="drops"] [data-field="max"] input')).toHaveValue("3");
});

test("model editor: start from a vanilla Minecraft mob (geometry + texture loaded from Mojang's bedrock-samples)", async ({ page }) => {
  const { PNG } = await import("pngjs");
  const png = new PNG({ width: 64, height: 32 });
  png.data.fill(200);
  const geo = {
    format_version: "1.8.0",
    "geometry.zombie.v1.8": { texturewidth: 64, textureheight: 32, bones: [
      { name: "body", pivot: [0, 24, 0], cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }] },
      { name: "head", parent: "body", pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }] },
      { name: "rightArm", parent: "body", pivot: [-5, 22, 0], cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] }] },
    ] },
  };
  const requested: string[] = [];
  await page.route("https://raw.githubusercontent.com/Mojang/bedrock-samples/**", (route) => {
    const url = route.request().url();
    requested.push(url.split("/resource_pack/")[1]);
    if (url.endsWith(".geo.json")) return route.fulfill({ body: "// legacy\n" + JSON.stringify(geo), contentType: "application/json", headers: { "access-control-allow-origin": "*" } });
    return route.fulfill({ body: PNG.sync.write(png), contentType: "image/png", headers: { "access-control-allow-origin": "*" } });
  });
  await newModel(page);
  await page.getByRole("button", { name: "From Minecraft" }).click();
  const dialog = page.getByTestId("vanilla-mob-dialog");
  await dialog.getByLabel("Search mobs").fill("zombie");
  await dialog.getByRole("button", { name: "Zombie", exact: true }).click();
  await expect(dialog).toBeHidden();
  const outliner = page.getByTestId("model-outliner");
  for (const bone of ["body", "head", "rightArm"]) await expect(outliner).toContainText(bone);
  expect(requested).toEqual(expect.arrayContaining(["models/entity/zombie.geo.json", "textures/entity/zombie/zombie.png"]));
});

test("model editor: rewrite the selected animation with AI (one undo step)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: false, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  let sent: { task?: string; prompt?: string; context?: { bones?: { name: string }[]; animation?: unknown } } = {};
  await page.route("**/api/ai/generate", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { name: "idle", length: 2, loop: "loop", channels: [
      { bone: "body", channel: "position", keyframes: [{ t: 0, x: 0, y: 0, z: 0, i: "catmullrom" }, { t: 1, x: 0, y: 2, z: 0, i: "catmullrom" }, { t: 2, x: 0, y: 0, z: 0, i: "catmullrom" }] },
    ] } });
  });
  await newModel(page);
  await page.getByRole("tab", { name: "Animation" }).click();
  const bar = page.getByTestId("animation-ai");
  await bar.getByLabel("Animation request").fill("a bouncy idle");
  await bar.getByRole("button", { name: /Create|Rewrite/ }).click();
  await expect(page.getByText(/Ctrl\+Z undoes it/)).toBeVisible();
  expect(sent.task).toBe("animation");
  expect(sent.prompt).toBe("a bouncy idle");
  expect(sent.context?.bones?.map((b) => b.name)).toContain("body");
  await expect(page.getByTestId("animation-timeline")).toContainText("idle");
});

test("model editor: click rotates, double-click resizes one side only, snapping per pixel", async ({ page }) => {
  await newModel(page);
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.getByLabel("View").selectOption("front");
  const vp = page.getByTestId("model-viewport");
  const box = (await vp.boundingBox())!;
  // Front view: camera at z = -64 looking at (0, 10, 0), fov 45 — the default cube spans x -4..4, y 0..8.
  const half = Math.tan((22.5 * Math.PI) / 180) * 64; // world units from the centre to the top edge at z = 0
  const toScreen = (x: number, y: number) => ({
    x: box.x + box.width / 2 - (x / half) * (box.height / 2),
    y: box.y + box.height / 2 - ((y - 10) / half) * (box.height / 2),
  });
  const cube = toScreen(0, 4);
  await page.mouse.click(cube.x, cube.y);
  await expect(page.getByRole("button", { name: /^Rotate/ })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.dblclick(cube.x, cube.y);
  await expect(page.getByRole("button", { name: /^Resize/ })).toHaveAttribute("aria-pressed", "true");
  if (process.env.SHOT_DIR) await vp.screenshot({ path: `${process.env.SHOT_DIR}/resize-handles.png` });

  // East handle sits 1.2 px outside the +x face; dragging it 3 px outward only moves that face.
  const handle = toScreen(4 + 1.2, 4);
  const target = toScreen(4 + 1.2 + 3, 4);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.waitForTimeout(200);
  await page.mouse.move(target.x - 1, target.y);
  await page.mouse.up();
  const props = page.getByTestId("model-properties");
  await expect(props.locator("span:text-is('Size') + div input").first()).toHaveValue("11");
  await expect(props.locator("span:text-is('Position (from)') + div input").first()).toHaveValue("-4");
});

test("model editor: Block import — a chest skin brings the chest geometry and its texture", async ({ page }) => {
  await newModel(page);
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.getByRole("button", { name: "Block", exact: true }).click();
  const picker = page.getByRole("dialog");
  await picker.getByPlaceholder("Search…").fill("chest/normal");
  await picker.getByTitle(/entity\/chest\/normal\.png/).first().click();
  await picker.getByRole("button", { name: /^Select/ }).click();
  const outliner = page.getByTestId("model-outliner");
  for (const name of ["chest", "lid", "bottom", "lock"]) await expect(outliner.locator(`[data-outliner="${name}"]`).first()).toBeVisible();
  await expect(page.getByTestId("model-editor").getByText("3 cubes", { exact: true })).toBeVisible();
  if (process.env.SHOT_DIR) {
    await page.waitForTimeout(3000);
    await page.getByTestId("model-viewport").screenshot({ path: `${process.env.SHOT_DIR}/chest-entity.png` });
  }
});
