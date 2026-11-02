import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("texture editor: a shape can be dragged past the canvas edge and is cut off there", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Resources", { exact: true }).click();
  await page.getByRole("button", { name: "New texture" }).click();
  await page.getByTitle("Ellipse").click();

  const canvases = page.locator("canvas");
  let box = null;
  for (let i = 0; i < await canvases.count(); i++) { const b = await canvases.nth(i).boundingBox(); if (b && b.width > 200) { box = b; break; } }
  const cell = box!.width / 16;
  // from the top-left pixel to 4 cells past the bottom-right corner: a 21-cell circle centred at 10
  await page.mouse.move(box!.x + cell / 2, box!.y + cell / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + cell * 20.5, box!.y + cell * 20.5, { steps: 10 });
  await page.mouse.up();

  const alphaAt = (x: number, y: number) => page.evaluate(([px, py]) => {
    const layer = [...document.querySelectorAll("canvas")].find((c) => c.style.display === "none")!;
    return layer.getContext("2d")!.getImageData(px, py, 1, 1).data[3];
  }, [x, y]);
  // (15,15) is inside that circle — it stayed empty when the drag stopped at the canvas edge
  await expect.poll(() => alphaAt(15, 15)).toBe(255);
  expect(await alphaAt(0, 0)).toBe(0);
});

test("texture editor: opening a big, non-square image keeps its size (no squeeze to 256×256)", async ({ page }) => {
  const { PNG } = await import("pngjs");
  const png = new PNG({ width: 300, height: 150 });
  png.data.fill(255);
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Resources", { exact: true }).click();
  const panel = page.getByTestId("resources-panel");
  await panel.getByTestId("resources-upload-input").setInputFiles([{ name: "wide.png", mimeType: "image/png", buffer: PNG.sync.write(png) }]);
  await panel.locator('[data-texture-key="custom/wide.png"]').dblclick();
  await expect.poll(() => page.evaluate(() => {
    const layer = [...document.querySelectorAll("canvas")].find((c) => c.style.display === "none")!;
    return `${layer.width}x${layer.height}`;
  })).toBe("300x150");
});

test("texture editor: click a layer to select it, double-click its name to rename", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Resources", { exact: true }).click();
  await page.getByRole("button", { name: "New texture" }).click();
  await page.getByTitle("Add layer").click();

  const names = page.locator("[data-layer-name]");
  await expect(names).toHaveText(["Layer 2", "Layer 1"]);
  // the new layer is active; clicking the name of the other one selects it
  await names.filter({ hasText: "Layer 1" }).click();
  await expect(names.filter({ hasText: "Layer 1" }).locator("..")).toHaveClass(/bg-accent/);
  await expect(names.filter({ hasText: "Layer 2" }).locator("..")).not.toHaveClass(/bg-accent/);

  await names.filter({ hasText: "Layer 1" }).dblclick();
  const input = page.getByLabel("Layer name");
  await expect(input).toBeFocused();
  await input.fill("Outline");
  await input.press("Enter");
  await expect(names).toHaveText(["Layer 2", "Outline"]);
});

test("texture editor: the AI side chat paints its answer onto a new layer above the active one", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: false, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  let sent: { task?: string; prompt?: string; context?: { width?: number; history?: unknown[] }; images?: unknown[] } = {};
  await page.route("**/api/ai/generate", async (route) => {
    sent = route.request().postDataJSON();
    // a 2×2 red block in the top-left corner of the 16×16 grid
    const rows = Array.from({ length: 16 }, (_, y) => (y < 2 ? "rr" : "..").padEnd(16, "."));
    await route.fulfill({ json: { reply: "Kopf gemalt.", target: "new_layer", layerName: "dragon head", palette: [{ key: "r", color: "#ff0000" }], rows } });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Resources", { exact: true }).click();
  await page.getByRole("button", { name: "New texture" }).click();

  const chat = page.getByTestId("texture-ai-chat");
  await chat.getByLabel("Ask the AI to draw").fill("mach mir noch einen Drachenkopf dazu");
  await chat.getByLabel("Ask the AI to draw").press("Enter");
  await expect(chat).toContainText("Kopf gemalt. → „dragon head“");
  expect(sent.task).toBe("layerPaint");
  expect(sent.context?.width).toBe(16);
  expect(sent.images).toHaveLength(2);

  await expect(page.locator("[data-layer-name]")).toHaveText(["dragon head", "Layer 1"]);
  const pixel = (x: number, y: number) => page.evaluate(([px, py]) => {
    const layers = [...document.querySelectorAll("canvas")].filter((c) => c.style.display === "none");
    return Array.from(layers[layers.length - 1].getContext("2d")!.getImageData(px, py, 1, 1).data);
  }, [x, y]);
  await expect.poll(() => pixel(1, 1)).toEqual([255, 0, 0, 255]);
  expect(await pixel(2, 2)).toEqual([0, 0, 0, 0]);

  // one undo step takes the layer away again
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-layer-name]")).toHaveText(["Layer 1"]);
});

