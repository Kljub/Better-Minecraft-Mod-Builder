import JSZip from "jszip";
import { migrateProjectJson } from "./migrations";

/** Sidebar groups ("classes") that can be imported on their own — same keys as the project file. */
export type ImportCategory =
  | "items" | "blocks" | "armors" | "customAttributes" | "effects" | "potions"
  | "achievements" | "recipes" | "trades" | "lootEntries" | "biomes" | "dimensions"
  /** a generic element kind (lib/elements) — stored under the project file's `elements.<kind>` */
  | `element:${string}`;

export interface SpecBundle {
  specs: Record<string, unknown>[];
  /** Entries dropped because they were not objects or had no string `id`. */
  skipped: number;
  /** Texture path (without the "pack:" store prefix) -> image, only those the specs reference. */
  textures: Record<string, Blob>;
}

/** Manifest the per-category export writes to `assets/<modid>/screenspec/` (datapack-only
 * categories have none — their raw spec only exists as the JSON at the zip root). */
const MANIFEST: Partial<Record<ImportCategory, string>> = {
  items: "items.json", blocks: "blocks.json", armors: "armors.json", customAttributes: "attributes.json",
  effects: "effects.json", potions: "potions.json",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractSpecs(json: unknown, category: ImportCategory): unknown[] | null {
  if (Array.isArray(json)) return json;
  if (!isRecord(json)) return null;
  if (category.startsWith("element:")) {
    const byKind = json.elements;
    const list = isRecord(byKind) ? byKind[category.slice("element:".length)] : undefined;
    if (Array.isArray(list)) return list;
  } else if (Array.isArray(json[category])) return migrateProjectJson(json)[category] as unknown[];
  if (typeof json.id === "string") return [json];
  return null;
}

function collectStrings(value: unknown, out: Set<string>): void {
  if (typeof value === "string") out.add(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (isRecord(value)) for (const v of Object.values(value)) collectStrings(v, out);
}

function finish(raw: unknown[], textures: Record<string, Blob>): SpecBundle {
  const specs = raw.filter((s): s is Record<string, unknown> => isRecord(s) && typeof s.id === "string" && s.id !== "");
  return { specs, skipped: raw.length - specs.length, textures };
}

async function readZip(zip: JSZip, category: ImportCategory): Promise<SpecBundle> {
  const paths = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
  const manifest = MANIFEST[category];
  // Root JSON first (single/"Export all" download), then the full-project `<name>/<name>.json`,
  // then the runtime manifest as a last resort.
  const candidates = [
    ...paths.filter((p) => !p.includes("/") && p.toLowerCase().endsWith(".json")),
    ...paths.filter((p) => /^([^/]+)\/\1\.json$/.test(p)),
    ...(manifest ? paths.filter((p) => new RegExp(`(^|/)assets/[^/]+/screenspec/${manifest.replace(".", "\\.")}$`).test(p)) : []),
  ];

  let raw: unknown[] | null = null;
  for (const path of candidates) {
    try {
      raw = extractSpecs(JSON.parse(await zip.file(path)!.async("string")), category);
    } catch {
      raw = null;
    }
    if (raw) break;
  }
  if (!raw) throw new Error("No importable JSON found in the zip.");

  const referenced = new Set<string>();
  collectStrings(raw, referenced);
  const textures: Record<string, Blob> = {};
  for (const path of paths) {
    const m = /^(?:[^/]+\/)?assets\/[^/]+\/textures\/(.+)$/.exec(path);
    if (m && referenced.has(m[1])) textures[m[1]] = await zip.file(path)!.async("blob");
  }
  return finish(raw, textures);
}

/**
 * Reads what an "Export"/"Export all" download of one category produced: a `.zip` (root JSON plus
 * bundled textures) or a plain `.json`. Also accepts a full-project export and picks just the
 * requested category out of it.
 */
export async function readSpecBundle(file: Blob, category: ImportCategory): Promise<SpecBundle> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readZip(await JSZip.loadAsync(buffer), category);

  const raw = extractSpecs(JSON.parse(new TextDecoder().decode(buffer)), category);
  if (!raw) throw new Error("File does not contain a list of entries.");
  return finish(raw, {});
}

/** Upserts `incoming` into `existing` by id: a known id is replaced in place, a new one appended. */
export function mergeSpecsById<T extends { id: string }>(existing: T[], incoming: T[]): { list: T[]; added: number; updated: number; firstIdx: number } {
  const list = [...existing];
  const indexById = new Map(list.map((s, i) => [s.id, i]));
  let added = 0;
  let updated = 0;
  let firstIdx = -1;
  for (const spec of incoming) {
    const at = indexById.get(spec.id);
    if (at === undefined) {
      indexById.set(spec.id, list.length);
      list.push(spec);
      added++;
      if (firstIdx < 0) firstIdx = list.length - 1;
    } else {
      list[at] = spec;
      updated++;
      if (firstIdx < 0) firstIdx = at;
    }
  }
  return { list, added, updated, firstIdx };
}
