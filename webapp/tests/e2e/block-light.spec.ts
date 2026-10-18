import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Block light level shows what it's as bright as, and the vanilla picks set it", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, widgets: [] });
  await openEditor(page);

  await page.getByTitle("Blocks", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const light = page.getByTestId("light-level");
  await expect(light).toContainText("No light");

  await light.getByRole("button", { name: "Glowstone 15" }).click();
  await expect(light).toContainText("As bright as: Glowstone");
  await expect(light.getByRole("slider", { name: "Light level" })).toHaveValue("15");

  await light.getByRole("slider", { name: "Light level" }).fill("12");
  await expect(light).toContainText("Close to (13): Furnace (lit)");
  await expect(light).toContainText("Lights 11 blocks around it");
});
