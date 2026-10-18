import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../../../../tests/support/seed";
import type { ScreenSpec } from "../../../../lib/types";

/** Raw mouse click at the locator's center — see Tabs.e2e.spec.ts's clickAt for why. */
async function clickAt(page: import("@playwright/test").Page, locator: ReturnType<import("@playwright/test").Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("locator not found for clickAt");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

function screenWithSideTabs(side: "left" | "right"): ScreenSpec {
  return {
    id: "main",
    width: 320,
    height: 180,
    widgets: [
      { id: "tabs_1", type: "tabs", x: 8, y: 8, w: 200, h: 150, text: "", icon: null, props: { tab_height: "40", tab_position: side } },
      { id: "tab_a", type: "tab", x: 0, y: 0, w: 0, h: 0, text: "First", icon: null, props: {}, parentId: "tabs_1" },
      { id: "tab_b", type: "tab", x: 0, y: 0, w: 0, h: 0, text: "Second", icon: null, props: {}, parentId: "tabs_1" },
      { id: "tab_c", type: "tab", x: 0, y: 0, w: 0, h: 0, text: "Third", icon: null, props: {}, parentId: "tabs_1" },
      { id: "btn_a", type: "button", x: 8, y: 8, w: 60, h: 20, text: "In First", icon: null, props: {}, parentId: "tab_a" },
    ],
  };
}

for (const side of ["left", "right"] as const) {
  test(`${side} tabs: strip sits on the ${side} edge and switching tabs swaps the pane`, async ({ page }) => {
    await seedTextures(page);
    await seedProject(page, screenWithSideTabs(side));
    await openEditor(page);

    const tabsBox = await page.locator('[data-widget-id="tabs_1"]').first().boundingBox();
    const firstBox = await page.locator('[data-widget-id="tab_a"]').boundingBox();
    const thirdBox = await page.locator('[data-widget-id="tab_c"]').boundingBox();
    if (!tabsBox || !firstBox || !thirdBox) throw new Error("tabs not rendered");

    // Tabs stack vertically along the chosen edge.
    expect(thirdBox.y).toBeGreaterThan(firstBox.y + firstBox.height - 1);
    const firstCenterX = firstBox.x + firstBox.width / 2;
    if (side === "left") expect(firstCenterX).toBeLessThan(tabsBox.x + tabsBox.width / 2);
    else expect(firstCenterX).toBeGreaterThan(tabsBox.x + tabsBox.width / 2);

    // Content sits beside the strip, not under it.
    const btn = page.locator('[data-widget-id="btn_a"]');
    const btnBox = await btn.boundingBox();
    if (!btnBox) throw new Error("btn_a not rendered");
    if (side === "left") expect(btnBox.x).toBeGreaterThan(firstBox.x + firstBox.width - 10);
    else expect(btnBox.x).toBeLessThan(firstBox.x);

    await clickAt(page, page.getByText("Second", { exact: true }));
    await expect(btn).toHaveCount(0);
    await clickAt(page, page.getByText("First", { exact: true }));
    await expect(btn).toHaveCount(1);
  });
}
