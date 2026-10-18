import type { ElementKindDef, ElementSpec, ElementsByKind } from "./types";
import { DATAPACK_KINDS } from "./datapackKinds";
import { MOD_KINDS } from "./modKinds";
import { ENTITY_MODEL } from "./modelKind";

/** Every generic element kind, in rail order. New MCreator-style types are added here. */
export const ELEMENT_KINDS: ElementKindDef[] = [ENTITY_MODEL, ...DATAPACK_KINDS, ...MOD_KINDS];

const BY_KIND = new Map(ELEMENT_KINDS.map((k) => [k.kind, k]));

export function getElementKind(kind: string): ElementKindDef | undefined {
  return BY_KIND.get(kind);
}

/** Fills fields a stored element is missing (added to the def after it was saved). */
export function normalizeElement(def: ElementKindDef, spec: ElementSpec): ElementSpec {
  return { ...def.defaults(), ...spec };
}

/** Repairs a loaded `elements` record: drops unknown kinds and non-object/id-less entries. */
export function normalizeElements(raw: unknown): ElementsByKind {
  const out: ElementsByKind = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [kind, list] of Object.entries(raw as Record<string, unknown>)) {
    const def = getElementKind(kind);
    if (!def || !Array.isArray(list)) continue;
    out[kind] = list
      .filter((s): s is ElementSpec => !!s && typeof s === "object" && typeof (s as ElementSpec).id === "string" && (s as ElementSpec).id !== "")
      .map((s) => normalizeElement(def, s));
  }
  return out;
}

/** Display label of an element on tiles/lists. */
export function elementLabel(def: ElementKindDef, spec: ElementSpec): string {
  const v = def.labelField ? spec[def.labelField] : undefined;
  return typeof v === "string" && v.trim() ? v.trim() : spec.id;
}
