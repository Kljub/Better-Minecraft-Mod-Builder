import type { EntityModel, FaceKey } from "./types";
import { FACE_KEYS } from "./types";
import { cubeSize } from "./geometry";

/**
 * Skin tab AI: describe a look ("lava hound, dark red with glowing cracks") and Claude / Codex /
 * Ollama answer with a palette per cube/bone plus pixel details on single faces — the editor
 * paints that with its own texture painter (lib/ai/texturePaint), so the result always fits the
 * model's UV layout.
 */
export interface AiSkinOp { x: number; y: number; w: number; h: number; color: string }
export interface AiSkinFace { cube: string; face: FaceKey; color: string; ops: AiSkinOp[] }
export interface AiSkin { default_color: string; noise: number; parts: { name: string; color: string }[]; faces: AiSkinFace[] }

export interface SkinAiContext {
  bones: { name: string; parent: string | null }[];
  /** face sizes in texture pixels, [w, h] as seen from outside */
  cubes: { name: string; bone: string | null; size: [number, number, number]; faces: Partial<Record<FaceKey, [number, number]>> }[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_OPS = 600;

/** Face size as seen from outside: north/south x×y, east/west z×y, up/down x×z. */
export function faceSize(size: [number, number, number], face: FaceKey): [number, number] {
  const [x, y, z] = size.map((v) => Math.max(0, Math.floor(Math.abs(v) + 1e-6)));
  return face === "north" || face === "south" ? [x, y] : face === "east" || face === "west" ? [z, y] : [x, z];
}

export function skinContext(model: EntityModel): SkinAiContext {
  const boneName = new Map(model.bones.map((b) => [b.id, b.name]));
  return {
    bones: model.bones.map((b) => ({ name: b.name, parent: b.parent ? boneName.get(b.parent) ?? null : null })),
    cubes: model.cubes.slice(0, 200).map((c) => {
      const size = cubeSize(c).map((v) => Math.round(Math.abs(v) * 100) / 100) as [number, number, number];
      const faces: SkinAiContext["cubes"][number]["faces"] = {};
      for (const f of FACE_KEYS) if (c.faces[f]?.enabled !== false) faces[f] = faceSize(size, f);
      return { name: c.name, bone: c.bone ? boneName.get(c.bone) ?? null : null, size, faces };
    }),
  };
}

export const SKIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["default_color", "noise", "parts", "faces"],
  properties: {
    default_color: { type: "string" },
    noise: { type: "number" },
    parts: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "color"], properties: { name: { type: "string" }, color: { type: "string" } } },
    },
    faces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cube", "face", "color", "ops"],
        properties: {
          cube: { type: "string" },
          face: { type: "string", enum: FACE_KEYS },
          color: { type: "string" },
          ops: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["x", "y", "w", "h", "color"],
              properties: { x: { type: "integer" }, y: { type: "integer" }, w: { type: "integer" }, h: { type: "integer" }, color: { type: "string" } },
            },
          },
        },
      },
    },
  },
} as const;

export const SKIN_SYSTEM = [
  "You design textures (skins) for Minecraft entity models (Blockbench / Bedrock conventions) in a mod editor.",
  "Reply ONLY with the structured JSON. Colours are #rrggbb hex.",
  "",
  "How it is painted:",
  "1. Every cube gets a base colour with Minecraft-style shading (lighter top, darker bottom/sides): `parts` maps a cube or bone name",
  "   to a colour (a bone colours all its cubes and child bones' cubes unless they have their own), others get default_color.",
  "   noise 0..1 adds pixel grain (0.1–0.2 looks like vanilla mobs, 0 = flat).",
  "2. Then `faces` paint details on single cube faces: `color` refills the whole face (\"\" = keep the base), then ops are rectangles",
  "   in face pixels — x→right, y→down as seen from OUTSIDE the cube, 0-based, w/h ≥ 1, inside the face size given for that face.",
  "",
  "The mob faces north (-Z): eyes, mouth, snout details go on the head's north face. Use the exact cube and bone names from the model.",
  "Aim for a readable vanilla-like look: a small palette (3–6 colours per material), 1-pixel highlights and shadows, clear eyes.",
  "Keep it focused — a few dozen ops are usually enough.",
].join("\n");

export function skinPrompt(request: string, ctx: SkinAiContext): string {
  const bones = ctx.bones.map((b) => `- ${b.name}${b.parent ? ` (child of ${b.parent})` : ""}`).join("\n");
  const cubes = ctx.cubes.map((c) => `- ${c.name} (bone ${c.bone ?? "-"}), size [${c.size.join(", ")}], faces ${
    Object.entries(c.faces).map(([f, [w, h]]) => `${f} ${w}x${h}`).join(", ")}`).join("\n");
  return `Bones:\n${bones || "(none)"}\n\nCubes:\n${cubes}\n\nRequest: ${request}`;
}

const str = (v: unknown, max = 64) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v: unknown, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));

/** Keeps the AI's answer to the expected shape: valid colours, known faces, a bounded number of ops. */
export function validateAiSkin(raw: unknown): AiSkin {
  const a = raw as Partial<AiSkin> | null;
  if (!a || typeof a !== "object") throw new Error("AI answer was empty");
  const color = (v: unknown) => (HEX.test(str(v)) ? str(v).toLowerCase() : "");
  let budget = MAX_OPS;
  const faces = (Array.isArray(a.faces) ? a.faces : []).slice(0, 300).flatMap((f): AiSkinFace[] => {
    if (!f || !str(f.cube) || !(FACE_KEYS as readonly string[]).includes(f.face)) return [];
    const ops = (Array.isArray(f.ops) ? f.ops : []).flatMap((o): AiSkinOp[] => {
      if (!o || !color(o.color) || budget <= 0) return [];
      budget--;
      return [{ x: int(o.x, 0, 1023), y: int(o.y, 0, 1023), w: int(o.w, 1, 1024), h: int(o.h, 1, 1024), color: color(o.color) }];
    });
    return [{ cube: str(f.cube), face: f.face, color: color(f.color), ops }];
  });
  const parts = (Array.isArray(a.parts) ? a.parts : []).slice(0, 300).flatMap((p) => (p && str(p.name) && color(p.color) ? [{ name: str(p.name), color: color(p.color) }] : []));
  const result = { default_color: color(a.default_color) || "#8a8a8a", noise: Math.max(0, Math.min(1, Number(a.noise) || 0)), parts, faces };
  if (!parts.length && !faces.length && !color(a.default_color)) throw new Error("AI answer contained no colours");
  return result;
}

/** Clips ops to the face (the painter rejects anything outside); drops what's left with no area. */
export function clipOps(ops: AiSkinOp[], [w, h]: [number, number]): AiSkinOp[] {
  return ops.flatMap((o) => {
    const x = Math.min(o.x, w), y = Math.min(o.y, h);
    const cw = Math.min(o.w, w - x), ch = Math.min(o.h, h - y);
    return cw > 0 && ch > 0 ? [{ ...o, x, y, w: cw, h: ch }] : [];
  });
}
