/**
 * "Generate a structure with Claude/Codex" for the Minecraft companion mod (companion-mod/,
 * /mmb generate <prompt>): the AI answers with a short build program (boxes, shells, walls, single
 * blocks — JSON Schema below, strict-mode compatible), which is expanded here into a block grid the
 * mod places in the world and saves as a structure template (.nbt). The AI's output is never
 * trusted as-is: block ids are checked against a strict pattern, coordinates clamped to the size.
 */
/** Largest width/length (x, z) and height (y) of a generated structure, in blocks. */
export const MAX_SIDE = 1024;
export const MAX_HEIGHT = 256;
const MAX_OPS = 20000;
/** Sparse grid: at most this many 16³ sections hold blocks (≈ 128 MB) — refuses anything bigger. */
const MAX_SECTIONS = 16384;
/** Up to this many blocks also go out as an x,y,z,index list (training data, small structures). */
export const INLINE_BLOCKS = 300_000;

export type StructureOpKind = "fill" | "hollow" | "walls" | "set";
const OP_KINDS: StructureOpKind[] = ["fill", "hollow", "walls", "set"];

export interface StructureOp { op: StructureOpKind; from: [number, number, number]; to: [number, number, number]; block: string }
export interface AiStructure { name: string; description: string; size: [number, number, number]; ops: StructureOp[] }

/**
 * The compiled structure: the palette of block states and the build ops (clamped, validated) as
 * flat records of OP_STRIDE ints — kind (0 fill, 1 hollow, 2 walls, 3 set), x1,y1,z1, x2,y2,z2
 * (inclusive, lo ≤ hi), palette index (-1 = air). The mod replays them in order. `blocks` is the
 * expanded result as x,y,z,paletteIndex quadruples (air left out) — only up to INLINE_BLOCKS.
 */
export interface ExpandedStructure {
  name: string;
  description: string;
  size: [number, number, number];
  palette: string[];
  ops: number[];
  blockCount: number;
  /** empty when blockCount > INLINE_BLOCKS */
  blocks: number[];
  /** block strings the AI used that don't look like block states (dropped) */
  rejected: string[];
}
export const OP_STRIDE = 8;

const vec3 = { type: "array", items: { type: "integer" } } as const;

export const STRUCTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "size", "ops"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    size: vec3,
    ops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "from", "to", "block"],
        properties: { op: { type: "string", enum: OP_KINDS }, from: vec3, to: vec3, block: { type: "string" } },
      },
    },
  },
} as const;

export const STRUCTURE_SYSTEM = [
  "You design Minecraft (Java Edition 1.21+) structures — houses, towers, ruins, statues, bridges … — for a mod tool.",
  "Reply ONLY with the structured JSON: a name (snake_case), a one-sentence description, the size [x, y, z] and a list of build ops.",
  "",
  "Coordinates: integers, 0 ≤ x < size[0], 0 ≤ y < size[1], 0 ≤ z < size[2]. +X is east, +Y is up, +Z is south.",
  "y = 0 is the ground floor (the lowest layer, e.g. the foundation / floor). The FRONT (entrance) faces north, i.e. the z = 0 side;",
  "the tool turns the structure so the front faces the player.",
  `Keep width and length ≤ ${MAX_SIDE} and height ≤ ${MAX_HEIGHT}; typical buildings are 7–25 wide. Big builds (castles, cities) need few, large ops.`,
  "",
  "Ops run in order, later ops overwrite earlier ones:",
  "- fill: solid box from..to (inclusive corners).",
  "- hollow: box shell — all six faces from..to, the inside becomes air.",
  "- walls: only the four vertical sides of the box from..to (no floor or ceiling); the inside is left as it is.",
  "- set: one block at `from` (`to` is ignored — repeat `from`).",
  "Use block \"minecraft:air\" to carve doorways, windows and interiors.",
  "",
  "Blocks are block states like in /setblock: \"minecraft:oak_planks\", \"minecraft:oak_stairs[facing=east,half=bottom]\",",
  "\"minecraft:oak_door[facing=north,half=lower]\" + \"minecraft:oak_door[facing=north,half=upper]\" above it,",
  "\"minecraft:glass_pane\", \"minecraft:wall_torch[facing=south]\", \"minecraft:lantern[hanging=true]\". Only use real vanilla ids and properties.",
  "Stairs `facing` points towards the high side of the step; for a roof slope rising to the east use facing=east.",
  "",
  "Build like a good Minecraft builder: a foundation, depth on the walls (pillars of logs, a different block for corners/trim),",
  "pitched or detailed roofs with stairs and slabs, windows, a door, some lighting and simple furniture inside. Prefer few big ops over many single blocks.",
].join("\n");

