/**
 * Minimal reader for Minecraft's binary NBT (big-endian, usually gzip-compressed) — enough to
 * open structure template files (.nbt, as saved by a structure block or found under
 * data/<ns>/structure/) in the browser. Tags map to plain JS values: numbers, bigint for longs,
 * strings, arrays, typed arrays for the *_array tags and objects for compounds.
 */

export type NbtValue =
  | number | bigint | string | NbtValue[] | Int8Array | Int32Array | BigInt64Array | { [key: string]: NbtValue };
export type NbtCompound = { [key: string]: NbtValue };

const MAX_DEPTH = 512;

class Reader {
  private pos = 0;
  private readonly view: DataView;
  private readonly decoder = new TextDecoder("utf-8");

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private need(n: number) {
    if (this.pos + n > this.bytes.length) throw new Error("NBT: unexpected end of data");
  }
  u8() { this.need(1); return this.view.getUint8(this.pos++); }
  i8() { this.need(1); return this.view.getInt8(this.pos++); }
  i16() { this.need(2); const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
  u16() { this.need(2); const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  i32() { this.need(4); const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
  i64() { this.need(8); const v = this.view.getBigInt64(this.pos); this.pos += 8; return v; }
  f32() { this.need(4); const v = this.view.getFloat32(this.pos); this.pos += 4; return v; }
  f64() { this.need(8); const v = this.view.getFloat64(this.pos); this.pos += 8; return v; }
  str() {
    const len = this.u16();
    this.need(len);
    // Java's "modified UTF-8" only differs for NUL and supplementary chars — fine for ids/names.
    const s = this.decoder.decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }
  count() {
    const n = this.i32();
    if (n < 0) throw new Error("NBT: negative length");
    return n;
  }

  payload(type: number, depth: number): NbtValue {
    if (depth > MAX_DEPTH) throw new Error("NBT: nested too deeply");
    switch (type) {
      case 1: return this.i8();
      case 2: return this.i16();
      case 3: return this.i32();
      case 4: return this.i64();
      case 5: return this.f32();
      case 6: return this.f64();
      case 7: { const n = this.count(); this.need(n); const a = new Int8Array(this.bytes.slice(this.pos, this.pos + n).buffer); this.pos += n; return a; }
      case 8: return this.str();
      case 9: {
        const itemType = this.u8();
        const n = this.count();
        const out: NbtValue[] = [];
        for (let i = 0; i < n; i++) out.push(this.payload(itemType, depth + 1));
        return out;
      }
      case 10: {
        const out: NbtCompound = {};
        for (;;) {
          const t = this.u8();
          if (t === 0) return out;
          const name = this.str();
          out[name] = this.payload(t, depth + 1);
        }
      }
      case 11: { const n = this.count(); this.need(n * 4); const a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = this.i32(); return a; }
      case 12: { const n = this.count(); this.need(n * 8); const a = new BigInt64Array(n); for (let i = 0; i < n; i++) a[i] = this.i64(); return a; }
      default: throw new Error(`NBT: unknown tag type ${type}`);
    }
  }

  root(): NbtCompound {
    const type = this.u8();
    if (type !== 10) throw new Error("NBT: root is not a compound tag");
    this.str(); // root name, usually ""
    return this.payload(10, 0) as NbtCompound;
  }
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Parses an NBT file; gzip is detected from the magic bytes (structure files are always gzipped). */
export async function readNbt(data: ArrayBuffer | Uint8Array): Promise<NbtCompound> {
  let bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
  return new Reader(bytes).root();
}

// ── Structure templates ──────────────────────────────────────────────────────

export interface StructureBlockState {
  name: string;
  properties: Record<string, string>;
}

export interface StructureInfo {
  size: [number, number, number];
  dataVersion?: number;
  palette: StructureBlockState[];
  /** one entry per stored block (air included if the file stores it); `state` indexes `palette` */
  blocks: { x: number; y: number; z: number; state: number; hasNbt: boolean }[];
  entityCount: number;
  /** block id -> count, air/structure_void excluded */
  counts: Record<string, number>;
  /** blocks that aren't air/structure_void/cave_air */
  solidCount: number;
}

const EMPTY_BLOCKS = new Set(["minecraft:air", "minecraft:cave_air", "minecraft:void_air", "minecraft:structure_void"]);
export const isEmptyBlock = (name: string) => EMPTY_BLOCKS.has(name);

const int = (v: NbtValue | undefined) => (typeof v === "number" ? v : 0);

/** Interprets a parsed structure template (vanilla StructureTemplate#save format). */
export function parseStructure(root: NbtCompound): StructureInfo {
  const sizeTag = root.size;
  if (!Array.isArray(sizeTag) || sizeTag.length !== 3) throw new Error("Not a structure file: no size [x, y, z]");
  const size = sizeTag.map(int) as [number, number, number];
  // "palettes" (several variants, e.g. shipwrecks) — the first is what a structure block places by default.
  const rawPalette = Array.isArray(root.palette) ? root.palette
    : Array.isArray(root.palettes) && Array.isArray(root.palettes[0]) ? (root.palettes[0] as NbtValue[]) : [];
  const palette: StructureBlockState[] = rawPalette.map((p) => {
    const c = (p ?? {}) as NbtCompound;
    const props = (c.Properties ?? {}) as NbtCompound;
    return {
      name: typeof c.Name === "string" ? c.Name : "minecraft:air",
      properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, String(v)])),
    };
  });
  const blocks: StructureInfo["blocks"] = [];
  const counts: Record<string, number> = {};
  let solidCount = 0;
  for (const b of Array.isArray(root.blocks) ? root.blocks : []) {
    const c = (b ?? {}) as NbtCompound;
    const pos = c.pos;
    if (!Array.isArray(pos) || pos.length !== 3) continue;
    const state = int(c.state);
    if (state < 0 || state >= palette.length) continue;
    blocks.push({ x: int(pos[0]), y: int(pos[1]), z: int(pos[2]), state, hasNbt: c.nbt !== undefined });
    const name = palette[state].name;
    if (!isEmptyBlock(name)) {
      counts[name] = (counts[name] ?? 0) + 1;
      solidCount++;
    }
  }
  return {
    size,
    dataVersion: typeof root.DataVersion === "number" ? root.DataVersion : undefined,
    palette,
    blocks,
    entityCount: Array.isArray(root.entities) ? root.entities.length : 0,
    counts,
    solidCount,
  };
}

export async function readStructure(data: ArrayBuffer | Uint8Array): Promise<StructureInfo> {
  return parseStructure(await readNbt(data));
}
