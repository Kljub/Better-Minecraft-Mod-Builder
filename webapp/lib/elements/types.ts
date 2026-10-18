import type { LucideIcon } from "lucide-react";
import type { McVersion } from "@/lib/mcVersion";

/**
 * Generic "mod element" system — one declarative ElementKindDef per MCreator-
 * style element type (Damage type, Enchantment, Painting, …). Everything else
 * (rail entry, element grid, CRUD + undo, schema-driven editor form, project
 * save/load, per-category export/import, full-project export) is derived from
 * the definition, so adding a type means writing one def, not touching ten
 * places like the older hand-wired types (items, blocks, …) do.
 */

/** A stored element: its registry path id plus kind-specific fields from the def's `fields`. */
export interface ElementSpec {
  id: string;
  [field: string]: unknown;
}

export interface SelectOption {
  value: string;
  label: string;
}

interface FieldBase {
  key: string;
  label: string;
  help?: string;
  /** spans one of the form's two columns instead of both */
  half?: boolean;
  /** hide the field unless this returns true for the current spec */
  when?: (spec: ElementSpec) => boolean;
}

export type FieldDef =
  | (FieldBase & { type: "text"; placeholder?: string; mono?: boolean })
  | (FieldBase & { type: "textarea"; rows?: number; mono?: boolean; placeholder?: string })
  | (FieldBase & { type: "number"; min?: number; max?: number; integer?: boolean })
  | (FieldBase & { type: "select"; options: SelectOption[] })
  | (FieldBase & { type: "boolean" })
  | (FieldBase & { type: "color" })
  /** pack texture key ("custom/foo.png") picked from the texture library */
  | (FieldBase & { type: "texture" })
  /** free registry id with suggestions (e.g. "minecraft:stone") */
  | (FieldBase & { type: "registry"; suggestions: (ctx: FieldContext) => string[]; placeholder?: string })
  | (FieldBase & { type: "multiselect"; options: SelectOption[] })
  /** repeatable group of sub-fields (stored as an array of objects) */
  | (FieldBase & { type: "list"; itemLabel: string; fields: FieldDef[]; newItem: () => Record<string, unknown> })
  /** a structure template (.nbt) stored in lib/structureStore; the value is its store key */
  | (FieldBase & { type: "structure" });

export interface FieldContext {
  modId: string;
  mcVersion: McVersion;
  /** ids of the project's own items/blocks, already namespaced ("mymod:ruby") */
  projectItems: string[];
  projectBlocks: string[];
  /** ids of the project's screens (as exported to assets/<modId>/screenspec/<id>.json) */
  projectScreens?: string[];
  /** namespaced ids of the project's generic elements, by kind */
  elementIds?: Record<string, string[]>;
  /** animation names of the entity being edited (Entity settings) */
  animationNames?: string[];
}

/** One generated file, path relative to the mod's resources root (assets/… or data/…). */
export interface GeneratedFile {
  path: string;
  content: string | Blob;
}

export interface ExportContext {
  modId: string;
  mcVersion: McVersion;
  /** loaded image for a pack texture key, if this browser has it */
  texture: (key: string) => Blob | undefined;
  /** a binary file the element stored outside the project JSON (see ElementKindDef.files), if loaded */
  file?: (key: string) => Blob | undefined;
}

/** Entries several elements contribute to — merged across the whole project at export time. */
export interface SharedOutputs {
  /** lang key -> text, merged into assets/<modId>/lang/en_us.json */
  lang?: Record<string, string>;
  /** tag file path (e.g. "data/minecraft/tags/function/load.json") -> values to add */
  tags?: Record<string, string[]>;
  /** runtime manifest name (e.g. "commands") -> this element's entry. All entries of one name are
   * written as a JSON array to assets/<modId>/screenspec/elements/<name>.json, which neoforge-runtime reads
   * at mod construction (GsonSpecIO.fromClasspath) — for content that needs real Java
   * registration (commands, fluids, game rules, …), not just data files. */
  manifest?: Record<string, unknown>;
  /** atlas id (e.g. "minecraft:armor_trims") -> sprite sources this element adds. All sources for
   * one atlas are merged into assets/<ns>/atlases/<path>.json — atlas files from every pack are
   * combined by the game, but two elements writing the same file would overwrite each other. */
  atlases?: Record<string, unknown[]>;
}

export interface VersionContext {
  modId: string;
  mcVersion: McVersion;
}

export interface ElementKindDef {
  kind: string;
  /** singular, e.g. "Enchantment" */
  label: string;
  /** rail/grid title, e.g. "Enchantments" */
  plural: string;
  icon: LucideIcon;
  /** prefix for fresh ids ("enchantment_1") */
  idPrefix: string;
  /** one-paragraph explanation shown at the top of the editor */
  description: string;
  defaults: () => Omit<ElementSpec, "id">;
  fields: FieldDef[];
  /** field shown as the tile label instead of the id (e.g. "name") */
  labelField?: string;
  /** texture key shown on the tile */
  thumb?: (spec: ElementSpec) => string | undefined;
  /** problems that would make the export fail or do nothing in game */
  validate?: (spec: ElementSpec, ctx: VersionContext) => string[];
  /** the element's own files */
  files: (spec: ElementSpec, ctx: ExportContext) => GeneratedFile[];
  shared?: (spec: ElementSpec, ctx: VersionContext) => SharedOutputs;
  /** edited in a dedicated full-size editor instead of the schema form */
  customEditor?: "model";
  /** pack texture keys this element bundles (only for the "missing texture" check / archive copy) */
  textures?: (spec: ElementSpec) => string[];
  /** structure-store keys (lib/structureStore) the export must load before calling `files` */
  binaryFiles?: (spec: ElementSpec) => string[];
}

export type ElementsByKind = Record<string, ElementSpec[]>;
