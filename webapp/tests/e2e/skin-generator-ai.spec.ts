import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { seedTextures, seedProject, openEditor } from "../support/seed";

const PNG = path.join(__dirname, "../fixtures/real-textures/mc_button_normal.png");

test("Item Skin Generator: the AI describes an uploaded picture, writes one prompt and rates the results", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: false, model: "" }, codex: { enabled: true, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "codex",
  })));
  const dataUrl = `data:image/png;base64,${fs.readFileSync(PNG).toString("base64")}`;
  const skinCalls: { prompt?: string }[] = [];
  await page.route("**/api/skin/generate", async (route) => {
    const body = route.request().postDataJSON();
    skinCalls.push(body);
    await route.fulfill({ json: { images: [{ name: "a.png", dataUrl }, { name: "b.png", dataUrl }] } });
  });
  const aiCalls: { provider?: string; task?: string; prompt?: string; context?: Record<string, unknown>; images?: { label: string }[] }[] = [];
  await page.route("**/api/ai/generate", async (route) => {
    const body = route.request().postDataJSON();
    aiCalls.push(body);
    if (body.task === "skinDescribe") {
      await route.fulfill({ json: { description: "Ein rotes Schwert mit goldenem Griff.", colors: ["#c0392b", "#f1c40f"], prompt: "ruby sword, golden hilt, red blade with a lighter edge" } });
    } else {
      const n = body.context.count as number;
      await route.fulfill({ json: {
        ratings: Array.from({ length: n }, (_, i) => ({ index: i + 1, score: i === 0 ? 8 : 2, verdict: i === 0 ? "good" : "bad", issues: i === 0 ? "sauber" : "verrauscht" })),
        best: 1, summary: "ok",
      } });
    }
  });

  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, widgets: [] });
  await openEditor(page);
  await page.getByTitle("Item Skin Generator", { exact: true }).click();
  const panel = page.getByTestId("item-skin-generator");

  // Upload → Codex describes it and the first prompt lands in the prompt field.
  await panel.getByLabel("Upload picture").setInputFiles(PNG);
  await expect(panel.getByTestId("skin-picture-description")).toContainText("Ein rotes Schwert mit goldenem Griff.");
  await expect(panel.getByPlaceholder("copper sword")).toHaveValue("ruby sword, golden hilt, red blade with a lighter edge");
  expect(aiCalls[0]).toMatchObject({ provider: "codex", task: "skinDescribe", context: { target: "item" } });
  expect(aiCalls[0].images).toHaveLength(1);

  // One prompt with everything; generate, then the quality check rates the results against the picture.
  await panel.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(panel.getByTestId("skin-quality")).toHaveCount(2);
  expect(skinCalls.map((c) => c.prompt)).toEqual(["ruby sword, golden hilt, red blade with a lighter edge"]);
  const check = aiCalls.find((c) => c.task === "skinQuality")!;
  expect(check.context).toMatchObject({ target: "item", hasReference: true, count: 2 });
  expect(check.images![0].label).toBe("Reference picture");
  expect(check.images).toHaveLength(3);
  await expect(panel.getByTestId("skin-quality").filter({ hasText: "8/10 · good — sauber" })).toHaveCount(1);
  await expect(panel.getByLabel("Best")).toHaveCount(1);

  // Hide the bad ones.
  await panel.getByLabel("Hide bad").check();
  await expect(panel.getByTestId("skin-quality")).toHaveCount(1);
});

test("Item Skin Generator: Ctrl+V pastes a picture for the AI", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: false, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  const aiCalls: { task?: string; images?: unknown[] }[] = [];
  await page.route("**/api/ai/generate", async (route) => {
    aiCalls.push(route.request().postDataJSON());
    await route.fulfill({ json: { description: "Ein Smaragd.", colors: ["#2ecc71"], prompt: "emerald gem" } });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, widgets: [] });
  await openEditor(page);
  await page.getByTitle("Item Skin Generator", { exact: true }).click();
  const panel = page.getByTestId("item-skin-generator");

  const b64 = fs.readFileSync(PNG).toString("base64");
  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "clipboard.png", { type: "image/png" }));
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
  }, b64);
  await expect(panel.getByAltText("Reference picture")).toBeVisible();
  await expect(panel.getByTestId("skin-picture-description")).toContainText("Ein Smaragd.");
  await expect(panel.getByPlaceholder("copper sword")).toHaveValue("emerald gem");
  expect(aiCalls[0]).toMatchObject({ task: "skinDescribe" });
});
