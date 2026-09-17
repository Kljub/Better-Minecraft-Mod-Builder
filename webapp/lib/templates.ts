import type { ScreenSpec, ItemSpec, BlockSpec } from "./types";

export interface ScreenTemplate {
  id: string;
  name: string;
  screen: ScreenSpec;
  createdAt: number;
}

export interface ItemTemplate {
  id: string;
  name: string;
  item: ItemSpec;
  createdAt: number;
}

export interface BlockTemplate {
  id: string;
  name: string;
  block: BlockSpec;
  createdAt: number;
}

const TEMPLATES_KEY = "mc-ui-builder-templates";
const ITEM_TEMPLATES_KEY = "mc-ui-builder-item-templates";
const BLOCK_TEMPLATES_KEY = "mc-ui-builder-block-templates";

function loadFrom<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTo<T>(key: string, templates: T[]): void {
  try { localStorage.setItem(key, JSON.stringify(templates)); } catch { /* quota */ }
}

export function loadTemplates(): ScreenTemplate[] { return loadFrom<ScreenTemplate>(TEMPLATES_KEY); }
export function saveTemplates(templates: ScreenTemplate[]): void { saveTo(TEMPLATES_KEY, templates); }

export function loadItemTemplates(): ItemTemplate[] { return loadFrom<ItemTemplate>(ITEM_TEMPLATES_KEY); }
export function saveItemTemplates(templates: ItemTemplate[]): void { saveTo(ITEM_TEMPLATES_KEY, templates); }

// Vanilla-flavored starting points so users have something to fork instead of starting from a
// blank cube — full block *shapes* (stairs/slabs/fences etc, each needing their own multi-variant
// blockstate + Java Block subclass) are a separate, larger follow-up; these are all still plain
// full cubes with vanilla-like stats, editable like any other block afterwards.
const BLOCK_TEMPLATE_PRESETS: BlockTemplate[] = [
  { id: "preset_stone", name: "Stone (vanilla-like)", createdAt: 0, block: {
    id: "custom_stone", displayName: "Custom Stone", texture: "block/stone.png",
    hardness: 1.5, resistance: 6, requiresTool: true, luminance: 0, soundType: "stone", hasItem: true, creativeTab: "custom",
  } },
  { id: "preset_planks", name: "Planks (vanilla-like)", createdAt: 0, block: {
    id: "custom_planks", displayName: "Custom Planks", texture: "block/oak_planks.png",
    hardness: 2, resistance: 3, requiresTool: false, luminance: 0, soundType: "wood", hasItem: true, creativeTab: "custom",
  } },
  { id: "preset_bricks", name: "Bricks (vanilla-like)", createdAt: 0, block: {
    id: "custom_bricks", displayName: "Custom Bricks", texture: "block/bricks.png",
    hardness: 2, resistance: 6, requiresTool: true, luminance: 0, soundType: "stone", hasItem: true, creativeTab: "custom",
  } },
  { id: "preset_glass", name: "Glass (vanilla-like)", createdAt: 0, block: {
    id: "custom_glass", displayName: "Custom Glass", texture: "block/glass.png",
    hardness: 0.3, resistance: 0.3, requiresTool: false, luminance: 0, soundType: "glass", hasItem: true, creativeTab: "custom",
  } },
];

export function loadBlockTemplates(): BlockTemplate[] {
  try {
    const raw = localStorage.getItem(BLOCK_TEMPLATES_KEY);
    if (raw === null) {
      // First-ever load for this browser — seed with the vanilla-flavored presets so the
      // Templates panel isn't empty, then persist so rename/delete behave like normal templates.
      saveTo(BLOCK_TEMPLATES_KEY, BLOCK_TEMPLATE_PRESETS);
      return BLOCK_TEMPLATE_PRESETS;
    }
    const parsed = JSON.parse(raw) as BlockTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
export function saveBlockTemplates(templates: BlockTemplate[]): void { saveTo(BLOCK_TEMPLATES_KEY, templates); }
