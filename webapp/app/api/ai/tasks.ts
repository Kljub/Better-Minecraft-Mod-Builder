import type { AttributeModifierSpec } from "@/lib/types";
import { ATTRIBUTE_OPTIONS, ATTRIBUTE_OPERATION_OPTIONS, EQUIPMENT_SLOT_OPTIONS } from "@/lib/itemRegistry";
import { RIG_SCHEMA, RIG_SYSTEM, rigPrompt, validateAiRig, type RigAiContext } from "@/lib/model3d/aiRig";
import { SKIN_SCHEMA, SKIN_SYSTEM, skinPrompt, validateAiSkin, type SkinAiContext } from "@/lib/model3d/aiSkin";
import { ANIMATION_SCHEMA, ANIMATION_SYSTEM, animationPrompt, validateAiAnimation, type AnimationAiContext } from "@/lib/model3d/aiAnimation";

/**
 * AI tasks the editor can request. Each turns the user's free-text request plus editor context
 * into a system prompt + JSON Schema, and validates the CLI's answer back into real spec data —
 * the model's output is never trusted as-is (unknown attribute ids, NaN amounts etc. are dropped).
 */
export interface AiTask {
  system: string;
  schema: object;
  validate: (raw: unknown) => unknown;
}

interface CustomAttrContext { id: string; displayName: string; min: number; max: number; defaultBase: number }

export interface AttributesContext {
  /** what the modifiers attach to — an item's AttributeModifiers, or an effect's per-level modifiers */
  target: "item" | "effect";
  name?: string;
  category?: string;
  rarity?: string;
  customAttributes?: CustomAttrContext[];
}

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function attributesTask(rawCtx: unknown): AiTask {
  const c = (rawCtx ?? {}) as Partial<AttributesContext>;
  const custom: CustomAttrContext[] = Array.isArray(c.customAttributes)
    ? c.customAttributes.slice(0, 64).flatMap((a) => {
        const id = str(a?.id, 64);
        return id ? [{ id, displayName: str(a.displayName) ?? id, min: num(a.min), max: num(a.max), defaultBase: num(a.defaultBase) }] : [];
      })
    : [];
  const target = c.target === "effect" ? "effect" : "item";
  const options = [...ATTRIBUTE_OPTIONS, ...custom.map((a) => a.id)];

  const system = [
    "You design Minecraft (Java 1.21, NeoForge) attribute modifiers for a mod editor.",
    "Reply ONLY with the structured JSON. Choose a balanced, thematic set of 1-6 modifiers.",
    "",
    "Allowed attribute ids (use exactly these strings):",
    ...ATTRIBUTE_OPTIONS.map((a) => `- ${a}`),
    ...custom.map((a) => `- ${a.id} (custom mod attribute "${a.displayName}", base ${a.defaultBase}, range ${a.min}..${a.max})`),
    "",
    "Operations: add_value (flat), add_multiplied_base (fraction of base, 0.1 = +10%), add_multiplied_total (fraction of final value).",
    `Slots: ${EQUIPMENT_SLOT_OPTIONS.join(", ")}.`,
    "",
    "Vanilla reference: player base attack_damage 1, attack_speed 4, max_health 20, movement_speed 0.1.",
    "Weapons use slot mainhand with add_value: diamond sword attack_damage +6 / attack_speed -2.4,",
    "netherite sword +7 / -2.4, axes ~+8..9 / -3.0. Armor pieces use their own slot (head/chest/legs/feet):",
    "netherite chestplate armor +8, armor_toughness +3, knockback_resistance +0.1.",
    "Negative amounts are fine for trade-offs (e.g. slower but stronger).",
    target === "effect"
      ? "These modifiers belong to a status EFFECT: vanilla multiplies the amount by (amplifier+1), so give the level-1 value; slot is ignored, use \"any\"."
      : "These modifiers belong to an ITEM and apply while it's held/worn in the given slot.",
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["attributes"],
    properties: {
      attributes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["attribute", "amount", "operation", "slot"],
          properties: {
            attribute: { type: "string", enum: options },
            amount: { type: "number" },
            operation: { type: "string", enum: ATTRIBUTE_OPERATION_OPTIONS },
            slot: { type: "string", enum: EQUIPMENT_SLOT_OPTIONS },
          },
        },
      },
    },
  };

  const validate = (raw: unknown): { attributes: AttributeModifierSpec[] } => {
    const list = (raw as { attributes?: unknown })?.attributes;
    if (!Array.isArray(list)) throw new Error("AI answer had no attributes list");
    const attributes = list.slice(0, 16).flatMap((r): AttributeModifierSpec[] => {
      const a = r as Partial<AttributeModifierSpec>;
      if (!a || !options.includes(a.attribute as string)) return [];
      if (typeof a.amount !== "number" || !Number.isFinite(a.amount)) return [];
      return [{
        attribute: a.attribute as string,
        amount: Math.round(Math.max(-1024, Math.min(1024, a.amount)) * 1000) / 1000,
        operation: ATTRIBUTE_OPERATION_OPTIONS.includes(a.operation!) ? a.operation! : "add_value",
        slot: target === "effect" ? "any" : EQUIPMENT_SLOT_OPTIONS.includes(a.slot!) ? a.slot! : "mainhand",
      }];
    });
    if (attributes.length === 0) throw new Error("AI answer contained no usable attributes");
    return { attributes };
  };

  return { system, schema, validate };
}

