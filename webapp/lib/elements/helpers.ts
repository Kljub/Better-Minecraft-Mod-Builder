import type { ElementKindDef, ElementSpec, GeneratedFile, SelectOption } from "./types";

/** Small spec-reading/file helpers shared by the element kind definitions. */

export const json = (v: unknown) => JSON.stringify(v, null, 2);
export const str = (spec: ElementSpec, key: string, fallback = "") => (typeof spec[key] === "string" ? (spec[key] as string) : fallback);
export const num = (spec: ElementSpec, key: string, fallback = 0) => (typeof spec[key] === "number" && Number.isFinite(spec[key]) ? (spec[key] as number) : fallback);
export const bool = (spec: ElementSpec, key: string) => spec[key] === true;
export const list = <T,>(spec: ElementSpec, key: string): T[] => (Array.isArray(spec[key]) ? (spec[key] as T[]) : []);
export const opts = (values: string[], labels: Record<string, string> = {}): SelectOption[] =>
  values.map((value) => ({ value, label: labels[value] ?? value }));
export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/** Displayed name, falling back to a readable version of the id. */
export const nameOf = (spec: ElementSpec) => str(spec, "name").trim() || titleCase(spec.id);
export const textureFile = (path: string, key: string, texture: (k: string) => Blob | undefined): GeneratedFile[] => {
  const blob = key ? texture(key) : undefined;
  return blob ? [{ path, content: blob }] : [];
};
/** Registry id for a display name: lowercase, spaces become "_", anything else not allowed in an id is dropped. */
export const labelToId = (label: string) =>
  label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");

/**
 * The id an element should get when its name changes from `prevLabel` to `nextLabel`, or null to
 * keep it: the id only follows while it still matches the old name (or is the fresh default
 * "<prefix>_<n>"), so an id renamed by hand is never overwritten — and not once something else in
 * the project refers to it (renaming would break that reference). Clashes get "_2", "_3", ….
 */
export function followLabelId(prevId: string, prevLabel: string, nextLabel: string, prefix: string, siblingIds: string[], referenced?: (id: string) => boolean): string | null {
  const prev = labelToId(prevLabel);
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const following = new RegExp(`^${esc(prefix)}_\\d+$`).test(prevId) || (!!prev && (prevId === prev || new RegExp(`^${esc(prev)}_\\d+$`).test(prevId)));
  const base = labelToId(nextLabel);
  if (!following || !base || referenced?.(prevId)) return null;
  let id = base;
  for (let n = 2; siblingIds.includes(id) && id !== prevId; n++) id = `${base}_${n}`;
  return id === prevId ? null : id;
}

/**
 * For kinds with a `labelField` (unless `idFromLabel: false`): when a patch changes the label,
 * carries the id along (see followLabelId).
 */
export function withLabelId(def: ElementKindDef, spec: ElementSpec, patch: Partial<ElementSpec>, siblings: ElementSpec[], referenced?: (id: string) => boolean): Partial<ElementSpec> {
  const field = def.labelField;
  if (def.idFromLabel === false || !field || !(field in patch)) return patch;
  const id = followLabelId(spec.id, str(spec, field), typeof patch[field] === "string" ? (patch[field] as string) : "", def.idPrefix,
    siblings.filter((s) => s !== spec).map((s) => s.id), referenced);
  return id ? { ...patch, id } : patch;
}

/** `{ [path]: [id] }` when `cond`, else no tag. */
export const tagIf = (cond: boolean, path: string, id: string): Record<string, string[]> => (cond ? { [path]: [id] } : {});
