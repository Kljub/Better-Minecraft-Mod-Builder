import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";
import { sampleStructure } from "../support/nbtWriter";

test("rail lists the new element kinds alphabetically with Settings last", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  const rail = page.getByRole("navigation", { name: "Workspace sections" });
  for (const title of ["Commands", "Game Rules", "Fluids", "Village Professions", "Plants", "Particles", "Key Bindings",
    "Special Entities", "Projectiles", "Armor Trims", "Structures"]) {
    await expect(rail.getByTitle(title, { exact: true })).toBeVisible();
  }
  const titles = await rail.locator("button").evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  expect(titles[1]).toBe("All categories");
  expect(titles.at(-1)).toBe("Settings");
  const sorted = titles.slice(2, -1);
  expect(sorted).toEqual([...sorted].sort((a, b) => (a ?? "").localeCompare(b ?? "")));
});

test("upload a structure .nbt and inspect its size and blocks", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  await page.getByTitle("Structures", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const editor = page.getByTestId("element-editor");
  await expect(editor.getByRole("alert")).toContainText("Upload the structure");

  await editor.locator('[data-field="structure"] input[type="file"]').setInputFiles({
    name: "tower.nbt", mimeType: "application/octet-stream", buffer: sampleStructure(3, 2, 3),
  });
  await expect(editor.getByText("3 × 2 × 3")).toBeVisible();
  await expect(editor.locator("canvas")).toBeVisible();
  await editor.getByText(/18 blocks · 3 block types/).click();
  await expect(editor.getByText("oak_slab")).toBeVisible();
  await expect(page.getByText("data/mymod/structure/structure_1.nbt")).toBeVisible();
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/structure.png` : "test-results/structure.png" });

  // Remount (seedProject re-seeds on every page load, so no reload): the viewer re-reads the
  // file from IndexedDB by its key, not from the project JSON.
  await page.getByTitle("Commands", { exact: true }).click();
  await page.getByTitle("Structures", { exact: true }).click();
  await page.getByTestId("category-view").getByText("structure_1").click();
  await expect(page.getByTestId("element-editor").getByText("3 × 2 × 3")).toBeVisible();
});
