import { describe, expect, it } from "vitest";
import { expandStructure, normalizeBlockState, structureId, validateAiStructure } from "../../lib/structureAi";

const at = (blocks: number[], x: number, y: number, z: number) => {
  for (let i = 0; i < blocks.length; i += 4) if (blocks[i] === x && blocks[i + 1] === y && blocks[i + 2] === z) return blocks[i + 3];
  return -1;
};

describe("structure AI", () => {
  it("normalizes block states and rejects junk", () => {
    expect(normalizeBlockState("oak_planks")).toBe("minecraft:oak_planks");
    expect(normalizeBlockState("minecraft:oak_stairs[facing=east, half=bottom]")).toBe("minecraft:oak_stairs[facing=east,half=bottom]");
    expect(normalizeBlockState("create:shaft[axis=y]")).toBe("create:shaft[axis=y]");
    expect(normalizeBlockState("chest{Items:[]}")).toBeNull();
    expect(normalizeBlockState("stone; /op me")).toBeNull();
  });

  it("expands fill / hollow / walls / set in order and clamps to the size", () => {
    const ai = validateAiStructure({
      name: "Tiny Hut!", description: "x", size: [5, 4, 5],
      ops: [
        { op: "fill", from: [0, 0, 0], to: [4, 0, 4], block: "cobblestone" },
        { op: "walls", from: [0, 1, 0], to: [4, 2, 4], block: "oak_planks" },
        { op: "set", from: [2, 1, 0], to: [2, 1, 0], block: "minecraft:air" },
        { op: "hollow", from: [0, 3, 0], to: [9, 3, 9], block: "oak_slab" },
        { op: "set", from: [2, 2, 2], to: [0, 0, 0], block: "bad block!" },
      ],
    });
    const s = expandStructure(ai);
    expect(s.name).toBe("tiny_hut");
    expect(s.size).toEqual([5, 4, 5]);
    expect(s.rejected).toEqual(["bad block!"]);
    const pal = (x: number, y: number, z: number) => s.palette[at(s.blocks, x, y, z)];
    expect(pal(2, 0, 2)).toBe("minecraft:cobblestone");
    expect(pal(0, 1, 3)).toBe("minecraft:oak_planks");
    expect(at(s.blocks, 2, 1, 2)).toBe(-1); // walls leave the inside alone
    expect(at(s.blocks, 2, 1, 0)).toBe(-1); // doorway carved
    expect(pal(4, 3, 4)).toBe("minecraft:oak_slab"); // clamped one-layer shell = solid
    expect(new Set(s.palette).size).toBe(s.palette.length);
  });

  it("caps the size at maxSize and refuses empty answers", () => {
    const s = expandStructure(validateAiStructure({ name: "big", description: "", size: [500, 10, 3], ops: [{ op: "fill", from: [0, 0, 0], to: [999, 0, 0], block: "stone" }] }), 32);
    expect(s.size).toEqual([32, 10, 3]);
    expect(s.blocks.length / 4).toBe(32);
    expect(() => validateAiStructure({ name: "x", size: [1, 1, 1], ops: [] })).toThrow();
    expect(structureId("  ")).toBe("structure");
  });
});