const clampLimit = (v: number, max: number) => Math.min(max, Math.max(4, Math.round(v)));

export function structurePrompt(request: string, maxSide = MAX_SIDE, maxHeight = MAX_HEIGHT): string {
  return `Request: ${request}\n\nMaximum size: ${clampLimit(maxSide, MAX_SIDE)} blocks wide/long (x, z), ${clampLimit(maxHeight, MAX_HEIGHT)} blocks high (y).`;
}

/** "oak_planks" → "minecraft:oak_planks"; null when it doesn't look like a block state. */
export function normalizeBlockState(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  const full = /^[^[]*:/.test(s) ? s : `minecraft:${s}`; // a namespace before any [properties]
  return /^[a-z0-9_.-]+:[a-z0-9_/.-]+(\[[a-z0-9_]+=[a-z0-9_]+(,[a-z0-9_]+=[a-z0-9_]+)*\])?$/.test(full) ? full : null;
}

const isAir = (b: string) => b === "minecraft:air" || b === "minecraft:cave_air" || b === "minecraft:void_air";

/** Light structural check of the AI's answer (expansion clamps the rest). */
export function validateAiStructure(raw: unknown): AiStructure {
  const a = raw as Partial<AiStructure> | null;
  if (!a || !Array.isArray(a.ops)) throw new Error("AI answer had no build ops");
  const int3 = (v: unknown): [number, number, number] | null =>
    Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((n) => typeof n === "number" && Number.isFinite(n))
      ? (v.slice(0, 3).map((n) => Math.round(n as number)) as [number, number, number]) : null;
  const size = int3(a.size);
  if (!size || size.some((n) => n < 1)) throw new Error("AI answer had no valid size");
  const ops = a.ops.slice(0, MAX_OPS).flatMap((o) => {
    const from = int3(o?.from);
    if (!from || !OP_KINDS.includes(o.op) || typeof o.block !== "string") return [];
    return [{ op: o.op, from, to: int3(o.to) ?? from, block: o.block.slice(0, 200) }];
  });
  if (!ops.length) throw new Error("AI answer contained no usable build ops");
  return { name: typeof a.name === "string" ? a.name.slice(0, 64) : "structure", description: typeof a.description === "string" ? a.description.slice(0, 500) : "", size, ops };
}

export function structureId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "structure";
}

const KINDS: Record<StructureOpKind, number> = { fill: 0, hollow: 1, walls: 2, set: 3 };

/**
 * Validates and clamps the build ops to the size (x/z ≤ maxSide, y ≤ maxHeight) and runs them into
 * a sparse grid — only 16³ sections something was placed in exist — for the block count and, for
 * small structures, the block list.
 */
