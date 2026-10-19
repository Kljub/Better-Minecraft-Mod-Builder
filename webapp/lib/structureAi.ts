/**
 * "Generate a structure with Claude/Codex" for the Minecraft companion mod (companion-mod/,
 * /mmb generate <prompt>): the AI answers with a short build program (boxes, shells, walls, single
 * blocks — JSON Schema below, strict-mode compatible), which is expanded here into a block grid the
 * mod places in the world and saves as a structure template (.nbt). The AI's output is never
 * trusted as-is: block ids are checked against a strict pattern, coordinates clamped to the size.
 */
export const MAX_SIZE = 128;
const MAX_OPS = 8000;

export type StructureOpKind = "fill" | "hollow" | "walls" | "set";
const OP_KINDS: StructureOpKind[] = ["fill", "hollow", "walls", "set"];

export interface StructureOp { op: StructureOpKind; from: [number, number, number]; to: [number, number, number]; block: string }
export interface AiStructure { name: string; description: string; size: [number, number, number]; ops: StructureOp[] }

/** The expanded structure: palette of block states, and x,y,z,paletteIndex quadruples (air left out). */
export interface ExpandedStructure {
  name: string;
  description: string;
  size: [number, number, number];
  palette: string[];
  blocks: number[];
  /** block strings the AI used that don't look like block states (dropped) */
  rejected: string[];
}

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
  `Keep each side ≤ ${MAX_SIZE}; typical buildings are 7–25 wide.`,
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

export function structurePrompt(request: string, maxSize = MAX_SIZE): string {
  return `Request: ${request}\n\nMaximum size per side: ${Math.min(MAX_SIZE, Math.max(4, Math.round(maxSize)))} blocks.`;
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

/** Runs the build ops into a grid, clamped to the size (each side 1..maxSize). */
export function expandStructure(s: AiStructure, maxSize = MAX_SIZE): ExpandedStructure {
  const limit = Math.min(MAX_SIZE, Math.max(1, Math.round(maxSize)));
  const [sx, sy, sz] = s.size.map((n) => Math.min(limit, Math.max(1, n))) as [number, number, number];
  const grid = new Int32Array(sx * sy * sz); // palette index + 1, 0 = nothing placed
  const palette: string[] = [];
  const index = new Map<string, number>();
  const rejected = new Set<string>();
  const at = (x: number, y: number, z: number) => (y * sz + z) * sx + x;

  for (const op of s.ops) {
    const block = normalizeBlockState(op.block);
    if (!block) { rejected.add(op.block); continue; }
    let id = 0; // air clears
    if (!isAir(block)) {
      if (!index.has(block)) { index.set(block, palette.length); palette.push(block); }
      id = index.get(block)! + 1;
    }
    const to = op.op === "set" ? op.from : op.to;
    const lo = [0, 1, 2].map((a) => Math.max(0, Math.min(op.from[a], to[a])));
    const hi = [0, 1, 2].map((a) => Math.min([sx, sy, sz][a] - 1, Math.max(op.from[a], to[a])));
    if (lo.some((v, a) => v > hi[a])) continue;
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
      const onX = x === lo[0] || x === hi[0], onY = y === lo[1] || y === hi[1], onZ = z === lo[2] || z === hi[2];
      if (op.op === "hollow") grid[at(x, y, z)] = onX || onY || onZ ? id : 0;
      else if (op.op === "walls") { if (onX || onZ) grid[at(x, y, z)] = id; }
      else grid[at(x, y, z)] = id;
    }
  }

  // Compact the palette to what's still in the grid.
  const used = new Map<number, number>();
  const outPalette: string[] = [];
  const blocks: number[] = [];
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const v = grid[at(x, y, z)];
    if (!v) continue;
    if (!used.has(v)) { used.set(v, outPalette.length); outPalette.push(palette[v - 1]); }
    blocks.push(x, y, z, used.get(v)!);
  }
  return { name: structureId(s.name), description: s.description, size: [sx, sy, sz], palette: outPalette, blocks, rejected: [...rejected].slice(0, 20) };
}