export function buildTask(task: unknown, context: unknown): AiTask | null {
  switch (task) {
    case "attributes": return attributesTask(context);
    case "animation": return { system: ANIMATION_SYSTEM, schema: ANIMATION_SCHEMA, validate: validateAiAnimation };
    case "skin": return { system: SKIN_SYSTEM, schema: SKIN_SCHEMA, validate: validateAiSkin };
    case "rig": return { system: RIG_SYSTEM, schema: RIG_SCHEMA, validate: validateAiRig };
    default: return null;
  }
}

/** The user's request, framed with what's being edited. */
export function buildPrompt(task: string, prompt: string, context: unknown): string {
  if (task === "animation") return animationPrompt(prompt, sanitizeAnimationContext(context));
  if (task === "skin") return skinPrompt(prompt, sanitizeSkinContext(context));
  if (task === "rig") return rigPrompt(prompt, sanitizeRigContext(context));
  const c = (context ?? {}) as Partial<AttributesContext>;
  const about = [
    str(c.name) && `Name: ${str(c.name)}`,
    str(c.category) && `Category: ${str(c.category)}`,
    str(c.rarity) && `Rarity: ${str(c.rarity)}`,
  ].filter(Boolean).join("\n");
  return `${about ? `Currently editing ${c.target === "effect" ? "an effect" : "an item"}:\n${about}\n\n` : ""}Request (${task}): ${prompt}`;
}

/** The editor sends the skeleton + animation; keep it to the expected shape and a sane size. */
function sanitizeAnimationContext(raw: unknown): AnimationAiContext {
  const c = (raw ?? {}) as Partial<AnimationAiContext>;
  const vec = (v: unknown) => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? (v as [number, number, number]) : null);
  const bones = Array.isArray(c.bones) ? c.bones.slice(0, 128).flatMap((b) => {
    const name = str(b?.name, 64);
    return name ? [{ name, parent: str(b.parent, 64) ?? null, pivot: vec(b.pivot) ?? [0, 0, 0] as [number, number, number], size: vec(b.size) }] : [];
  }) : [];
  let animation: AnimationAiContext["animation"] = null;
  try { animation = c.animation ? validateAiAnimation(c.animation) : null; } catch { animation = null; }
  const others = Array.isArray(c.others) ? c.others.slice(0, 32).flatMap((o) => (str(o, 64) ? [str(o, 64)!] : [])) : [];
  return { bones, animation, others };
}

/** The skin tab sends bone/cube names and face sizes; keep that to the expected shape and size. */
function sanitizeSkinContext(raw: unknown): SkinAiContext {
  const c = (raw ?? {}) as Partial<SkinAiContext>;
  const dims = (v: unknown, n: number) => (Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 4096) ? v : null);
  const bones = Array.isArray(c.bones) ? c.bones.slice(0, 128).flatMap((b) => (str(b?.name, 64) ? [{ name: str(b.name, 64)!, parent: str(b.parent, 64) ?? null }] : [])) : [];
  const cubes = Array.isArray(c.cubes) ? c.cubes.slice(0, 200).flatMap((cube) => {
    const name = str(cube?.name, 64);
    const size = dims(cube?.size, 3) as [number, number, number] | null;
    if (!name || !size) return [];
    const faces: SkinAiContext["cubes"][number]["faces"] = {};
    for (const f of ["north", "east", "south", "west", "up", "down"] as const) {
      const d = dims((cube.faces as Record<string, unknown> | undefined)?.[f], 2);
      if (d) faces[f] = d as [number, number];
    }
    return [{ name, bone: str(cube.bone, 64) ?? null, size, faces }];
  }) : [];
  return { bones, cubes };
}

/** The mesh model editor sends the model size and its voxel boxes (≤ 400). */
function sanitizeRigContext(raw: unknown): RigAiContext {
  const c = (raw ?? {}) as Partial<RigAiContext>;
  const v3 = (v: unknown) => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 4096)
    ? (v.map((x) => Math.round(x * 100) / 100) as [number, number, number]) : null);
  const boxes = Array.isArray(c.boxes) ? c.boxes.slice(0, 400).flatMap((b) => {
    const from = v3(b?.from), size = v3(b?.size);
    return from && size ? [{ from, size }] : [];
  }) : [];
  return { size: v3(c.size) ?? [16, 32, 16], boxes };
}
