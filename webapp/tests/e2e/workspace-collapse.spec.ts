import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("All categories: each section collapses and expands, and stays that way", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  for (const kind of ["Commands", "Game Rules"]) {
    await page.getByTitle(kind, { exact: true }).click();
    await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  }

  await page.getByTitle("All categories", { exact: true }).click();
  const overview = page.getByTestId("workspace-overview");
  await expect(overview.getByText("command_1")).toBeVisible();
  await overview.getByRole("button", { name: /^Commands \(1\)$/ }).click();
  await expect(overview.getByText("command_1")).toBeHidden();
  await expect(overview.getByRole("button", { name: /^Commands \(1\)$/ })).toHaveAttribute("aria-expanded", "false");
  // Other sections untouched.
  await expect(overview.locator('[data-testid^="workspace-section-"] button[aria-expanded="true"]').first()).toBeVisible();

  // Remembered after leaving and coming back.
  await page.getByTitle("Commands", { exact: true }).click();
  await page.getByTitle("All categories", { exact: true }).click();
  await expect(overview.getByText("command_1")).toBeHidden();

  // Searching shows hits even in collapsed sections.
  await overview.getByPlaceholder("Search elements…").fill("command");
  await expect(overview.getByText("command_1")).toBeVisible();
  await overview.getByPlaceholder("Search elements…").fill("");

  await overview.getByRole("button", { name: "Collapse all" }).click();
  await expect(overview.locator('button[aria-expanded="true"]')).toHaveCount(0);
  await overview.getByRole("button", { name: "Expand all" }).click();
  await expect(overview.locator('button[aria-expanded="false"]')).toHaveCount(0);
  await expect(overview.getByText("command_1")).toBeVisible();
});
