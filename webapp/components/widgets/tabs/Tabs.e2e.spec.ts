import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../../../tests/support/seed";
import type { ScreenSpec } from "../../../lib/types";

/**
 * Regression coverage for two bugs caused by the same root issue: clicking
 * an inactive tab in edit mode called onUpdateWidgets with only the tab
 * children, which replaced the ENTIRE screen.widgets array and silently
 * deleted every other widget on the screen. Fixed by merging updated
 * widgets back into the full array by id (see page.tsx onUpdateWidgets).
 */

/**
 * Clicks the center of `locator` via raw mouse events instead of
 * locator.click(). The tab header's decorative border-image overlay sits in
 * the same stacking context as the clickable wrapper without fully covering
 * it edge-to-edge at every sub-pixel, which trips Playwright's stricter
 * box-sampling actionability check even though a real click at that point
 * (verified via elementFromPoint) correctly reaches the wrapper's handler.
 */
async function clickAt(page: import("@playwright/test").Page, locator: ReturnType<import("@playwright/test").Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("locator not found for clickAt");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

function screenWithTabs(): ScreenSpec {
  return {
    id: "main",
    width: 320,
    height: 180,
    widgets: [
      { id: "tabs_1", type: "tabs", x: 8, y: 8, w: 176, h: 150, text: "", icon: null, props: { tab_height: "20" } },
      { id: "tab_a", type: "tab", x: 0, y: 0, w: 0, h: 0, text: "First", icon: null, props: {}, parentId: "tabs_1" },
      { id: "tab_b", type: "tab", x: 0, y: 0, w: 0, h: 0, text: "Second", icon: null, props: {}, parentId: "tabs_1" },
      // A sibling widget outside the tabs container — must survive clicking a tab.
      { id: "sentinel_button", type: "button", x: 8, y: 170, w: 40, h: 16, text: "Sentinel", icon: null, props: {} },
    ],
  };
}

test("clicking an inactive tab does not delete sibling widgets", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, screenWithTabs());
  await openEditor(page);

  // Sentinel must be present before any interaction.
  await expect(page.locator('[data-widget-id="sentinel_button"]')).toHaveCount(1);

  // Click the second (inactive) tab header — this is the click that used to wipe the screen.
  await clickAt(page, page.getByText("Second", { exact: true }));

  // Sentinel and both tabs must still exist.
  await expect(page.locator('[data-widget-id="sentinel_button"]')).toHaveCount(1);
  await expect(page.getByText("First", { exact: true })).toBeVisible();
  await expect(page.getByText("Second", { exact: true })).toBeVisible();
});

test("inactive tab stays visible (not covered by the content panel)", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, screenWithTabs());
  await openEditor(page);

  // Both tab headers should be visible simultaneously — one active, one not.
  await expect(page.getByText("First", { exact: true })).toBeVisible();
  await expect(page.getByText("Second", { exact: true })).toBeVisible();

  await clickAt(page, page.getByText("Second", { exact: true }));

  // After switching, the previously-active tab must still be visible (not
  // hidden behind the content panel's z-index).
  await expect(page.getByText("First", { exact: true })).toBeVisible();
  await expect(page.getByText("Second", { exact: true })).toBeVisible();
});

test("right-click 'Add widget' inside a tab pane adds the widget to the active tab only", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, screenWithTabs());
  await openEditor(page);

  await clickAt(page, page.getByText("Second", { exact: true }));

  // Right-click inside the content pane (below the 20px tab header).
  const tabsBox = await page.locator('[data-widget-id="tabs_1"]').first().boundingBox();
  if (!tabsBox) throw new Error("tabs_1 not found");
  await page.mouse.click(tabsBox.x + tabsBox.width / 2, tabsBox.y + tabsBox.height * 0.75, { button: "right" });
  await page.getByRole("menuitem", { name: "Button", exact: true }).click();

  const added = page.locator('[data-widget-id="button_1"]');
  await expect(added).toHaveCount(1);

  // It belongs to "Second" — switching to "First" must show an empty pane.
  await clickAt(page, page.getByText("First", { exact: true }));
  await expect(added).toHaveCount(0);
  await clickAt(page, page.getByText("Second", { exact: true }));
  await expect(added).toHaveCount(1);
});

test("dragging a root widget onto a tab pane moves it into the active tab", async ({ page }) => {
  const screen = screenWithTabs();
  // A root-level widget sitting over the pane (as older projects have it) — shows on every tab.
  screen.widgets.push({ id: "floating_label", type: "label", x: 20, y: 40, w: 40, h: 12, text: "Floating", icon: null, props: {} });
  await seedTextures(page);
  await seedProject(page, screen);
  await openEditor(page);

  const label = page.locator('[data-widget-id="floating_label"]');
  const box = await label.boundingBox();
  if (!box) throw new Error("floating_label not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();

  // Now it belongs to "First": hidden on "Second", back on "First".
  await clickAt(page, page.getByText("Second", { exact: true }));
  await expect(label).toHaveCount(0);
  await clickAt(page, page.getByText("First", { exact: true }));
  await expect(label).toHaveCount(1);
});
