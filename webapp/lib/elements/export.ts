import type JSZip from "jszip";
import type { ElementKindDef, ElementSpec, ElementsByKind, ExportContext } from "./types";
import { ELEMENT_KINDS } from "./registry";

/**
 * Writes every generic element's files under `prefix` (see exportBundle's
 * writeGeneratedFiles), then the outputs several elements share: one merged
 * assets/<modId>/lang/en_us.json and one file per vanilla tag (values merged,
 * "replace": false so vanilla's own entries stay), plus one runtime manifest per name
 * (assets/<modId>/screenspec/elements/<name>.json — own folder so it can never clash with a
 * screen id) for kinds neoforge-runtime registers in Java.
 */
export function writeElementFiles(zip: JSZip, prefix: string, elements: ElementsByKind, ctx: ExportContext): void {
  const lang: Record<string, string> = {};
  const tags = new Map<string, Set<string>>();
  const manifests = new Map<string, unknown[]>();
  const atlases = new Map<string, unknown[]>();
  const merged = new Map<string, Record<string, unknown>>();
  for (const def of ELEMENT_KINDS) {
    if (def.standalone) continue; // e.g. resource packs — downloaded on their own, not part of the mod
    for (const spec of elements[def.kind] ?? []) {
      for (const f of def.files(spec, ctx)) zip.file(`${prefix}${f.path}`, f.content);
      const shared = def.shared?.(spec, { modId: ctx.modId, mcVersion: ctx.mcVersion });
      if (shared?.lang) Object.assign(lang, shared.lang);
      for (const [path, values] of Object.entries(shared?.tags ?? {})) {
        const set = tags.get(path) ?? new Set<string>();
        values.forEach((v) => set.add(v));
        tags.set(path, set);
      }
      for (const [name, entry] of Object.entries(shared?.manifest ?? {})) {
        manifests.set(name, [...(manifests.get(name) ?? []), entry]);
      }
      for (const [atlas, sources] of Object.entries(shared?.atlases ?? {})) {
        atlases.set(atlas, [...(atlases.get(atlas) ?? []), ...sources]);
      }
      for (const [path, entries] of Object.entries(shared?.jsonMerge ?? {})) {
        merged.set(path, { ...(merged.get(path) ?? {}), ...entries });
      }
    }
  }
  for (const [path, obj] of merged) zip.file(`${prefix}${path}`, JSON.stringify(obj, null, 2));
  if (Object.keys(lang).length > 0) {
    const sorted = Object.fromEntries(Object.entries(lang).sort(([a], [b]) => a.localeCompare(b)));
    zip.file(`${prefix}assets/${ctx.modId}/lang/en_us.json`, JSON.stringify(sorted, null, 2));
  }
  for (const [path, values] of tags) {
    zip.file(`${prefix}${path}`, JSON.stringify({ replace: false, values: [...values] }, null, 2));
  }
  for (const [atlas, sources] of atlases) {
    const [ns, path] = atlas.includes(":") ? atlas.split(":", 2) : ["minecraft", atlas];
    zip.file(`${prefix}assets/${ns}/atlases/${path}.json`, JSON.stringify({ sources }, null, 2));
  }
  for (const [name, entries] of manifests) {
    zip.file(`${prefix}assets/${ctx.modId}/screenspec/elements/${name}.json`, JSON.stringify(entries, null, 2));
  }
}

/** Ressources/<Plural>/<id>/ copies for the full-project archive: spec.json + the element's own files. */
export function writeElementArchiveCopies(zip: JSZip, prefix: string, elements: ElementsByKind, ctx: ExportContext): void {
  for (const def of ELEMENT_KINDS) {
    for (const spec of elements[def.kind] ?? []) {
      const dir = `${prefix}${def.plural.replace(/\s+/g, "")}/${spec.id}/`;
      zip.file(`${dir}spec.json`, JSON.stringify(spec, null, 2));
      for (const f of def.files(spec, ctx)) zip.file(`${dir}${f.path.split("/").pop()}`, f.content);
    }
  }
}

export function hasElements(elements: ElementsByKind | undefined): boolean {
  return !!elements && Object.values(elements).some((l) => l.length > 0);
}

/** Zip of one standalone element's own files (ElementKindDef.download), e.g. a resource pack. */
export async function buildStandaloneZip(def: ElementKindDef, spec: ElementSpec, ctx: ExportContext): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of def.files(spec, ctx)) zip.file(f.path, f.content);
  return zip.generateAsync({ type: "blob" });
}

/** Every structure-store key the elements reference (to preload blobs before writing). */
export function elementBinaryKeys(elements: ElementsByKind): string[] {
  const keys: string[] = [];
  for (const def of ELEMENT_KINDS) for (const spec of elements[def.kind] ?? []) keys.push(...(def.binaryFiles?.(spec) ?? []));
  return keys;
}

/** Every pack texture key the elements reference (to preload blobs before writing). */
export function elementTextureKeys(elements: ElementsByKind): string[] {
  const keys: string[] = [];
  for (const def of ELEMENT_KINDS) for (const spec of elements[def.kind] ?? []) keys.push(...(def.textures?.(spec) ?? []));
  return keys;
}
