"use client";

import {
  ChevronLeft, LayoutGrid, Monitor, Sword, Box, Shield, Folders, Tags, Sparkles, FlaskConical,
  Paintbrush, Trophy, Hammer, Users, Package, Mountain, Globe, Settings, Wand2, Bot, Blocks, ShieldPlus,
  type LucideIcon,
} from "lucide-react";
import { ELEMENT_KINDS, getElementKind } from "@/lib/elements/registry";

export type ActiveDocType =
  | "screen" | "item" | "block" | "armor" | "attribute" | "effect" | "potion" | "texture"
  | "achievement" | "recipe" | "trade" | "loot" | "biome" | "dimension"
  /** a generic element (lib/elements) — which one is HistoryEntry.activeElement */
  | "element";

/** Workspace sections in rail order (TOOL_SECTIONS are tools, not element lists). */
export const SECTIONS = [
  "screens", "items", "blocks", "armors", "creativeTabs", "customAttributes", "effects", "potions",
  "resources", "skinGenerator", "blockGenerator", "armorGenerator", "modelGenerator", "achievements", "recipes", "trades", "lootEntries", "biomes", "dimensions",
] as const;
/** Sections that open a tool instead of a category's element browser: the image library
 * (custom textures), the AI item/skin texture generator, the AI block texture generator, the AI
 * armor set generator and the AI mob builder. */
export const TOOL_SECTIONS = ["resources", "skinGenerator", "blockGenerator", "armorGenerator", "modelGenerator"] as const;
export type ToolSection = (typeof TOOL_SECTIONS)[number];
export const isToolSection = (key: SectionKey): key is ToolSection => (TOOL_SECTIONS as readonly string[]).includes(key);
/** Built-in sections, plus one `el:<kind>` section per generic element kind (lib/elements). */
export type SectionKey = (typeof SECTIONS)[number] | `el:${string}`;
type BuiltinSection = (typeof SECTIONS)[number];

/** Icon per workspace section — shared by the icon rail, the category views and the workspace overview. */
export const SECTION_ICONS: Record<BuiltinSection, LucideIcon> = {
  screens: Monitor, items: Sword, blocks: Box, armors: Shield, creativeTabs: Folders,
  customAttributes: Tags, effects: Sparkles, potions: FlaskConical, resources: Paintbrush, skinGenerator: Wand2, blockGenerator: Blocks, armorGenerator: ShieldPlus, modelGenerator: Bot,
  achievements: Trophy, recipes: Hammer, trades: Users, lootEntries: Package,
  biomes: Mountain, dimensions: Globe,
};

export const SECTION_LABELS: Record<BuiltinSection, string> = {
  screens: "Screens", items: "Items", blocks: "Blocks", armors: "Armor", creativeTabs: "Creative Tabs",
  customAttributes: "Custom Attributes", effects: "Effects", potions: "Potions", resources: "Resources",
  skinGenerator: "Item Skin Generator", blockGenerator: "Block Generator", armorGenerator: "Armor Generator", modelGenerator: "Entity Model Generator",
  achievements: "Achievements", recipes: "Crafting Recipes", trades: "Trading", lootEntries: "Loot Tables",
  biomes: "Biomes", dimensions: "Dimensions",
};

/** The section an open editor belongs to — highlighted in the rail while editing. */
const SECTION_OF_BUILTIN_DOC: Record<Exclude<ActiveDocType, "element">, BuiltinSection> = {
  screen: "screens", item: "items", block: "blocks", armor: "armors", attribute: "customAttributes",
  effect: "effects", potion: "potions", texture: "resources", achievement: "achievements",
  recipe: "recipes", trade: "trades", loot: "lootEntries", biome: "biomes", dimension: "dimensions",
};

export function sectionOfDoc(doc: ActiveDocType, elementKind?: string): SectionKey {
  return doc === "element" ? `el:${elementKind ?? ""}` : SECTION_OF_BUILTIN_DOC[doc];
}

export function sectionIcon(key: SectionKey): LucideIcon {
  return key.startsWith("el:") ? (getElementKind(key.slice(3))?.icon ?? Box) : SECTION_ICONS[key as BuiltinSection];
}

export function sectionLabel(key: SectionKey): string {
  return key.startsWith("el:") ? (getElementKind(key.slice(3))?.plural ?? key) : SECTION_LABELS[key as BuiltinSection];
}

/**
 * MCreator-style icon rail — the editor's only sidebar. "All categories" opens
 * the workspace overview, every other entry opens that category's element
 * browser (CategoryView / ResourcesPanel) in the main area.
 */
export default function AppSidebar({ active, onGoHome, onOpenAll, onOpenSection, onOpenSettings }: {
  /** highlighted entry: "all", a section, or null */
  active: "all" | SectionKey | null;
  onGoHome: () => void;
  onOpenAll: () => void;
  onOpenSection: (key: SectionKey) => void;
  onOpenSettings: () => void;
}) {
  const entries: { key: "all" | SectionKey; icon: LucideIcon; label: string }[] = [
    { key: "all", icon: LayoutGrid, label: "All categories" },
    // Everything below "All categories" alphabetically by label (built-ins and element kinds mixed).
    ...[
      ...SECTIONS.map((key) => ({ key, icon: SECTION_ICONS[key], label: SECTION_LABELS[key] })),
      ...ELEMENT_KINDS.map((def) => ({ key: `el:${def.kind}` as SectionKey, icon: def.icon, label: def.plural })),
    ].sort((a, b) => a.label.localeCompare(b.label)),
  ];
  return (
    // Two icons per row to keep the rail short now that it lists every element type.
    <nav aria-label="Workspace sections" className="grid h-svh w-[84px] shrink-0 grid-cols-2 content-start justify-items-center gap-0.5 overflow-y-auto border-r bg-[var(--rail)] px-1 py-1.5">
      <button
        type="button"
        title="Back to projects"
        onClick={onGoHome}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      >
        <ChevronLeft className="h-[18px] w-[18px]" />
      </button>
      {entries.map(({ key, icon: Icon, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            title={label}
            aria-pressed={isActive}
            onClick={() => (key === "all" ? onOpenAll() : onOpenSection(key))}
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-sm transition-colors ${
              isActive ? "bg-sidebar-accent text-primary" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            }`}
          >
            {isActive && <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-primary" />}
            <Icon className="h-[18px] w-[18px]" />
          </button>
        );
      })}
      <button
        type="button"
        title="Settings"
        onClick={onOpenSettings}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      >
        <Settings className="h-[18px] w-[18px]" />
      </button>
    </nav>
  );
}
