import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { seedTextures, seedProject, openEditor } from "../support/seed";
import type { ScreenSpec } from "../../lib/types";

const PNG = path.join(__dirname, "../fixtures/real-textures/mc_button_normal.png");

function screen(): ScreenSpec {
  return { id: "main", width: 320, height: 180, widgets: [] };
}

test("Item Skin Generator: generate, save to Resources, apply to an item", async ({ page }) => {
  // The real backend calls a Hugging Face Space — stub it with a fixed PNG.
  const dataUrl = `data:image/png;base64,${fs.readFileSync(PNG).toString("base64")}`;
  let sent: Record<string, unknown> | null = null;
  await page.route("**/api/skin/generate", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { images: [{ name: "ruby_pickaxe_0.png", dataUrl }, { name: "ruby_pickaxe_1.png", dataUrl }] } });
  });

  await seedTextures(page);
  await seedProject(page, screen());
  await openEditor(page);

  // an item to apply the texture to
  await page.getByTitle("Items", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();

  await page.getByTitle("Item Skin Generator", { exact: true }).click();
  const panel = page.getByTestId("item-skin-generator");
  await expect(panel).toBeVisible();

  await panel.getByPlaceholder("copper sword").fill("ruby pickaxe");
  await panel.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(panel.getByAltText("ruby pickaxe")).toHaveCount(2);
  expect(sent).toMatchObject({ mode: "text", prompt: "ruby pickaxe", count: 4, steps: 30, guidance: 9, seed: 0 });

  // clicking a result opens it enlarged; arrows page through, Escape closes
  await panel.getByTitle("Enlarge").first().click();
  const zoom = page.getByTestId("skin-zoom");
  await expect(zoom).toContainText("1 / 2");
  await page.keyboard.press("ArrowRight");
  await expect(zoom).toContainText("2 / 2");
  await page.keyboard.press("Escape");
  await expect(zoom).toHaveCount(0);

  await panel.getByTitle("Save to Resources").first().click();
  await expect(panel.getByText("custom/ruby_pickaxe.png")).toBeVisible();

  await panel.getByRole("button", { name: "Apply to item" }).first().click();
  await panel.getByRole("button", { name: "New Item" }).click();
  await expect(page.getByText("Applied to New Item")).toBeVisible();

  // the saved texture shows up in the Resources library
  await page.getByTitle("Resources", { exact: true }).click();
  await expect(page.getByTestId("resources-panel").locator('[data-texture-key="custom/ruby_pickaxe.png"]')).toBeVisible();
});

test("Item Skin Generator: block textures apply to blocks, player skins open in 3D", async ({ page }) => {
  const dataUrl = `data:image/png;base64,${fs.readFileSync(PNG).toString("base64")}`;
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/skin/generate", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ json: { images: [{ name: "x_0.png", dataUrl }] } });
  });
  // keep the backend bar from depending on a real local server
  await page.route("**/api/skin/local", (route) => route.fulfill({
    json: { installed: true, running: true, reachable: true, device: { device: "Test GPU", model: "m", dtype: "float16" }, exitCode: null, logs: [], url: "http://127.0.0.1:7860" },
  }));
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:skin-backend", "local"));

  await seedTextures(page);
  await seedProject(page, screen());
  await openEditor(page);

  await page.getByTitle("Blocks", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();

  await page.getByTitle("Item Skin Generator", { exact: true }).click();
  const panel = page.getByTestId("item-skin-generator");

  await panel.getByRole("button", { name: "Block", exact: true }).click();
  await panel.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(panel.getByRole("img", { name: "mossy stone bricks" })).toHaveCount(1);
  expect(sent[0]).toMatchObject({ backend: "local", mode: "block", prompt: "mossy stone bricks", engine: "item", tileable: true });

  await panel.getByRole("button", { name: "Apply to block" }).click();
  await panel.getByRole("button", { name: "New Block" }).click();
  await expect(page.getByText("Applied to New Block")).toBeVisible();

  await panel.getByRole("button", { name: "Player skin", exact: true }).click();
  await panel.getByRole("button", { name: "Generate", exact: true }).click();
  expect(sent[1]).toMatchObject({ mode: "player", prompt: "a knight in golden armor", count: 2 });
  await panel.getByAltText("a knight in golden armor").click();
  await expect(page.getByTestId("skin-zoom")).toContainText("64×64 skin");
  await expect(page.getByTestId("player-skin-3d")).toBeVisible();
});
