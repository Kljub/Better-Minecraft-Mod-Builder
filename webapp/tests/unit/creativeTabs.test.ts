import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { resolveInput, writeGeneratedFiles } from "@/lib/exportBundle";
import { ITEM_DEFAULT } from "@/lib/itemRegistry";

describe("creative tabs export", () => {
  it("writes the tab manifest and a hidden icon item for a tab with an icon image", async () => {
    const zip = new JSZip();
    const r = resolveInput({
      screens: [],
      items: [{ ...ITEM_DEFAULT, id: "ruby_sword", texture: "", creativeTab: "weapons", extraCreativeTabs: ["COMBAT"] }],
      creativeTabs: [{ id: "weapons", displayName: "Waffen", icon: "item/ruby.png" }, { id: "misc", displayName: "Misc" }],
    });
    writeGeneratedFiles(zip, "", "mymod", r, { "pack:item/ruby.png": new Uint8Array([1]) as unknown as Blob });
    expect(JSON.parse(await zip.file("assets/mymod/screenspec/creative_tabs.json")!.async("string"))).toEqual([
      { id: "weapons", displayName: "Waffen", icon: true },
      { id: "misc", displayName: "Misc", icon: false },
    ]);
    expect(zip.file("assets/mymod/textures/item/weapons_tab_icon.png")).toBeTruthy();
    expect(JSON.parse(await zip.file("assets/mymod/models/item/weapons_tab_icon.json")!.async("string")).textures.layer0).toBe("mymod:item/weapons_tab_icon");
    expect(zip.file("assets/mymod/items/weapons_tab_icon.json")).toBeTruthy();
    const items = JSON.parse(await zip.file("assets/mymod/screenspec/items.json")!.async("string"));
    expect(items[0].extraCreativeTabs).toEqual(["COMBAT"]);
  });
});