test("texture editor: the move tool shifts the layer by drag and arrow keys, cutting off at the edge", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Resources", { exact: true }).click();
  await page.getByRole("button", { name: "New texture" }).click();

  const canvases = page.locator("canvas");
  let box = null;
  for (let i = 0; i < await canvases.count(); i++) { const b = await canvases.nth(i).boundingBox(); if (b && b.width > 200) { box = b; break; } }
  const cell = box!.width / 16;
  const at = (x: number, y: number) => [box!.x + cell * (x + 0.5), box!.y + cell * (y + 0.5)] as const;
  await page.mouse.click(...at(2, 2));
  await page.mouse.click(...at(15, 15));

  const alphaAt = (x: number, y: number) => page.evaluate(([px, py]) => {
    const layer = [...document.querySelectorAll("canvas")].find((c) => c.style.display === "none")!;
    return layer.getContext("2d")!.getImageData(px, py, 1, 1).data[3];
  }, [x, y]);
  await expect.poll(() => alphaAt(2, 2)).toBe(255);

  await page.getByTitle(/^Move the image/).click();
  await page.mouse.move(...at(5, 5));
  await page.mouse.down();
  await page.mouse.move(...at(8, 9), { steps: 5 });
  await page.mouse.up();
  expect(await alphaAt(2, 2)).toBe(0);
  expect(await alphaAt(5, 6)).toBe(255);
  // (15,15) went past the edge — gone

  await page.keyboard.press("ArrowLeft");
  expect(await alphaAt(4, 6)).toBe(255);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect.poll(() => alphaAt(2, 2)).toBe(255);
  expect(await alphaAt(15, 15)).toBe(255);
});

test("texture editor: rotate only the active layer 90° right and left", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Resources", { exact: true }).click();
  await page.getByRole("button", { name: "New texture" }).click();

  const canvases = page.locator("canvas");
  let box = null;
  for (let i = 0; i < await canvases.count(); i++) { const b = await canvases.nth(i).boundingBox(); if (b && b.width > 200) { box = b; break; } }
  const cell = box!.width / 16;
  await page.mouse.click(box!.x + cell * 0.5, box!.y + cell * 0.5); // pixel (0,0) on Layer 1
  await page.getByTitle("Add layer").click();
  await page.mouse.click(box!.x + cell * 1.5, box!.y + cell * 0.5); // pixel (1,0) on Layer 2 (active)

  const alphaAt = (layerIdx: number, x: number, y: number) => page.evaluate(([i, px, py]) => {
    const layer = [...document.querySelectorAll("canvas")].filter((c) => c.style.display === "none")[i];
    return layer.getContext("2d")!.getImageData(px, py, 1, 1).data[3];
  }, [layerIdx, x, y]);
  await expect.poll(() => alphaAt(1, 1, 0)).toBe(255);

  await page.getByTitle("Rotate the active layer 90° right").click();
  // (1,0) → (15,1); Layer 1 stays as it was
  await expect.poll(() => alphaAt(1, 15, 1)).toBe(255);
  expect(await alphaAt(1, 1, 0)).toBe(0);
  expect(await alphaAt(0, 0, 0)).toBe(255);

  await page.getByTitle("Rotate the active layer 90° left").click();
  await page.getByTitle("Rotate the active layer 90° left").click();
  // two left turns from there = one left from the start: (1,0) → (0,14)
  await expect.poll(() => alphaAt(1, 0, 14)).toBe(255);
  expect(await alphaAt(0, 0, 0)).toBe(255);
});
