import JSZip from "jszip";
import type { ImportCategory } from "./importBundle";
import { ITEM_DEFAULT } from "./itemRegistry";
import { BLOCK_DEFAULT } from "./blockRegistry";
import { ARMOR_DEFAULT } from "./armorRegistry";
import { EFFECT_DEFAULT } from "./effectRegistry";
import { POTION_DEFAULT } from "./potionRegistry";
import { ACHIEVEMENT_DEFAULT } from "./achievementRegistry";
import { RECIPE_DEFAULT } from "./recipeRegistry";
import { TRADE_DEFAULT } from "./tradeRegistry";
import { LOOT_ENTRY_DEFAULT } from "./lootRegistry";
import { BIOME_DEFAULT } from "./biomeRegistry";
import { DIMENSION_DEFAULT } from "./dimensionRegistry";
import { defaultCustomAttribute } from "./itemRegistry";
import { ELEMENT_KINDS } from "./elements/registry";

/**
 * Works out where a dropped export belongs — so "drop any zip/json on the editor" lands in the
 * right category without the user picking one. Signals, strongest first:
 * 1. a full-project export (`<name>/<name>.json`, or a JSON with `screens` + other lists)
 * 2. the export's file name (`<modid>.blocks.json`, `<modid>.<element kind>.json`)
 * 3. the runtime manifest inside the zip (`assets/<modid>/screenspec/blocks.json`)
 * 4. the shape of the entries: their field names against each category's default spec
 */
export type ImportTarget = ImportCategory | "screens" | "project";

export interface Detection {
  target: ImportTarget;
  /** short human explanation, shown in the success toast */
  reason: string;
}

const FILE_SUFFIX: Record<string, ImportTarget> = {
  screens: "screens", items: "items", blocks: "blocks", effects: "effects", potions: "potions",
  attributes: "customAttributes", achievements: "achievements", recipes: "recipes", trades: "trades",
  loot: "lootEntries", biomes: "biomes", dimensions: "dimensions", armors: "armors",
};

const MANIFEST_FILE: Record<string, ImportCategory> = {
  "items.json": "items", "blocks.json": "blocks", "armors.json": "armors", "attributes.json": "customAttributes",
  "effects.json": "effects", "potions.json": "potions",
};

/** The project file's list keys — a JSON object holding `screens` plus any of these is a project. */
const PROJECT_LISTS = ["items", "blocks", "armors", "effects", "potions", "achievements", "recipes", "trades", "lootEntries", "biomes", "dimensions", "elements"];

/** Field names per target, for matching an entry's shape. */
function signatures(): Record<string, Set<string>> {
  const keys = (o: object) => new Set(["id", ...Object.keys(o)]);
  const sig: Record<string, Set<string>> = {
    screens: new Set(["id", "modId", "width", "height", "widgets", "container", "bindingsSchema", "actions"]),
    items: keys(ITEM_DEFAULT), blocks: keys(BLOCK_DEFAULT), armors: keys(ARMOR_DEFAULT),
    effects: keys(EFFECT_DEFAULT), potions: keys(POTION_DEFAULT), achievements: keys(ACHIEVEMENT_DEFAULT),
    recipes: keys(RECIPE_DEFAULT), trades: keys(TRADE_DEFAULT), lootEntries: keys(LOOT_ENTRY_DEFAULT),
    biomes: keys(BIOME_DEFAULT), dimensions: keys(DIMENSION_DEFAULT), customAttributes: keys(defaultCustomAttribute("x")),
  };
  for (const def of ELEMENT_KINDS) sig[`element:${def.kind}`] = keys(def.defaults());
  return sig;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Best-matching target for a list of entries by field-name overlap (Jaccard), or null if unclear. */
export function detectByShape(entries: unknown[]): ImportTarget | null {
  const specs = entries.filter(isRecord);
  if (specs.length === 0) return null;
  const sigs = signatures();
  let best: { target: string; score: number } | null = null;
  let second = 0;
  for (const [target, sig] of Object.entries(sigs)) {
    let total = 0;
    for (const spec of specs) {
      const keys = Object.keys(spec);
      const shared = keys.filter((k) => sig.has(k)).length;
      total += shared / new Set([...keys, ...sig]).size;
    }
    const score = total / specs.length;
    if (!best || score > best.score) { second = best?.score ?? 0; best = { target, score }; }
    else if (score > second) second = score;
  }
  // needs a real match, and a clear winner over the runner-up
  if (!best || best.score < 0.3 || best.score - second < 0.05) return null;
  return best.target as ImportTarget;
}

function fromFileName(name: string): ImportTarget | null {
  const m = /\.([A-Za-z]+)\.json$/.exec(name.split("/").pop() ?? "");
  if (!m) return null;
  if (FILE_SUFFIX[m[1]]) return FILE_SUFFIX[m[1]];
  return ELEMENT_KINDS.some((d) => d.kind === m[1]) ? `element:${m[1]}` : null;
}

function fromJson(json: unknown): Detection | null {
  if (isRecord(json) && Array.isArray(json.screens) && PROJECT_LISTS.some((k) => k in json)) {
    return { target: "project", reason: "full project" };
  }
  if (isRecord(json) && Array.isArray(json.widgets)) return { target: "screens", reason: "screen" };
  const entries = Array.isArray(json) ? json : isRecord(json) && typeof json.id === "string" ? [json] : null;
  if (!entries) return null;
  const target = detectByShape(entries);
  return target ? { target, reason: "recognised by its fields" } : null;
}

/** Detects where `file` (a .zip or .json export) belongs; throws if it can't tell. */
export async function detectImport(file: File): Promise<Detection> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  if (!isZip) {
    const byName = fromFileName(file.name);
    if (byName) return { target: byName, reason: "file name" };
    let json: unknown;
    try { json = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new Error("Not a zip or JSON export."); }
    const d = fromJson(json);
    if (d) return d;
    throw new Error("Couldn't tell what this JSON contains.");
  }

  const zip = await JSZip.loadAsync(buffer);
  const paths = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
  if (paths.some((p) => /^([^/]+)\/\1\.json$/.test(p))) return { target: "project", reason: "full project export" };

  const rootJson = paths.filter((p) => !p.includes("/") && p.toLowerCase().endsWith(".json"));
  for (const p of rootJson) {
    const byName = fromFileName(p);
    if (byName) return { target: byName, reason: "file name" };
  }
  for (const p of paths) {
    const m = /(?:^|\/)assets\/[^/]+\/screenspec\/([^/]+\.json)$/.exec(p);
    if (m && MANIFEST_FILE[m[1]]) return { target: MANIFEST_FILE[m[1]], reason: "mod manifest" };
  }
  for (const p of rootJson) {
    try {
      const d = fromJson(JSON.parse(await zip.file(p)!.async("string")));
      if (d) return d;
    } catch { /* not JSON — try the next */ }
  }
  throw new Error("Couldn't tell what this zip contains — it doesn't look like an export from this editor.");
}
