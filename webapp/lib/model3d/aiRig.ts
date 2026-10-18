import type { Vec3 } from "./types";

/**
 * AI rigging for meshes without a skeleton (STL, OBJ, 3MF…): Claude / Codex look at renders of
 * the mesh plus its voxel approximation and answer with bones — joint pivots and, per bone, the
 * box of geometry it moves. lib/model3d/meshPack then assigns every triangle to a bone, which
 * makes rigid Minecraft-style parts the game can animate.
 */
export interface RigBone {
  name: string;
  /** "" = root bone */
  parent: string;
  /** joint position in editor pixels (ground Y=0, faces north/-Z) */
  pivot: Vec3;
  /** the geometry this bone moves: min corner + size in pixels */
  region: { from: Vec3; size: Vec3 };
}
export interface AiRig { bones: RigBone[] }

export interface RigAiContext {
  /** model size in pixels [w, h, d] */
  size: Vec3;
  /** voxel approximation ({from, size} in pixels) */
  boxes: { from: Vec3; size: Vec3 }[];
}

const MAX_BONES = 40;

const vec3 = { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 } as const;

export const RIG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bones"],
  properties: {
    bones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "parent", "pivot", "region"],
        properties: {
          name: { type: "string" },
          parent: { type: "string" },
          pivot: vec3,
          region: {
            type: "object",
            additionalProperties: false,
            required: ["from", "size"],
            properties: { from: vec3, size: vec3 },
          },
        },
      },
    },
  },
} as const;

export const RIG_SYSTEM = [
  "You rig 3D models as Minecraft entities (rigid parts on a bone hierarchy, like vanilla mobs) for a mod editor.",
  "Reply ONLY with the structured JSON.",
  "",
  "Coordinates: pixels, 16 px = 1 block. +Y is up, the ground is Y=0, the model is centred on X/Z and FACES NORTH (-Z).",
  "The model's own right side is +X (east). Attached renders: \"front\" is seen from -Z (looking at its face, so the model's right/+X",
  "appears on the image's LEFT), \"back\" from +Z, \"right\" from +X, \"left\" from -X, \"top\" from above with north (-Z) at the top.",
  "You also get the model's voxel approximation (boxes) — use it for exact positions; use the images to recognise what each part is.",
  "",
  "Bones:",
  "- One root bone (parent \"\") at the centre of mass / hips, usually named \"body\". Every other bone has a parent listed BEFORE it.",
  "- Add a bone for everything that should move on its own: head, each arm/forearm, each leg (and lower leg for long legs), wings,",
  "  tail segments, tentacles, jaws, a held weapon or staff (as a child of the hand/arm holding it), cloak, etc. 6–30 bones is typical.",
  "- pivot = the joint the part rotates around: shoulder for an arm, hip for a leg, wing root, neck base for the head, the grip of a",
  "  held weapon. Place it ON the geometry where the part connects to its parent.",
  "- region = a box (from = min corner, size) enclosing the geometry this bone moves, NOT including its child bones' parts where",
  "  avoidable. Regions may overlap; the smallest region containing a triangle wins, everything outside all regions goes to the",
  "  nearest bone. The root's region can be the whole torso.",
  "- Names: lowercase snake_case, unique, descriptive with side: left_wing, right_front_leg, staff…",
  "- Left/right are the MODEL's own sides: right = +X.",
  "- A held weapon/tool/staff/shield is always a child of the arm (or hand) bone that grips it, with its pivot AT that hand —",
  "  never a child of the body, even when the mesh shows it a little away from the hand.",
].join("\n");

export function rigPrompt(request: string, ctx: RigAiContext): string {
  const boxes = ctx.boxes.map((b) => `[${b.from.join(",")}]+[${b.size.join(",")}]`).join(" ");
  return `Model size: ${ctx.size.join(" × ")} px (w × h × d).\nVoxel boxes (from+size, px): ${boxes}\n\nRequest: ${request}`;
}

const clean = (s: unknown) => (typeof s === "string" ? s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) : "");
const vec = (v: unknown): Vec3 | null =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? (v.map((n) => Math.round(Math.max(-4096, Math.min(4096, n)) * 100) / 100) as Vec3) : null;

/** Unique valid names, parents that exist (earlier in the list) else root, sane numbers. */
export function validateAiRig(raw: unknown): AiRig {
  const list = (raw as { bones?: unknown })?.bones;
  if (!Array.isArray(list)) throw new Error("AI answer had no bones");
  const bones: RigBone[] = [];
  const taken = new Set<string>();
  for (const b of list.slice(0, MAX_BONES)) {
    const r = (b ?? {}) as Record<string, unknown>;
    let name = clean(r.name) || `bone_${bones.length + 1}`;
    if (/^\d/.test(name)) name = `b_${name}`;
    for (let n = 2; taken.has(name); n++) name = `${clean(r.name) || "bone"}_${n}`;
    const pivot = vec(r.pivot);
    if (!pivot) continue;
    const region = r.region as { from?: unknown; size?: unknown } | undefined;
    const from = vec(region?.from) ?? pivot;
    const size = (vec(region?.size) ?? [0, 0, 0]).map((v) => Math.abs(v)) as Vec3;
    const parent = clean(r.parent);
    bones.push({ name, parent: bones.length && taken.has(parent) ? parent : "", pivot, region: { from, size } });
    taken.add(name);
  }
  if (!bones.length) throw new Error("AI answer contained no usable bones");
  // Exactly one root: extra roots hang off the first bone.
  const root = bones[0].name;
  for (const b of bones.slice(1)) if (!b.parent) b.parent = root;
  bones[0].parent = "";
  return { bones };
}
