import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("model editor: Codex paints the skin from a description", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: true, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  let sent: { provider?: string; task?: string; prompt?: string; context?: { cubes?: { name: string; faces: Record<string, number[]> }[] } } = {};
  await page.route("**/api/ai/generate", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: {
      default_color: "#00ff00", noise: 0,
      parts: [{ name: "body", color: "#0000ff" }],
      faces: [
        { cube: "body", face: "north", color: "#ff0000", ops: [{ x: 0, y: 0, w: 2, h: 1, color: "#ffff00" }, { x: 7, y: 7, w: 5, h: 5, color: "#ffffff" }] },
        { cube: "nope", face: "up", color: "#000000", ops: [] },
      ],
    } });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Entity Models", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  await page.getByRole("tab", { name: "Skin" }).click();
  const ai = page.getByTestId("skin-ai");
  await ai.getByLabel("AI client").selectOption("codex");
  await ai.getByLabel("Skin request").fill("blue blob with a red face");
  await ai.getByRole("button", { name: "Paint with Codex" }).click();
  await expect(page.getByText(/Skin painted: 1 colours, 1 face details \(1 skipped/)).toBeVisible();

  expect(sent.provider).toBe("codex");
  expect(sent.task).toBe("skin");
  expect(sent.context?.cubes?.[0]).toMatchObject({ name: "body", faces: { north: [8, 8], up: [8, 8] } });

  // Box UV of the 8×8×8 cube at [0,0]: north face is (8,8)–(16,16).
  const canvas = page.getByTestId("skin-canvas");
  const px = (x: number, y: number) => canvas.evaluate((c: HTMLCanvasElement, [x, y]) => Array.from(c.getContext("2d")!.getImageData(x, y, 1, 1).data), [x, y] as [number, number]);
  expect(await px(8, 8)).toEqual([255, 255, 0, 255]);
  expect(await px(12, 12)).toEqual([255, 0, 0, 255]);
  expect(await px(15, 15)).toEqual([255, 255, 255, 255]); // clipped to the face
  const top = await px(12, 4);
  expect(top[2]).toBeGreaterThan(top[0] + 100); // up face: shaded blue base colour
  await expect(page.getByTestId("skin-painter")).toContainText("custom/", { timeout: 5000 });
});