export function expandStructure(s: AiStructure, maxSide = MAX_SIDE, maxHeight = MAX_HEIGHT): ExpandedStructure {
  const side = Math.min(MAX_SIDE, Math.max(1, Math.round(maxSide)));
  const height = Math.min(MAX_HEIGHT, Math.max(1, Math.round(maxHeight)));
  const limits = [side, height, side];
  const [sx, sy, sz] = s.size.map((n, a) => Math.min(limits[a], Math.max(1, n))) as [number, number, number];
  const nx = (sx + 15) >> 4, nz = (sz + 15) >> 4;
  const sections = new Map<number, Uint16Array>(); // palette index + 1, 0 = nothing placed
  const palette: string[] = [];
  const index = new Map<string, number>();
  const rejected = new Set<string>();
  const ops: number[] = [];

  const put = (x: number, y: number, z: number, id: number) => {
    const key = ((y >> 4) * nz + (z >> 4)) * nx + (x >> 4);
    let sec = sections.get(key);
    if (!sec) {
      if (!id) return; // air where nothing is placed yet
      if (sections.size >= MAX_SECTIONS) throw new Error("The structure is too big — it fills more of its box than the server can build at once. Ask for something smaller or less solid.");
      sec = new Uint16Array(4096);
      sections.set(key, sec);
    }
    sec[((y & 15) << 8) | ((z & 15) << 4) | (x & 15)] = id;
  };

  for (const op of s.ops) {
    const block = normalizeBlockState(op.block);
    if (!block) { rejected.add(op.block); continue; }
    let id = 0; // air clears
    if (!isAir(block)) {
      if (!index.has(block)) {
        if (palette.length >= 65534) continue;
        index.set(block, palette.length);
        palette.push(block);
      }
      id = index.get(block)! + 1;
    }
    const to = op.op === "set" ? op.from : op.to;
    const lo = [0, 1, 2].map((a) => Math.max(0, Math.min(op.from[a], to[a])));
    const hi = [0, 1, 2].map((a) => Math.min([sx, sy, sz][a] - 1, Math.max(op.from[a], to[a])));
    if (lo.some((v, a) => v > hi[a])) continue;
    ops.push(KINDS[op.op], lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], id - 1);
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
      const onX = x === lo[0] || x === hi[0], onY = y === lo[1] || y === hi[1], onZ = z === lo[2] || z === hi[2];
      if (op.op === "hollow") put(x, y, z, onX || onY || onZ ? id : 0);
      else if (op.op === "walls") { if (onX || onZ) put(x, y, z, id); }
      else put(x, y, z, id);
    }
  }

  let blockCount = 0;
  for (const sec of sections.values()) for (let i = 0; i < 4096; i++) if (sec[i]) blockCount++;
  const blocks: number[] = [];
  if (blockCount <= INLINE_BLOCKS) {
    const keys = [...sections.keys()].sort((a, b) => a - b);
    for (const key of keys) {
      const sec = sections.get(key)!;
      const bx = (key % nx) << 4, bz = (Math.floor(key / nx) % nz) << 4, by = Math.floor(key / (nx * nz)) << 4;
      for (let i = 0; i < 4096; i++) if (sec[i]) blocks.push(bx + (i & 15), by + (i >> 8), bz + ((i >> 4) & 15), sec[i] - 1);
    }
  }
  return { name: structureId(s.name), description: s.description, size: [sx, sy, sz], palette, ops, blockCount, blocks, rejected: [...rejected].slice(0, 20) };
}

// ── Editing an existing structure (/mmb edit <prompt>) ───────────────────────

/** Ops of the existing structure shown to the AI, at most this many (the rest is summarised). */
const EDIT_CONTEXT_OPS = 4000;

export const STRUCTURE_EDIT_SYSTEM = [
  STRUCTURE_SYSTEM,
  "",
  "EDIT MODE: the structure already exists (its build ops are listed in the request). Reply with ONLY the new ops that",
  "change it as asked — they run on top of the existing ones, in the same coordinates. Add blocks with fill/hollow/walls/set,",
  "remove or carve with \"minecraft:air\". Do not repeat the existing ops. The size stays exactly as given (repeat it in `size`);",
  "everything must fit inside it. Keep `name` as given and describe the change in `description`.",
].join("\n");

/** The edit request: the structure as it is (size + ops so far), then what to change. */
export function structureEditPrompt(request: string, base: { name: string; size: [number, number, number]; ops: StructureOp[] }): string {
  const shown = base.ops.slice(0, EDIT_CONTEXT_OPS);
  const lines = shown.map((o) => `${o.op} ${o.from.join(",")} ${(o.op === "set" ? o.from : o.to).join(",")} ${o.block}`);
  const more = base.ops.length > shown.length ? `\n… and ${base.ops.length - shown.length} more ops (not shown).` : "";
  return [
    `Existing structure "${base.name}", size [${base.size.join(", ")}] (fixed). Its build ops so far (op from to block):`,
    lines.join("\n") + more,
    "",
    `Change request: ${request}`,
  ].join("\n");
}
