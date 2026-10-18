import type { AttributeModifierSpec } from "@/lib/types";
import { ATTRIBUTE_OPTIONS, ATTRIBUTE_OPERATION_OPTIONS, EQUIPMENT_SLOT_OPTIONS } from "@/lib/itemRegistry";

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
    default: return null;
  }
}

/** The user's request, framed with what's being edited. */
export function buildPrompt(task: string, prompt: string, context: unknown): string {
  const c = (context ?? {}) as Partial<AttributesContext>;
  const about = [
    str(c.name) && `Name: ${str(c.name)}`,
    str(c.category) && `Category: ${str(c.category)}`,
    str(c.rarity) && `Rarity: ${str(c.rarity)}`,
  ].filter(Boolean).join("\n");
  return `${about ? `Currently editing ${c.target === "effect" ? "an effect" : "an item"}:\n${about}\n\n` : ""}Request (${task}): ${prompt}`;
}
