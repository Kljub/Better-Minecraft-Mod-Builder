import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { seedTextures, seedProject, openEditor } from "../support/seed";

const PNG = path.join(__dirname, "../fixtures/real-textures/mc_button_normal.png");

test("Item Skin Generator: the AI describes an uploaded picture, writes prompts and rates the results", async ({ page }) => {
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
      await route.fulfill({ json: { description: "Ein rotes Schwert mit goldenem Griff.", colors: ["#c0392b", "#f1c40f"], prompts: ["ruby sword", "red gold sword"] } });
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
  await expect(panel.getByPlaceholder("copper sword")).toHaveValue("ruby sword");
  expect(aiCalls[0]).toMatchObject({ provider: "codex", task: "skinDescribe", context: { target: "item" } });
  expect(aiCalls[0].images).toHaveLength(1);

  // All prompts are generated, then the quality check rates every result against the picture.
  await panel.getByRole("button", { name: "Generate all 2 prompts" }).click();
  await expect(panel.getByTestId("skin-quality")).toHaveCount(4);
  expect(skinCalls.map((c) => c.prompt)).toEqual(["ruby sword", "red gold sword"]);
  const check = aiCalls.find((c) => c.task === "skinQuality")!;
  expect(check.context).toMatchObject({ target: "item", hasReference: true, count: 4 });
  expect(check.images![0].label).toBe("Reference picture");
  expect(check.images).toHaveLength(5);
  await expect(panel.getByTestId("skin-quality").filter({ hasText: "8/10 · good — sauber" })).toHaveCount(1);
  await expect(panel.getByLabel("Best")).toHaveCount(1);

  // Hide the bad ones.
  await panel.getByLabel("Hide bad").check();
  await expect(panel.getByTestId("skin-quality")).toHaveCount(1);
});
