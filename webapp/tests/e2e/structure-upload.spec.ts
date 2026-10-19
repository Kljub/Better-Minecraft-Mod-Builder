import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";
import { sampleStructure } from "../support/nbtWriter";

test("Structures tab: upload several .nbt files at once, one structure each", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await page.getByTitle("Structures", { exact: true }).click();
  const view = page.getByTestId("category-view");
  await expect(view.getByRole("button", { name: "Upload .nbt" })).toBeVisible();

  await view.getByTestId("category-file-upload").setInputFiles([
    { name: "Tower.nbt", mimeType: "application/octet-stream", buffer: sampleStructure(3, 2, 3) },
    { name: "small hut.nbt", mimeType: "application/octet-stream", buffer: sampleStructure(2, 2, 2) },
    { name: "broken.nbt", mimeType: "application/octet-stream", buffer: Buffer.from("not nbt") },
  ]);
  await expect(page.getByText("Added 2 structures.")).toBeVisible();
  await expect(page.getByText(/broken\.nbt/)).toBeVisible();
  await expect(view.getByText("tower", { exact: true })).toBeVisible();
  await expect(view.getByText("small_hut", { exact: true })).toBeVisible();

  await view.getByText("Tower", { exact: true }).click();
  const editor = page.getByTestId("element-editor");
  await expect(editor.getByText("tower.nbt").or(editor.getByText("Tower.nbt"))).toBeVisible();
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("data/mymod/structure/tower.nbt")).toBeVisible();
});
