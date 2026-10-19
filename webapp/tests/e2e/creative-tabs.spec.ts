import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Creative tabs: icon image per tab; items in no tab or in several tabs", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) await decline.click();

  await page.getByTitle("Creative Tabs", { exact: true }).click();
  page.once("dialog", (d) => d.accept("Waffen"));
  const view = page.getByTestId("category-view");
  await view.getByRole("button", { name: "New" }).first().click();
  await view.getByText("Waffen", { exact: true }).click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByText("Pick texture")).toBeVisible();
  await picker.locator("button[title]").filter({ has: page.locator("img") }).first().click();
  await picker.getByRole("button", { name: /^Select/ }).click();
  await expect(view.locator("img").first()).toBeVisible();

  await page.getByTitle("Items", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const tabs = page.getByTestId("creative-tabs-field");
  await tabs.locator("select").first().selectOption("waffen");
  await tabs.getByLabel("Also show in tab").selectOption("COMBAT");
  await expect(tabs.getByTitle("Remove from Combat")).toBeVisible();
  await tabs.locator("select").first().selectOption("none");
  await expect(tabs.getByLabel("Also show in tab")).toHaveCount(0);
  await expect(tabs.getByTitle("Remove from Combat")).toHaveCount(0);
});
