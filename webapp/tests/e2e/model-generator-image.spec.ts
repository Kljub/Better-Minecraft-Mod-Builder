import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Entity Model Generator: a reference image goes along with the prompt", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: false, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  let sent: { prompt?: string; images?: { data: string; view: string }[] } = {};
  await page.route("**/api/ai/agent", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ body: `${JSON.stringify({ type: "start", port: 1 })}\n${JSON.stringify({ type: "done", ok: true, text: "Built it." })}\n`, contentType: "application/x-ndjson" });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Entity Model Generator", { exact: true }).click();
  const panel = page.getByTestId("model-generator");

  const png = new PNG({ width: 2000, height: 1000 });
  png.data.fill(180);
  await panel.getByLabel("Reference image file").setInputFiles({ name: "hellhound.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
  await expect(panel.getByAltText("Reference front")).toBeVisible();
  await expect(panel.getByTestId("reference-image")).toContainText("hellhound.png");

  // Image alone is enough to start.
  await panel.getByRole("button", { name: /Generate with/ }).click();
  await expect(panel).toContainText("Built it.");
  expect(sent.prompt).toMatch(/reference image/i);
  expect(sent.images).toHaveLength(1);
  expect(sent.images![0].view).toBe("front");
  expect(sent.images![0].data).toMatch(/^data:image\/png;base64,/);
  // Scaled down to 1024 px on the long side.
  const size = await page.evaluate(async (src) => { const i = new Image(); i.src = src; await i.decode(); return [i.naturalWidth, i.naturalHeight]; }, sent.images![0].data);
  expect(size).toEqual([1024, 512]);
});

test("Entity Model Generator: an existing GeckoLib/Bedrock model as reference", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: false, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  let sent: { prompt?: string; context?: { referenceModel?: { name: string; summary: string } } } = {};
  await page.route("**/api/ai/agent", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ body: `${JSON.stringify({ type: "done", ok: true, text: "Done." })}\n`, contentType: "application/x-ndjson" });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Entity Model Generator", { exact: true }).click();
  const panel = page.getByTestId("model-generator");
  const geo = { format_version: "1.12.0", "minecraft:geometry": [{ description: { identifier: "geometry.crab", texture_width: 64, texture_height: 64 },
    bones: [{ name: "shell", pivot: [0, 4, 0], cubes: [{ origin: [-5, 2, -4], size: [10, 4, 8], uv: [0, 0] }] },
      { name: "claw_left", parent: "shell", pivot: [-6, 4, -4], cubes: [{ origin: [-9, 3, -7], size: [3, 2, 3], uv: [0, 12] }] }] }] };
  await panel.getByLabel("Reference model file").setInputFiles({ name: "crab.geo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(geo)) });
  await expect(panel.getByTestId("reference-model")).toContainText("2 bones · 2 cubes");
  await panel.locator("textarea").fill("make it a giant lava crab");
  await panel.getByRole("button", { name: /Generate with/ }).click();
  await expect(panel).toContainText("Done.");
  expect(sent.prompt).toBe("make it a giant lava crab");
  expect(sent.context?.referenceModel?.name).toBe("crab.geo");
  expect(sent.context?.referenceModel?.summary).toContain("claw_left");
});
