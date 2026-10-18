import { describe, it, expect } from "vitest";
import { colorize, rotate, generate, GENERATORS, TEMPLATE_NAMES, templateUrl } from "@/lib/textureTemplates";

const px = (pixels: number[][], w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(pixels.flat()) });

describe("texture templates", () => {
  it("tints halfway, or takes the colour's hue/saturation with the pixel's brightness when locked", () => {
    expect(Array.from(colorize(px([[100, 100, 100, 255]], 1, 1), "#ff0000", false).data)).toEqual([177, 50, 50, 255]);
    expect(Array.from(colorize(px([[128, 128, 128, 255]], 1, 1), "#ff0000", true).data)).toEqual([128, 0, 0, 255]);
    expect(Array.from(colorize(px([[9, 9, 9, 0]], 1, 1), "#ff0000", false).data)).toEqual([9, 9, 9, 0]); // transparent untouched
  });

  it("rotates clockwise in 90° steps", () => {
    // 2x2: a b / c d  →  90°: c a / d b
    const img = px([[1, 0, 0, 255], [2, 0, 0, 255], [3, 0, 0, 255], [4, 0, 0, 255]], 2, 2);
    const red = (p: { data: Uint8ClampedArray }) => [0, 4, 8, 12].map((i) => p.data[i]);
    expect(red(rotate(img, 90))).toEqual([3, 1, 4, 2]);
    expect(red(rotate(img, 180))).toEqual([4, 3, 2, 1]);
    expect(red(rotate(img, 270))).toEqual([2, 4, 1, 3]);
  });

  it("every generator only uses templates that exist", () => {
    for (const g of GENERATORS) {
      for (let seed = 0; seed < 20; seed++) {
        let s = seed * 9301 + 49297;
        const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
        const layers = generate(g, rand);
        expect(layers).toHaveLength(4);
        for (const l of layers) if (l.template) expect(TEMPLATE_NAMES, `${g}: ${l.template}`).toContain(l.template);
        expect(layers.some((l) => l.template), g).toBe(true);
      }
    }
  });

  it("loads from MCreator's repo at a pinned commit", () => {
    expect(TEMPLATE_NAMES.length).toBeGreaterThan(400);
    expect(templateUrl("Gem template1")).toMatch(/^https:\/\/raw\.githubusercontent\.com\/MCreator\/MCreator\/[0-9a-f]{40}\/.*\/texturemaker\/Gem%20template1\.png$/);
  });
});
