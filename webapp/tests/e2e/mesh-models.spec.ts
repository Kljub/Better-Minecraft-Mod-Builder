import { test, expect, type Page } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";
import { riggedGlb } from "../support/glbWriter";

/** Binary STL of two stacked unit boxes (Z-up like a 3D-print file): a body and a "head". */
function towerStl(): Buffer {
  const quads: number[][][] = [];
  for (const z0 of [0, 1]) {
    const v = (x: number, y: number, z: number) => [x, y, z + z0];
    quads.push(
      [v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)], [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
      [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)], [v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)],
      [v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)], [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)],
    );
  }
  const tris = quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.flat().forEach((n, k) => buf.writeFloatLE(n, 84 + i * 50 + 12 + k * 4)));
  return buf;
}

async function newMeshModel(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: false, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Mesh Models", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  return page.getByTestId("element-editor");
}

test("a rigged GLB becomes a mob: the file's bones, parts and animation, exported as OBJ", async ({ page }) => {
  const editor = await newMeshModel(page);
  await expect(editor.getByRole("alert")).toContainText("Upload a 3D model");
  await editor.getByLabel("Mesh file").setInputFiles({ name: "tower.glb", mimeType: "model/gltf-binary", buffer: riggedGlb() });
  const stats = editor.getByTestId("mesh-stats");
  await expect(stats).toContainText("24 triangles");
  await expect(stats).toContainText("2 bones · 2 parts");
  await expect(editor.getByTestId("mesh-rig").getByRole("button", { name: "From the file" })).toHaveClass(/bg-primary/);
  await expect(editor.getByLabel("Preview animation").locator("option")).toHaveText(["Rest pose", "wave"]);
  await editor.getByLabel("Preview animation").selectOption("wave");
  await expect(editor.getByTestId("mesh-viewer").locator("canvas")).toBeVisible();

  for (const path of ["assets/mymod/models/mesh/mesh_1/arm.obj", "assets/mymod/models/mesh/mesh_1/body.json", "assets/mymod/items/mesh/mesh_1/arm.json",
    "assets/mymod/models/mesh/mesh_1/mesh.mtl", "assets/mymod/textures/block/mesh/mesh_1/white.png", "assets/mymod/screenspec/elements/entities.json"]) {
    await expect(page.getByText(path, { exact: true })).toBeVisible();
  }
  await page.getByText("assets/mymod/models/mesh/mesh_1/arm.json", { exact: true }).click();
  await expect(page.getByText(/"loader": "neoforge:obj"/)).toBeVisible();
  await expect(editor.getByRole("alert")).toHaveCount(0);
});

test("an STL without bones: Claude sets them, then animates them", async ({ page }) => {
  const calls: { task: string; images?: { label: string }[]; context: Record<string, unknown> }[] = [];
  await page.route("**/api/ai/generate", async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.task === "rig") {
      await route.fulfill({ json: { bones: [
        { name: "body", parent: "", pivot: [0, 0, 0], region: { from: [-8, 0, -8], size: [16, 16, 16] } },
        { name: "head", parent: "body", pivot: [0, 16, 0], region: { from: [-8, 16.5, -8], size: [16, 15.5, 16] } },
      ] } });
    } else {
      await route.fulfill({ json: { name: "x", length: 1, loop: "loop", channels: [
        { bone: "head", channel: "rotation", keyframes: [{ t: 0, x: 0, y: 0, z: 0, i: "linear" }, { t: 0.5, x: 0, y: 30, z: 0, i: "linear" }, { t: 1, x: 0, y: 0, z: 0, i: "linear" }] },
      ] } });
    }
  });
  const editor = await newMeshModel(page);
  await editor.getByLabel("Mesh file").setInputFiles({ name: "tower.stl", mimeType: "model/stl", buffer: towerStl() });
  await expect(editor.getByTestId("mesh-stats")).toContainText("1 bones · 1 parts");
  await expect(editor.getByRole("alert")).toContainText("No bones");

  await editor.getByLabel("Rig hint").fill("a stone totem: body with a head on top");
  await editor.getByRole("button", { name: /Set bones with Claude/ }).click();
  await expect(editor.getByTestId("mesh-stats")).toContainText("2 bones · 2 parts");
  const rig = calls.find((c) => c.task === "rig")!;
  expect(rig.images?.map((i) => i.label)).toEqual(["front view", "back view", "right view", "left view", "top view"]);
  expect(rig.context.size).toEqual([16, 32, 16]);

  await editor.getByRole("button", { name: /Animate \(idle, walk, attack\)/ }).click();
  await expect(editor.getByLabel("Preview animation").locator("option")).toHaveText(["Rest pose", "idle", "walk", "attack"]);
  expect(calls.filter((c) => c.task === "animation")).toHaveLength(3);
  await expect(page.getByText("assets/mymod/models/mesh/mesh_1/head.obj", { exact: true })).toBeVisible();
  await expect(editor.getByRole("alert")).toHaveCount(0);
});

test("as an item or block: one OBJ model with item / blockstate definitions", async ({ page }) => {
  const editor = await newMeshModel(page);
  await editor.getByLabel("Mesh file").setInputFiles({ name: "tower.stl", mimeType: "model/stl", buffer: towerStl() });
  await expect(editor.getByTestId("mesh-stats")).toBeVisible();
  await editor.getByRole("button", { name: "Block", exact: true }).click();
  await expect(page.getByText("assets/mymod/blockstates/mesh_1.json", { exact: true })).toBeVisible();
  await expect(page.getByText("assets/mymod/models/mesh/mesh_1/root.obj", { exact: true })).toBeVisible();
  await expect(page.getByText("assets/mymod/screenspec/elements/mesh_models.json", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Item", exact: true }).click();
  await expect(page.getByText("assets/mymod/items/mesh_1.json", { exact: true })).toBeVisible();
  await expect(page.getByText("assets/mymod/blockstates/mesh_1.json", { exact: true })).toHaveCount(0);
});
