import type { ElementSpec, GeneratedFile, SelectOption } from "./types";

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
/** `{ [path]: [id] }` when `cond`, else no tag. */
export const tagIf = (cond: boolean, path: string, id: string): Record<string, string[]> => (cond ? { [path]: [id] } : {});
