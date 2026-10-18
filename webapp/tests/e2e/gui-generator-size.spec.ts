import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Screen GUI Generator defaults to the designer's 350×200 screen size", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Screen GUI Generator", { exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("350");
  await expect(page.getByLabel("Height", { exact: true })).toHaveValue("200");
  await page.getByRole("button", { name: "Container 176×166" }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("176");
  await page.getByRole("button", { name: "Default 350×200" }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("350");
  await expect(page.getByLabel("Height", { exact: true })).toHaveValue("200");
});
