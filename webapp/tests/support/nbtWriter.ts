import { gzipSync } from "zlib";

/** Tiny NBT encoder for tests — builds structure-template files without shipping game data. */
type Tag =
  | { t: "int"; v: number } | { t: "string"; v: string } | { t: "list"; of: number; v: Tag[] } | { t: "compound"; v: Record<string, Tag> };

const ID = { int: 3, string: 8, list: 9, compound: 10 } as const;

function enc(tag: Tag, out: number[]) {
  const u16 = (n: number) => out.push((n >> 8) & 0xff, n & 0xff);
  const i32 = (n: number) => out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  const str = (s: string) => { const b = Buffer.from(s, "utf8"); u16(b.length); out.push(...b); };
  switch (tag.t) {
    case "int": i32(tag.v); break;
    case "string": str(tag.v); break;
    case "list": out.push(tag.of); i32(tag.v.length); tag.v.forEach((x) => enc(x, out)); break;
    case "compound":
      for (const [k, v] of Object.entries(tag.v)) { out.push(ID[v.t]); str(k); enc(v, out); }
      out.push(0);
      break;
  }
}

export const nbt = {
  int: (v: number): Tag => ({ t: "int", v }),
  str: (v: string): Tag => ({ t: "string", v }),
  ints: (...v: number[]): Tag => ({ t: "list", of: ID.int, v: v.map((x) => ({ t: "int", v: x })) }),
  list: (v: Tag[]): Tag => ({ t: "list", of: ID.compound, v }),
  obj: (v: Record<string, Tag>): Tag => ({ t: "compound", v }),
};

export function writeNbt(root: Tag): Buffer {
  const out: number[] = [ID.compound, 0, 0]; // root compound, empty name
  enc(root, out);
  return gzipSync(Buffer.from(out));
}

/** A w×h×d structure: stone floor, oak planks on top, one slab. */
export function sampleStructure(w = 3, h = 2, d = 3): Buffer {
  const blocks = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) {
    blocks.push(nbt.obj({ pos: nbt.ints(x, y, z), state: nbt.int(y === 0 ? 0 : x === 0 && z === 0 ? 2 : 1) }));
  }
  return writeNbt(nbt.obj({
    DataVersion: nbt.int(4903),
    size: nbt.ints(w, h, d),
    palette: nbt.list([
      nbt.obj({ Name: nbt.str("minecraft:stone") }),
      nbt.obj({ Name: nbt.str("minecraft:oak_planks") }),
      nbt.obj({ Name: nbt.str("minecraft:oak_slab"), Properties: nbt.obj({ type: nbt.str("bottom"), waterlogged: nbt.str("false") }) }),
    ]),
    blocks: nbt.list(blocks),
    entities: nbt.list([]),
  }));
}
