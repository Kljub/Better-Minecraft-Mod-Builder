import { describe, it, expect } from "vitest";
import { readStructure, readNbt } from "@/lib/nbt";
import { sampleStructure, writeNbt, nbt } from "../support/nbtWriter";

describe("NBT structure reader", () => {
  it("reads size, palette, block states and counts from a gzipped template", async () => {
    const info = await readStructure(sampleStructure(3, 2, 3));
    expect(info.size).toEqual([3, 2, 3]);
    expect(info.dataVersion).toBe(4903);
    expect(info.palette[2]).toEqual({ name: "minecraft:oak_slab", properties: { type: "bottom", waterlogged: "false" } });
    expect(info.blocks).toHaveLength(18);
    expect(info.counts).toEqual({ "minecraft:stone": 9, "minecraft:oak_planks": 8, "minecraft:oak_slab": 1 });
    expect(info.solidCount).toBe(18);
  });

  it("skips air and out-of-range palette indices, and rejects non-structure NBT", async () => {
    const file = writeNbt(nbt.obj({
      size: nbt.ints(1, 1, 2),
      palette: nbt.list([nbt.obj({ Name: nbt.str("minecraft:air") })]),
      blocks: nbt.list([
        nbt.obj({ pos: nbt.ints(0, 0, 0), state: nbt.int(0) }),
        nbt.obj({ pos: nbt.ints(0, 0, 1), state: nbt.int(7) }),
      ]),
    }));
    const info = await readStructure(file);
    expect(info.blocks).toHaveLength(1);
    expect(info.solidCount).toBe(0);
    await expect(readStructure(writeNbt(nbt.obj({ foo: nbt.int(1) })))).rejects.toThrow(/size/);
    await expect(readNbt(new Uint8Array([10, 0, 0, 3]))).rejects.toThrow(/end of data/);
  });
});
