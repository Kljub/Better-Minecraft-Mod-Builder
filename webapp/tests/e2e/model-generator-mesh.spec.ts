import { test, expect, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { seedTextures, seedProject, openEditor } from "../support/seed";

/** Binary STL of an axis-aligned box: 12 triangles, a quad's two triangles back to back. */
function boxStl(w: number, d: number, h: number): Buffer {
  const v = (x: number, y: number, z: number) => [x * w, y * d, z * h];
  const quads = [
    [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0)], [v(0, 0, 1), v(0, 1, 1), v(1, 1, 1), v(1, 0, 1)],
    [v(0, 0, 0), v(0, 0, 1), v(1, 0, 1), v(1, 0, 0)], [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(0, 1, 0), v(0, 1, 1), v(0, 0, 1)], [v(1, 0, 0), v(1, 0, 1), v(1, 1, 1), v(1, 1, 0)],
  ];
  const tris = quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.flat().forEach((n, k) => buf.writeFloatLE(n, 84 + i * 50 + 12 + k * 4)));
  return buf;
}

async function open(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: false, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Entity Model Generator", { exact: true }).click();
  return page.getByTestId("model-generator");
}

const png = () => { const p = new PNG({ width: 8, height: 8 }); p.data.fill(200); return PNG.sync.write(p); };

test("several reference images, each labelled with its view", async ({ page }) => {
  let sent: { images?: { data: string; view: string }[] } = {};
  await page.route("**/api/ai/agent", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ body: `${JSON.stringify({ type: "done", ok: true, text: "Done." })}\n`, contentType: "application/x-ndjson" });
  });
  const panel = await open(page);
  await panel.getByLabel("Reference image file").setInputFiles([
    { name: "wolf_front.png", mimeType: "image/png", buffer: png() },
    { name: "wolf_seite.png", mimeType: "image/png", buffer: png() },
    { name: "wolf3.png", mimeType: "image/png", buffer: png() },
  ]);
  await expect(panel.getByTestId("reference-image-tile")).toHaveCount(3);
  await panel.getByLabel("View of wolf3.png").selectOption("back");
  await panel.getByRole("button", { name: /Generate with/ }).click();
  await expect(panel).toContainText("Done.");
  expect(sent.images?.map((i) => i.view)).toEqual(["front", "side", "back"]);
});

test("an STL becomes voxel boxes + renders, and a mob without AI", async ({ page }) => {
  let sent: { context?: { referenceModel?: { kind?: string; summary: string } }; images?: { view: string; data: string }[] } = {};
  await page.route("**/api/ai/agent", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ body: `${JSON.stringify({ type: "done", ok: true, text: "Done." })}\n`, contentType: "application/x-ndjson" });
  });
  const panel = await open(page);
  // Z-up like a 3D-print file: 1×1 footprint, 2 tall.
  await panel.getByLabel("Reference model file").setInputFiles({ name: "pillar.stl", mimeType: "model/stl", buffer: boxStl(1, 1, 2) });
  const meshRow = panel.getByTestId("reference-model");
  await expect(meshRow).toContainText("12 triangles · 16×32×16 px · 1 voxel boxes");
  await expect(panel.getByTestId("stl-note")).toHaveText("STL: all quads");
  await expect(panel.getByTestId("reference-mesh").getByRole("img")).toHaveCount(5);

  await panel.getByRole("button", { name: /Generate with/ }).click();
  await expect(panel).toContainText("Done.");
  expect(sent.context?.referenceModel?.kind).toBe("mesh");
  expect(JSON.parse(sent.context!.referenceModel!.summary).boxes).toEqual([{ from: [-8, 0, -8], size: [16, 32, 16] }]);
  expect(sent.images?.map((i) => i.view)).toEqual(["front", "back", "right", "left", "top"].map((v) => `${v} (render of the uploaded 3D model)`));
  // The front render really shows the pillar: non-background pixels, about twice as tall as wide.
  const shape = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, x1 = 0, y0 = c.height, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (Math.abs(d[(y * c.width + x) * 4] - 0xe8) > 6 || Math.abs(d[(y * c.width + x) * 4 + 2] - 0xee) > 6) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }, sent.images![0].data);
  expect(shape.h / shape.w).toBeGreaterThan(1.8);
  expect(shape.h / shape.w).toBeLessThan(2.2);

  await panel.getByRole("button", { name: /Create mob directly/ }).click();
  await expect(page.getByText(/Created entity model "pillar"/)).toBeVisible();
});

test("an STL with plain triangles is accepted, not refused", async ({ page }) => {
  const panel = await open(page);
  const tri = Buffer.alloc(84 + 50);
  tri.writeUInt32LE(1, 80);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((n, k) => tri.writeFloatLE(n, 84 + 12 + k * 4));
  await panel.getByLabel("Reference model file").setInputFiles({ name: "tri.stl", mimeType: "model/stl", buffer: tri });
  await expect(panel.getByTestId("stl-note")).toHaveText("STL: converted to 1 triangles");
  await expect(panel.getByRole("alert")).toHaveCount(0);
});
