import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Codex Chat: a generated picture goes to Resources → KI only after Add", async ({ page }) => {
  const png = new PNG({ width: 16, height: 16 });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 200; png.data[i + 3] = 255; }
  const dataUrl = `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
  // A conversation where the AI proposed two pictures (as lib/ai/chatStore keeps it per tab).
  await page.addInitScript((url) => sessionStorage.setItem("mc-ui-builder:codex-chat", JSON.stringify([
    { role: "user", text: "Zeichne einen Rubin" },
    { role: "assistant", text: "Hier sind zwei Rubin-Texturen.", images: [
      { id: "a", name: "ruby.png", dataUrl: url, status: "pending" },
      { id: "b", name: "ruby_2.png", dataUrl: url, status: "pending" },
    ] },
  ])), dataUrl);
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: false, model: "" }, codex: { enabled: true, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "codex",
  })));
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByRole("button", { name: "Codex Chat" }).click();
  const images = page.getByTestId("codex-chat-images");
  await expect(images.getByRole("img")).toHaveCount(2);

  // Nothing is in Resources yet.
  await page.getByTitle("Resources", { exact: true }).click();
  await expect(page.locator('[data-folder="folder:KI"]')).toHaveCount(0);

  await images.getByRole("button", { name: "Add" }).first().click();
  await expect(images).toContainText("In Resources · KI");
  await images.getByTitle("Discard").click();
  await expect(images).toContainText("Discarded");

  const folder = page.locator('[data-folder="folder:KI"]');
  await expect(folder).toContainText("1");
  await folder.click();
  await expect(page.getByTestId("resources-panel")).toContainText("ruby");
});
