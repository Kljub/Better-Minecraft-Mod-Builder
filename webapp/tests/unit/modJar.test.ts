import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { writeFileSync } from "fs";
import { resolveInput, writeGeneratedFiles } from "@/lib/exportBundle";
import { modIdProblem, modsToml, versionProblem, writeModJarMeta } from "@/lib/modJar";
import { ITEM_DEFAULT } from "@/lib/itemRegistry";
import { BLOCK_DEFAULT } from "@/lib/blockRegistry";
import { ENCHANTMENT } from "@/lib/elements/datapackKinds";

const meta = { modId: "mymod", version: "1.2.0", displayName: "My Mod", authors: "Kljub", description: "Says \"hi\"" };

describe("mod jar", () => {
  it("declares the mod and requires NeoForge, Minecraft and the ScreenSpec runtime", () => {
    const toml = modsToml(meta, "26.2", "0.1.0");
    expect(toml).toContain('modLoader = "javafml"');
    expect(toml).toContain('modId = "mymod"');
    expect(toml).toContain('version = "1.2.0"');
    expect(toml).toContain('authors = "Kljub"');
    expect(toml).toMatch(/modId = "minecraft"\n {4}type = "required"\n {4}versionRange = "\[26\.2,26\.3\)"/);
    expect(toml).toMatch(/modId = "screenspec"\n {4}type = "required"\n {4}versionRange = "\[0\.1\.0,\)"\n {4}ordering = "AFTER"/);
    expect(modsToml(meta, "1.21.1")).toContain('versionRange = "[1.21.1,1.21.2)"');
  });

  it("nests the runtime via Jar-in-Jar metadata", async () => {
    const zip = new JSZip();
    writeModJarMeta(zip, meta, "26.2", { bytes: new Uint8Array([80, 75]), version: "0.1.0", minecraft: "26.2" });
    const md = JSON.parse(await zip.file("META-INF/jarjar/metadata.json")!.async("string"));
    expect(md.jars[0]).toEqual({
      identifier: { group: "sheepfromheaven.screenspec", artifact: "screenspec-neoforge" },
      version: { range: "[0.1.0,)", artifactVersion: "0.1.0" },
      path: "META-INF/jarjar/screenspec-neoforge-0.1.0.jar",
      isObfuscated: false,
    });
    expect(zip.file("META-INF/jarjar/screenspec-neoforge-0.1.0.jar")).toBeTruthy();
    expect(await zip.file("META-INF/MANIFEST.MF")!.async("string")).toContain("Implementation-Version: 1.2.0");
  });

  it("without a runtime jar there is no jarjar folder", () => {
    const zip = new JSZip();
    writeModJarMeta(zip, meta, "1.21.1");
    expect(Object.keys(zip.files).filter((p) => p.includes("jarjar"))).toEqual([]);
  });

  it("rejects mod ids and versions NeoForge would refuse", () => {
    expect(modIdProblem("dungeon_mastery")).toBeNull();
    expect(modIdProblem("Dungeon")).toMatch(/not a valid mod id/);
    expect(modIdProblem("minecraft")).toMatch(/taken/);
    expect(versionProblem("1.0.0")).toBeNull();
    expect(versionProblem("1.0.0-beta.1")).toBeNull();
    expect(versionProblem("v1")).toMatch(/not a valid version/);
  });

  // MOD_JAR_OUT=/path/x.jar writes a sample mod (no runtime inside) for the in-game smoke test.
  it.runIf(!!process.env.MOD_JAR_OUT)("writes a sample mod jar", async () => {
    const zip = new JSZip();
    writeModJarMeta(zip, { ...meta, modId: "jartest" }, "26.2");
    const r = resolveInput({
      items: [{ ...ITEM_DEFAULT, id: "ruby", displayName: "Ruby", texture: "" }],
      blocks: [{ ...BLOCK_DEFAULT, id: "ruby_block", displayName: "Ruby Block", texture: "" }],
      elements: { enchantment: [
        { id: "frost", ...ENCHANTMENT.defaults(), name: "Frost" },
        { id: "zap", ...ENCHANTMENT.defaults(), name: "Zap", exclusiveSet: ["frost", "minecraft:sharpness"] },
      ] },
      modId: "jartest", mcVersion: "26.2",
    });
    writeGeneratedFiles(zip, "", "jartest", r, {});
    writeFileSync(process.env.MOD_JAR_OUT!, await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
  });
});
