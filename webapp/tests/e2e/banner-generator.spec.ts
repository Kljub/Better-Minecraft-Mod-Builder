import { test, expect } from "@playwright/test";
import { deflateSync } from "zlib";
import { seedTextures, seedProject, openEditor } from "../support/seed";

/** 16×16 RGBA PNG: a dark "skull"-ish square with eye holes on transparent, like an item model emblem. */
function emblemPng(): string {
  const rows: number[] = [];
  for (let y = 0; y < 16; y++) {
    rows.push(0);
    for (let x = 0; x < 16; x++) {
      const inside = x >= 3 && x <= 12 && y >= 3 && y <= 12;
      const eye = (y === 6 || y === 7) && (x === 5 || x === 6 || x === 9 || x === 10);
      rows.push(...(inside && !eye ? [90, 90, 90, 255] : [0, 0, 0, 0]));
    }
  }
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(rows))), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

test("generate a banner pattern from an emblem and create the element", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  const prompts: string[] = [];
  await page.route("**/api/skin/generate", async (route) => {
    prompts.push((route.request().postDataJSON() as { prompt: string }).prompt);
    await route.fulfill({ json: { images: [{ name: "emblem_0", dataUrl: emblemPng() }] } });
  });
  await openEditor(page);
  await page.getByTitle("Item Skin Generator", { exact: true }).click();
  await page.getByRole("button", { name: "Banner pattern", exact: true }).click();

  const gen = page.getByTestId("banner-generator");
  await gen.getByRole("textbox", { name: "Emblem", exact: true }).fill("skull");
  await gen.getByRole("button", { name: "Generate patterns" }).click();
  await expect(gen.getByTestId("banner-result")).toHaveCount(1);
  expect(prompts.at(-1)).toBe("skull emblem");
  if (process.env.SHOT_DIR) await gen.screenshot({ path: `${process.env.SHOT_DIR}/banner-gen.png` });

  await gen.getByRole("button", { name: "Create banner pattern" }).click();
  const editor = page.getByTestId("element-editor");
  await expect(editor).toBeVisible();
  await expect(page.getByText("data/mymod/banner_pattern/skull.json")).toBeVisible();
  await expect(page.getByText("assets/mymod/textures/entity/banner/skull.png")).toBeVisible();
  await expect(page.getByText("assets/mymod/textures/entity/shield/skull.png")).toBeVisible();
  await expect(editor.getByRole("alert")).toHaveCount(0);
});
