import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Pack textures the user didn't upload are raw.githubusercontent.com URLs (TextureContext's GitHub
 * catalog). An <img> loaded from there WITHOUT crossOrigin taints every canvas it's drawn on, and
 * saving that canvas then fails ("Tainted canvases may not be exported"). So every `new Image()`
 * must set crossOrigin before its src.
 */
const SKIP = new Set(["components/AiBuilderPanel.tsx", "components/EntityModelGeneratorPanel.tsx"]); // data:/blob: only

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("canvas images", () => {
  it("set crossOrigin so canvases with GitHub textures stay exportable", () => {
    const offenders = ["components", "lib", "app"].flatMap(files).filter((f) => !SKIP.has(f)).flatMap((f) => {
      const lines = readFileSync(f, "utf8").split("\n");
      return lines.flatMap((l, i) => (/const img = new Image\(\)/.test(l) && !/crossOrigin/.test(lines.slice(i, i + 3).join("\n")) ? [`${f}:${i + 1}`] : []));
    });
    expect(offenders).toEqual([]);
  });
});
