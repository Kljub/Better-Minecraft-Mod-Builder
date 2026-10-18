import { describe, it, expect } from "vitest";
import fs from "node:fs";
import JSZip from "jszip";
import { SOUND } from "@/lib/elements/soundKind";
import { writeElementFiles } from "@/lib/elements/export";

const spec = (id: string, extra: Record<string, unknown> = {}) => ({
  id, ...SOUND.defaults(), name: id, sound: { file: `abc/${id}.ogg`, source: `${id}.mp3`, duration: 2, mono: true }, ...extra,
});

describe("sounds", () => {
  it("exports the .ogg, one merged sounds.json, subtitles and the runtime manifest", async () => {
    const zip = new JSZip();
    writeElementFiles(zip, "", { sound: [spec("beep", { subtitle: "Robot beeps", volume: 0.5 }), spec("song", { stream: true, attenuation: 64 })] }, {
      modId: "mymod", mcVersion: "26.2", texture: () => undefined, file: (k) => k as unknown as Blob, // JSZip in Node takes strings
    });
    expect(zip.file("assets/mymod/sounds/beep.ogg")).toBeTruthy();
    const sounds = JSON.parse(await zip.file("assets/mymod/sounds.json")!.async("string"));
    expect(sounds.beep).toEqual({ sounds: [{ name: "mymod:beep", volume: 0.5 }], subtitle: "subtitles.mymod.beep" });
    expect(sounds.song).toEqual({ sounds: [{ name: "mymod:song", attenuation_distance: 64, stream: true }] });
    const lang = JSON.parse(await zip.file("assets/mymod/lang/en_us.json")!.async("string"));
    expect(lang["subtitles.mymod.beep"]).toBe("Robot beeps");
    const manifest = JSON.parse(await zip.file("assets/mymod/screenspec/elements/sounds.json")!.async("string"));
    expect(manifest).toEqual([{ id: "beep", category: "neutral", range: 16 }, { id: "song", category: "neutral", range: 64 }]);
    const java = fs.readFileSync("../neoforge-runtime/src/main/java/sheepfromheaven/screenspec/runtime/sound/SoundSpec.java", "utf8");
    for (const key of Object.keys(manifest[0])) expect(java).toMatch(new RegExp(`public \\w+ ${key}\\b`));
  });

  it("asks for a file and for streaming long sounds", () => {
    expect(SOUND.validate!({ id: "x", ...SOUND.defaults() } as never, { modId: "m", mcVersion: "26.2" } as never)).toContain("Upload a sound file.");
    const long = spec("long", { sound: { file: "a/b.ogg", source: "b.mkv", duration: 30, mono: false } });
    expect(SOUND.validate!(long as never, { modId: "m", mcVersion: "26.2" } as never).join(" ")).toMatch(/Stream from disk/);
  });
});
