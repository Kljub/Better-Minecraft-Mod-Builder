import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("skin generator seed defaults to -1 (random) and accepts typing -1", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  const sent: number[] = [];
  await page.route("**/api/skin/generate", async (route) => {
    sent.push((route.request().postDataJSON() as { seed: number }).seed);
    await route.fulfill({ json: { images: [] } });
  });
  await openEditor(page);
  await page.getByTitle("Item Skin Generator", { exact: true }).click();

  const seed = page.getByLabel("Seed");
  await expect(seed).toHaveValue("-1");
  const generate = page.getByRole("button", { name: /^Generate/ });
  await generate.click();
  await expect.poll(() => sent.at(-1)).toBe(-1);

  // A fixed seed, then back to -1 by typing it character by character.
  await seed.fill("1234");
  await expect(seed).toHaveValue("1234");
  await seed.fill("");
  await seed.pressSequentially("-1");
  await expect(seed).toHaveValue("-1");
  await seed.blur();
  await expect(seed).toHaveValue("-1");

  // Garbage can't be typed; an empty field falls back to -1 on blur.
  await seed.fill("");
  await seed.pressSequentially("abc");
  await expect(seed).toHaveValue("");
  await seed.blur();
  await expect(seed).toHaveValue("-1");
});
