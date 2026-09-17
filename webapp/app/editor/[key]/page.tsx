"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { arrayMove } from "@dnd-kit/sortable";
import Canvas from "@/components/Canvas";
import PropertyPanel from "@/components/PropertyPanel";
import ItemBlockPropertyPanel from "@/components/ItemBlockPropertyPanel";
import ItemBlockPreview from "@/components/ItemBlockPreview";
import ArmorPropertyPanel, { type TexTarget } from "@/components/ArmorPropertyPanel";
import ArmorPreview from "@/components/ArmorPreview";
import CustomAttributePropertyPanel from "@/components/CustomAttributePropertyPanel";
import CustomAttributePreview from "@/components/CustomAttributePreview";
import EffectPropertyPanel from "@/components/EffectPropertyPanel";
import EffectPreview from "@/components/EffectPreview";
import PotionPropertyPanel from "@/components/PotionPropertyPanel";
import PotionPreview from "@/components/PotionPreview";
import AchievementPropertyPanel from "@/components/AchievementPropertyPanel";
import AchievementPreview from "@/components/AchievementPreview";
import RecipePropertyPanel from "@/components/RecipePropertyPanel";
import RecipePreview from "@/components/RecipePreview";
import TradePropertyPanel from "@/components/TradePropertyPanel";
import TradePreview from "@/components/TradePreview";
import LootEntryPropertyPanel from "@/components/LootEntryPropertyPanel";
import LootEntryPreview from "@/components/LootEntryPreview";
import BiomePropertyPanel from "@/components/BiomePropertyPanel";
import BiomePreview from "@/components/BiomePreview";
import DimensionPropertyPanel from "@/components/DimensionPropertyPanel";
import DimensionPreview from "@/components/DimensionPreview";
import TextureEditorPanel from "@/components/TextureEditorPanel";
import AppSidebar, { type ActiveDocType } from "@/components/Sidebar";
import Toolbar from "@/components/Toolbar";
import { Button } from "@/components/ui/button";
import { useTextures } from "@/lib/TextureContext";
import TexturePickerModal from "@/components/TexturePickerModal";
import type {
  ScreenSpec, WidgetSpec, ItemSpec, BlockSpec, CreativeTabSpec, CustomAttributeSpec, EffectSpec, PotionSpec,
  AttributeModifierSpec, AchievementSpec, RecipeSpec, TradeSpec, LootEntrySpec, BiomeSpec, DimensionSpec, ArmorSpec,
} from "@/lib/types";
import { generateJavaClass } from "@/lib/generateJavaClass";
import { getWidgetDef } from "@/lib/widgetRegistry";
import { ITEM_DEFAULT, defaultCustomAttribute, suggestCustomAttributeId, slugifyId } from "@/lib/itemRegistry";
import { ARMOR_DEFAULT } from "@/lib/armorRegistry";
import { BLOCK_DEFAULT } from "@/lib/blockRegistry";
import { EFFECT_DEFAULT } from "@/lib/effectRegistry";
import { POTION_DEFAULT } from "@/lib/potionRegistry";
import { ACHIEVEMENT_DEFAULT } from "@/lib/achievementRegistry";
import { RECIPE_DEFAULT } from "@/lib/recipeRegistry";
import { TRADE_DEFAULT } from "@/lib/tradeRegistry";
import { LOOT_ENTRY_DEFAULT } from "@/lib/lootRegistry";
import { BIOME_DEFAULT } from "@/lib/biomeRegistry";
import { DIMENSION_DEFAULT } from "@/lib/dimensionRegistry";
import { SidebarProvider } from "@/components/ui/sidebar";
import { buildContainerSpec, excludeFromExportedWidgets } from "@/components/widgets/inventory_area/inventoryAreaExport";
import { computeInitialSize } from "@/lib/widgetBounds";
import { APP_VERSION, migrateScreenJson, migrateProjectJson } from "@/lib/migrations";
import {
  loadTemplates, saveTemplates, type ScreenTemplate,
  loadItemTemplates, saveItemTemplates, type ItemTemplate,
  loadBlockTemplates, saveBlockTemplates, type BlockTemplate,
} from "@/lib/templates";
import { loadAttributePresets, saveAttributePresets, type AttributePreset } from "@/lib/attributePresets";
import { downloadExport, downloadFullProjectExport } from "@/lib/exportBundle";
import { genId, copyToClipboard } from "@/lib/utils";

function newId(type: string, existing: WidgetSpec[]): string {
  const used = new Set(existing.map(w => w.id));
  let n = 1;
  while (used.has(`${type}_${n}`)) n++;
  return `${type}_${n}`;
}

function newSpecId(prefix: string, existing: { id: string }[]): string {
  const used = new Set(existing.map((s) => s.id));
  let n = 1;
  while (used.has(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}

/** Fresh id for a duplicated entry — "<baseId>_copy", then "_copy2", "_copy3", ... */
function duplicateSpecId(baseId: string, existing: { id: string }[]): string {
  const used = new Set(existing.map((s) => s.id));
  if (!used.has(`${baseId}_copy`)) return `${baseId}_copy`;
  let n = 2;
  while (used.has(`${baseId}_copy${n}`)) n++;
  return `${baseId}_copy${n}`;
}

/** Composes each widget type's own export transform into the final exported ScreenSpec JSON. */
function buildExportedScreen(screen: ScreenSpec): ScreenSpec {
  const widgets = excludeFromExportedWidgets(screen.widgets);
  const container = buildContainerSpec(screen.widgets);
  return { ...screen, widgets, ...(container ? { container } : {}), appVersion: APP_VERSION };
}

interface ProjectFile {
  name: string;
  screens: ScreenSpec[];
  items: ItemSpec[];
  blocks: BlockSpec[];
  armors: ArmorSpec[];
  creativeTabs: CreativeTabSpec[];
  customAttributes: CustomAttributeSpec[];
  effects: EffectSpec[];
  potions: PotionSpec[];
  achievements: AchievementSpec[];
  recipes: RecipeSpec[];
  trades: TradeSpec[];
  lootEntries: LootEntrySpec[];
  biomes: BiomeSpec[];
  dimensions: DimensionSpec[];
  appVersion: string;
}

const MAX_HISTORY = 100;
const PROJECTS_KEY = "mc-ui-builder-projects";
const LAST_PROJECT_KEY = "mc-ui-builder-last-project";

interface HistoryEntry {
  screens: ScreenSpec[];
  items: ItemSpec[];
  blocks: BlockSpec[];
  armors: ArmorSpec[];
  creativeTabs: CreativeTabSpec[];
  customAttributes: CustomAttributeSpec[];
  effects: EffectSpec[];
  potions: PotionSpec[];
  achievements: AchievementSpec[];
  recipes: RecipeSpec[];
  trades: TradeSpec[];
  lootEntries: LootEntrySpec[];
  biomes: BiomeSpec[];
  dimensions: DimensionSpec[];
  activeIdx: number;
  activeDocType: ActiveDocType;
  activeItemIdx: number;
  activeBlockIdx: number;
  activeArmorIdx: number;
  activeAttributeIdx: number;
  activeEffectIdx: number;
  activePotionIdx: number;
  activeAchievementIdx: number;
  activeRecipeIdx: number;
  activeTradeIdx: number;
  activeLootEntryIdx: number;
  activeBiomeIdx: number;
  activeDimensionIdx: number;
}

interface SavedSession {
  history: HistoryEntry[];
  cursor: number;
  gridSize: number;
  showGrid: boolean;
  scale?: number;
}

interface StoredProject {
  key: string;
  session: SavedSession;
  updatedAt: number;
}

function migrateSession(raw: Record<string, unknown>): SavedSession {
  const hist = raw.history as unknown[];
  if (!Array.isArray(hist) || hist.length === 0) return EMPTY_SESSION;
  if ('widgets' in (hist[0] as object)) {
    return {
      ...raw,
      history: (hist as ScreenSpec[]).map(s => ({
        screens: [s], items: [], blocks: [], armors: [], creativeTabs: [], customAttributes: [], effects: [], potions: [],
        achievements: [], recipes: [], trades: [], lootEntries: [], biomes: [], dimensions: [],
        activeIdx: 0, activeDocType: "screen", activeItemIdx: 0, activeBlockIdx: 0, activeArmorIdx: 0, activeAttributeIdx: 0,
        activeEffectIdx: 0, activePotionIdx: 0, activeAchievementIdx: 0, activeRecipeIdx: 0, activeTradeIdx: 0,
        activeLootEntryIdx: 0, activeBiomeIdx: 0, activeDimensionIdx: 0,
      })),
    } as unknown as SavedSession;
  }
  // Backfill items/blocks/armors/creativeTabs/customAttributes/effects/potions/achievements/recipes/
  // trades/lootEntries/biomes/dimensions/activeDocType for sessions saved before those fields existed.
  const normalizedHistory = (hist as Record<string, unknown>[]).map((e) => ({
    screens: e.screens as ScreenSpec[],
    items: (Array.isArray(e.items) ? e.items : []) as ItemSpec[],
    blocks: (Array.isArray(e.blocks) ? e.blocks : []) as BlockSpec[],
    armors: (Array.isArray(e.armors) ? e.armors : []) as ArmorSpec[],
    creativeTabs: (Array.isArray(e.creativeTabs) ? e.creativeTabs : []) as CreativeTabSpec[],
    customAttributes: (Array.isArray(e.customAttributes) ? e.customAttributes : []) as CustomAttributeSpec[],
    effects: (Array.isArray(e.effects) ? e.effects : []) as EffectSpec[],
    potions: (Array.isArray(e.potions) ? e.potions : []) as PotionSpec[],
    achievements: (Array.isArray(e.achievements) ? e.achievements : []) as AchievementSpec[],
    recipes: (Array.isArray(e.recipes) ? e.recipes : []) as RecipeSpec[],
    trades: (Array.isArray(e.trades) ? e.trades : []) as TradeSpec[],
    lootEntries: (Array.isArray(e.lootEntries) ? e.lootEntries : []) as LootEntrySpec[],
    biomes: (Array.isArray(e.biomes) ? e.biomes : []) as BiomeSpec[],
    dimensions: (Array.isArray(e.dimensions) ? e.dimensions : []) as DimensionSpec[],
    activeIdx: (e.activeIdx as number) ?? 0,
    activeDocType: ((e.activeDocType as ActiveDocType) ?? "screen"),
    activeItemIdx: (e.activeItemIdx as number) ?? 0,
    activeAttributeIdx: (e.activeAttributeIdx as number) ?? 0,
    activeBlockIdx: (e.activeBlockIdx as number) ?? 0,
    activeArmorIdx: (e.activeArmorIdx as number) ?? 0,
    activeEffectIdx: (e.activeEffectIdx as number) ?? 0,
    activePotionIdx: (e.activePotionIdx as number) ?? 0,
    activeAchievementIdx: (e.activeAchievementIdx as number) ?? 0,
    activeRecipeIdx: (e.activeRecipeIdx as number) ?? 0,
    activeTradeIdx: (e.activeTradeIdx as number) ?? 0,
    activeLootEntryIdx: (e.activeLootEntryIdx as number) ?? 0,
    activeBiomeIdx: (e.activeBiomeIdx as number) ?? 0,
    activeDimensionIdx: (e.activeDimensionIdx as number) ?? 0,
  }));
  return { ...raw, history: normalizedHistory } as unknown as SavedSession;
}

// Repairs a screen loaded from localStorage or an imported file: old/hand-edited/corrupted
// records can have a missing or non-finite width/height (e.g. NaN), which crashes Canvas's
// height style — fall back to the current default size rather than propagating that.
function normalizeScreen(s: ScreenSpec): ScreenSpec {
  const width = Number.isFinite(s.width) && s.width > 0 ? s.width : 350;
  const height = Number.isFinite(s.height) && s.height > 0 ? s.height : 200;
  return { ...s, width, height, widgets: s.widgets.map((w) => ({ ...w, props: w.props ?? {} })) };
}

function normalizeItem(it: ItemSpec): ItemSpec {
  return { ...ITEM_DEFAULT, ...it };
}

function normalizeBlock(b: BlockSpec): BlockSpec {
  return { ...BLOCK_DEFAULT, ...b };
}

function normalizeArmor(a: ArmorSpec): ArmorSpec {
  return { ...ARMOR_DEFAULT, ...a };
}

function normalizeEffect(e: EffectSpec): EffectSpec {
  return { ...EFFECT_DEFAULT, ...e };
}

function normalizePotion(p: PotionSpec): PotionSpec {
  return { ...POTION_DEFAULT, ...p };
}

function normalizeAchievement(a: AchievementSpec): AchievementSpec {
  return { ...ACHIEVEMENT_DEFAULT, ...a };
}

function normalizeRecipe(r: RecipeSpec): RecipeSpec {
  return { ...RECIPE_DEFAULT, ...r };
}

function normalizeTrade(t: TradeSpec): TradeSpec {
  return { ...TRADE_DEFAULT, ...t };
}

function normalizeLootEntry(l: LootEntrySpec): LootEntrySpec {
  return { ...LOOT_ENTRY_DEFAULT, ...l };
}

function normalizeBiome(b: BiomeSpec): BiomeSpec {
  return { ...BIOME_DEFAULT, ...b };
}

function normalizeDimension(d: DimensionSpec): DimensionSpec {
  return { ...DIMENSION_DEFAULT, ...d };
}

function loadProjects(): StoredProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredProject[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(p => ({
      ...p,
      session: migrateSession(p.session as unknown as Record<string, unknown>),
    }));
  } catch {
    return [];
  }
}

function saveProjects(projects: StoredProject[]): void {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); } catch { /* quota */ }
}


const PLACEHOLDER_SCREEN: ScreenSpec = { id: "main", width: 350, height: 200, widgets: [] };
const EMPTY_SESSION: SavedSession = {
  history: [{
    screens: [PLACEHOLDER_SCREEN], items: [], blocks: [], armors: [], creativeTabs: [], customAttributes: [], effects: [], potions: [],
    achievements: [], recipes: [], trades: [], lootEntries: [], biomes: [], dimensions: [],
    activeIdx: 0, activeDocType: "screen", activeItemIdx: 0, activeBlockIdx: 0, activeArmorIdx: 0, activeAttributeIdx: 0,
    activeEffectIdx: 0, activePotionIdx: 0, activeAchievementIdx: 0, activeRecipeIdx: 0, activeTradeIdx: 0,
    activeLootEntryIdx: 0, activeBiomeIdx: 0, activeDimensionIdx: 0,
  }],
  cursor: 0,
  gridSize: 4,
  showGrid: true,
};

export default function EditorPage() {
  const params = useParams<{ key: string }>();
  const router = useRouter();
  const projectKey = params.key;

  const { reset, extractPack, initialized, ready, setupRequired, packTextures, uploadCustomTexture } = useTextures();
  const [showTextureDebug, setShowTextureDebug] = useState(false);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [templates, setTemplates] = useState<ScreenTemplate[]>([]);
  const [itemTemplates, setItemTemplates] = useState<ItemTemplate[]>([]);
  const [blockTemplates, setBlockTemplates] = useState<BlockTemplate[]>([]);
  const [attributePresets, setAttributePresets] = useState<AttributePreset[]>([]);
  const [textureEditorReturnTo, setTextureEditorReturnTo] = useState<
    | { docType: "item" | "block" | "effect"; index: number }
    | { docType: "armor"; index: number; field: TexTarget }
    | null
  >(null);
  const [textureEditorInitialKey, setTextureEditorInitialKey] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(loadTemplates());
    setItemTemplates(loadItemTemplates());
    setBlockTemplates(loadBlockTemplates());
    setAttributePresets(loadAttributePresets());
  }, []);

  const handleResetTextures = async () => {
    await reset();
    router.replace("/");
  };

  const [history, setHistory] = useState<HistoryEntry[]>(EMPTY_SESSION.history);
  const [cursor, setCursor] = useState(EMPTY_SESSION.cursor);
  const cursorRef = useRef(EMPTY_SESSION.cursor);
  cursorRef.current = cursor;

  const entry = history[cursor];
  const screens = entry.screens;
  const activeIdx = entry.activeIdx;
  const screen = screens[activeIdx];
  const items = entry.items;
  const blocks = entry.blocks;
  const creativeTabs = entry.creativeTabs;
  const customAttributes = entry.customAttributes;
  const effects = entry.effects;
  const potions = entry.potions;
  const achievements = entry.achievements;
  const recipes = entry.recipes;
  const trades = entry.trades;
  const lootEntries = entry.lootEntries;
  const biomes = entry.biomes;
  const dimensions = entry.dimensions;
  const armors = entry.armors;
  const activeDocType = entry.activeDocType;
  const activeItemIdx = entry.activeItemIdx;
  const activeBlockIdx = entry.activeBlockIdx;
  const activeAttributeIdx = entry.activeAttributeIdx;
  const activeEffectIdx = entry.activeEffectIdx;
  const activePotionIdx = entry.activePotionIdx;
  const activeAchievementIdx = entry.activeAchievementIdx;
  const activeRecipeIdx = entry.activeRecipeIdx;
  const activeTradeIdx = entry.activeTradeIdx;
  const activeLootEntryIdx = entry.activeLootEntryIdx;
  const activeBiomeIdx = entry.activeBiomeIdx;
  const activeDimensionIdx = entry.activeDimensionIdx;
  const activeArmorIdx = entry.activeArmorIdx;
  const activeItem = items[activeItemIdx] ?? null;
  const activeBlock = blocks[activeBlockIdx] ?? null;
  const activeCustomAttribute = customAttributes[activeAttributeIdx] ?? null;
  const activeEffect = effects[activeEffectIdx] ?? null;
  const activePotion = potions[activePotionIdx] ?? null;
  const activeAchievement = achievements[activeAchievementIdx] ?? null;
  const activeRecipe = recipes[activeRecipeIdx] ?? null;
  const activeTrade = trades[activeTradeIdx] ?? null;
  const activeLootEntry = lootEntries[activeLootEntryIdx] ?? null;
  const activeBiome = biomes[activeBiomeIdx] ?? null;
  const activeDimension = dimensions[activeDimensionIdx] ?? null;
  const activeArmor = armors[activeArmorIdx] ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multiSelect, setMultiSelect] = useState<{ ids: string[] } | null>(null);
  const [gridSize, setGridSize] = useState(EMPTY_SESSION.gridSize);
  const [showGrid, setShowGrid] = useState(EMPTY_SESSION.showGrid);
  const [snapToParent, setSnapToParent] = useState(true);
  const [snapToSiblings, setSnapToSiblings] = useState(true);
  const [scale, setScale] = useState(3);
  const [tryMode, setTryMode] = useState(false);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const panRef = useRef({ x: 0, y: 0 });
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<WidgetSpec | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const importProjectRef = useRef<HTMLInputElement>(null);

  // Redirect to setup if textures aren't ready after init.
  useEffect(() => {
    if (initialized && setupRequired && !ready) router.replace("/");
  }, [initialized, setupRequired, ready, router]);

  // Load project from localStorage by key.
  useEffect(() => {
    const projects = loadProjects();
    const project = projects.find(p => p.key === projectKey);
    if (!project) {
      router.replace("/");
      return;
    }
    const s = project.session;
    const sanitizedHistory = s.history.map((entry) => ({
      ...entry,
      screens: entry.screens.map(normalizeScreen),
      items: entry.items.map(normalizeItem),
      blocks: entry.blocks.map(normalizeBlock),
      effects: entry.effects.map(normalizeEffect),
      potions: entry.potions.map(normalizePotion),
      achievements: entry.achievements.map(normalizeAchievement),
      recipes: entry.recipes.map(normalizeRecipe),
      trades: entry.trades.map(normalizeTrade),
      lootEntries: entry.lootEntries.map(normalizeLootEntry),
      biomes: entry.biomes.map(normalizeBiome),
      dimensions: entry.dimensions.map(normalizeDimension),
      armors: entry.armors.map(normalizeArmor),
    }));
    setHistory(sanitizedHistory);
    setCursor(s.cursor);
    setGridSize(s.gridSize);
    setShowGrid(s.showGrid);
    if (s.scale) setScale(s.scale);
    setProjectLoaded(true);
    try { localStorage.setItem(LAST_PROJECT_KEY, projectKey); } catch { /* quota */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  // Persist session whenever state changes.
  useEffect(() => {
    if (!projectLoaded) return;
    const projects = loadProjects();
    const updated = projects.map(p =>
      p.key === projectKey
        ? { ...p, session: { history, cursor, gridSize, showGrid, scale }, updatedAt: Date.now() }
        : p
    );
    saveProjects(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, cursor, gridSize, showGrid, scale]);

  const zoomIn  = useCallback(() => setScale((s) => Math.min(s + 1, 8)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 1, 1)), []);
  const computeFit = useCallback(() => {
    const el = canvasWrapperRef.current;
    if (!el) return 3;
    const buf = 64;
    const cw = el.clientWidth  - buf * 2;
    const ch = el.clientHeight - buf * 2;
    if (cw <= 0 || ch <= 0) return 3;
    const sw = cw / ch > 16 / 9 ? ch * (16 / 9) : cw;
    const sh = cw / ch > 16 / 9 ? ch : cw * (9 / 16);
    return Math.max(1, Math.min(8, Math.floor(Math.min(sw / screen.width, sh / screen.height))));
  }, [screen.width, screen.height]);

  const zoomReset = useCallback(() => setScale(computeFit()), [computeFit]);

  const fittedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (fittedForRef.current === projectKey) return;
    fittedForRef.current = projectKey;
    const id = requestAnimationFrame(() => setScale(computeFit()));
    return () => cancelAnimationFrame(id);
  }, [projectKey, computeFit]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = canvasWrapperRef.current;
      if (!el || !el.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      setScale((s) => Math.max(1, Math.min(8, s * Math.pow(0.999, e.deltaY))));
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      const el = canvasWrapperRef.current;
      if (!el || !el.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
      el.style.cursor = "grabbing";
      const startX = e.clientX, startY = e.clientY;
      const startPanX = panRef.current.x, startPanY = panRef.current.y;
      const onMove = (ev: MouseEvent) => {
        const x = startPanX + ev.clientX - startX;
        const y = startPanY + ev.clientY - startY;
        panRef.current = { x, y };
        setPanX(x);
        setPanY(y);
      };
      const onUp = () => {
        el.style.cursor = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("mousedown", onMouseDown, { capture: true });
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("mousedown", onMouseDown, { capture: true });
    };
  }, []);

  const selectedWidget = screen.widgets.find((w) => w.id === selectedId) ?? null;
  const selectedIds = multiSelect && selectedId && multiSelect.ids.includes(selectedId)
    ? multiSelect.ids
    : selectedId ? [selectedId] : [];

  // Cmd/Ctrl-click (canvas or layers tree): add/remove one widget from the
  // current multi-selection. Only allowed within the same parent as the
  // existing selection — group drag/snap assumes all selected widgets are siblings.
  const toggleSelectWidget = useCallback((id: string) => {
    const widget = screen.widgets.find((w) => w.id === id);
    if (!widget) return;
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((i) => i !== id);
      if (next.length <= 1) {
        setMultiSelect(null);
        setSelectedId(next[0] ?? null);
      } else {
        setMultiSelect({ ids: next });
        if (!next.includes(selectedId!)) setSelectedId(next[0]);
      }
      return;
    }
    const anchorParent = selectedIds.length > 0
      ? screen.widgets.find((w) => w.id === selectedIds[0])?.parentId
      : widget.parentId;
    if (selectedIds.length > 0 && widget.parentId !== anchorParent) {
      // Different parent than the current selection — start a fresh selection.
      setMultiSelect(null);
      setSelectedId(id);
      return;
    }
    setMultiSelect({ ids: [...selectedIds, id] });
    setSelectedId(id);
  }, [screen.widgets, selectedId, selectedIds]);

  const selectWidgetInTree = useCallback((id: string, shiftKey: boolean, modKey: boolean) => {
    if (modKey) {
      toggleSelectWidget(id);
      return;
    }
    if (shiftKey && selectedId) {
      const anchor = screen.widgets.find((w) => w.id === selectedId);
      const target = screen.widgets.find((w) => w.id === id);
      if (anchor && target && anchor.parentId === target.parentId) {
        const siblings = screen.widgets.filter((w) => w.parentId === anchor.parentId);
        const i = siblings.findIndex((w) => w.id === anchor.id);
        const j = siblings.findIndex((w) => w.id === target.id);
        const [lo, hi] = i < j ? [i, j] : [j, i];
        setMultiSelect({ ids: siblings.slice(lo, hi + 1).map((w) => w.id) });
        setSelectedId(id);
        return;
      }
    }
    setMultiSelect(null);
    setSelectedId(id);
  }, [screen.widgets, selectedId, toggleSelectWidget]);

  const commit = useCallback((next: HistoryEntry) => {
    const c = cursorRef.current;
    cursorRef.current = Math.min(c + 1, MAX_HISTORY - 1);
    setHistory((h) => {
      const trimmed = h.slice(0, c + 1);
      const capped = trimmed.length >= MAX_HISTORY ? trimmed.slice(1) : trimmed;
      return [...capped, next];
    });
    setCursor(cursorRef.current);
  }, []);

  const commitScreen = useCallback((next: ScreenSpec) => {
    commit({ ...entry, screens: screens.map((s, i) => i === activeIdx ? next : s) });
  }, [entry, screens, activeIdx, commit]);

  const undo = useCallback(() => { setCursor((c) => Math.max(0, c - 1)); setSelectedId(null); }, []);
  const redo = useCallback(() => { setCursor((c) => Math.min(history.length - 1, c + 1)); setSelectedId(null); }, [history.length]);

  const updateWidget = useCallback((updated: WidgetSpec) => {
    // Most callers (drag/resize/nudge) update a widget in place with its id unchanged, so
    // matching on updated.id finds it. Renaming a widget's id (PropertyPanel's ID field) is the
    // one case where updated.id is the new, not-yet-present id — fall back to selectedId then.
    const matchId = screen.widgets.some((w) => w.id === updated.id) ? updated.id : selectedId;
    commitScreen({ ...screen, widgets: screen.widgets.map((w) => (w.id === matchId ? updated : w)) });
    if (updated.id !== selectedId) setSelectedId(updated.id);
  }, [screen, commitScreen, selectedId]);

  const toggleHiddenWidget = useCallback((id: string) => {
    const widget = screen.widgets.find(w => w.id === id);
    if (!widget) return;
    commitScreen({ ...screen, widgets: screen.widgets.map(w => w.id === id ? { ...w, hidden: !w.hidden } : w) });
  }, [screen, commitScreen]);

  const renameWidget = useCallback((id: string, name: string) => {
    const widget = screen.widgets.find(w => w.id === id);
    if (!widget) return;
    updateWidget({ ...widget, id: name });
  }, [screen, updateWidget]);

  const deleteWidget = useCallback((id = selectedId) => {
    if (!id) return;
    const target = screen.widgets.find(w => w.id === id);
    if (target?.type === "tab" && target.parentId) {
      const siblings = screen.widgets.filter(w => w.type === "tab" && w.parentId === target.parentId);
      if (siblings.length <= 1) return;
    }
    const collectDescendants = (rootId: string, all: WidgetSpec[]): Set<string> => {
      const ids = new Set<string>([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const w of all) {
          if (w.parentId && ids.has(w.parentId) && !ids.has(w.id)) {
            ids.add(w.id);
            changed = true;
          }
        }
      }
      return ids;
    };
    const toRemove = collectDescendants(id, screen.widgets);
    commitScreen({ ...screen, widgets: screen.widgets.filter((w) => !toRemove.has(w.id)) });
    setSelectedId(null);
  }, [screen, commitScreen, selectedId]);

  const addWidget = useCallback((type: string, parentId?: string, atX?: number, atY?: number) => {
    const def = getWidgetDef(type);
    if (!def) return;
    const id = newId(type, screen.widgets);
    const pos = atX !== undefined && atY !== undefined ? { x: atX, y: atY } : {};
    const sizeClamp = computeInitialSize(def.defaultWidget.w, def.defaultWidget.h, parentId, screen.widgets);
    const widget: WidgetSpec = { ...def.defaultWidget, id, ...sizeClamp, ...pos, ...(parentId ? { parentId } : {}) };
    const extra: WidgetSpec[] = [];
    if (type === "tabs") {
      const tabDef = getWidgetDef("tab");
      if (tabDef) extra.push({ ...tabDef.defaultWidget, id: newId("tab", [...screen.widgets, widget]), parentId: id });
    }
    commitScreen({ ...screen, widgets: [...screen.widgets, widget, ...extra] });
    setSelectedId(id);
  }, [screen, commitScreen]);

  const reorderWidget = useCallback((draggedIds: string[], overId: string, placement: "before" | "after" | "inside") => {
    if (draggedIds.length === 0 || draggedIds.includes(overId)) return;
    const widgets = screen.widgets;
    const draggedSet = new Set(draggedIds);
    const over = widgets.find(w => w.id === overId);
    if (!over) return;

    const absPos = (wid: string): { x: number; y: number } => {
      const w = widgets.find(v => v.id === wid);
      if (!w) return { x: 0, y: 0 };
      if (!w.parentId) return { x: w.x, y: w.y };
      const parent = absPos(w.parentId);
      return { x: parent.x + w.x, y: parent.y + w.y };
    };

    const newParentId: string | undefined = placement === "inside" ? overId : over.parentId;

    const isSelfOrDescendant = (candidate: string | undefined): boolean => {
      let cur = candidate;
      while (cur) {
        if (draggedSet.has(cur)) return true;
        cur = widgets.find(w => w.id === cur)?.parentId;
      }
      return false;
    };
    if (newParentId && isSelfOrDescendant(newParentId)) return;

    const newParentAbs = newParentId ? absPos(newParentId) : { x: 0, y: 0 };
    const without = widgets.filter(w => !draggedSet.has(w.id));
    const overIdx = without.findIndex(w => w.id === overId);
    const insertIdx = placement === "before" ? overIdx : overIdx + 1;
    const orderedDragged = widgets.filter(w => draggedSet.has(w.id));
    const updatedDragged = orderedDragged.map(w => {
      const abs = absPos(w.id);
      return { ...w, x: abs.x - newParentAbs.x, y: abs.y - newParentAbs.y, parentId: newParentId };
    });
    commitScreen({ ...screen, widgets: [...without.slice(0, insertIdx), ...updatedDragged, ...without.slice(insertIdx)] });
  }, [screen, commitScreen]);

  const updateBindingsSchema = useCallback((schema: import("@/lib/types").BindingsSchema) => {
    commitScreen({ ...screen, bindingsSchema: Object.keys(schema).length ? schema : undefined });
  }, [screen, commitScreen]);

  const updateActions = useCallback((actions: string[]) => {
    commitScreen({ ...screen, actions: actions.length ? actions : undefined });
  }, [screen, commitScreen]);

  const reparentWidget = useCallback((id: string, newParentId: string | null) => {
    const widget = screen.widgets.find(w => w.id === id);
    if (!widget) return;
    const absPos = (wid: string): { x: number; y: number } => {
      const w = screen.widgets.find(v => v.id === wid);
      if (!w) return { x: 0, y: 0 };
      if (!w.parentId) return { x: w.x, y: w.y };
      const parent = absPos(w.parentId);
      return { x: parent.x + w.x, y: parent.y + w.y };
    };
    const current = absPos(id);
    const newParentAbs = newParentId ? absPos(newParentId) : { x: 0, y: 0 };
    commitScreen({
      ...screen,
      widgets: screen.widgets.map(w =>
        w.id === id ? { ...w, x: current.x - newParentAbs.x, y: current.y - newParentAbs.y, parentId: newParentId ?? undefined } : w
      ),
    });
  }, [screen, commitScreen]);

  const copyWidget    = useCallback(() => { if (selectedWidget) clipboardRef.current = selectedWidget; }, [selectedWidget]);
  const pasteWidget   = useCallback(() => {
    const src = clipboardRef.current;
    if (!src) return;
    const id = newId(src.type, screen.widgets);
    commitScreen({ ...screen, widgets: [...screen.widgets, { ...src, id, x: src.x + 8, y: src.y + 8 }] });
    setSelectedId(id);
  }, [screen, commitScreen]);
  const duplicateWidget = useCallback(() => {
    if (!selectedWidget) return;
    const id = newId(selectedWidget.type, screen.widgets);
    commitScreen({ ...screen, widgets: [...screen.widgets, { ...selectedWidget, id, x: selectedWidget.x + 8, y: selectedWidget.y + 8 }] });
    setSelectedId(id);
  }, [screen, commitScreen, selectedWidget]);
  const nudgeWidget = useCallback((dx: number, dy: number) => {
    if (!selectedWidget) return;
    updateWidget({ ...selectedWidget, x: selectedWidget.x + dx, y: selectedWidget.y + dy });
  }, [selectedWidget, updateWidget]);

  const rotateWidget = useCallback(() => {
    if (!selectedWidget) return;
    const def = getWidgetDef(selectedWidget.type);
    if (!def?.propSchema.some((f) => f.key === "rotation")) return;
    const current = parseInt(selectedWidget.props.rotation ?? "0", 10);
    const next = (current + 90) % 360;
    // Every 90deg step swaps which axis is "long" — swap w/h around the widget's own
    // center so the selection box/hit-testing keep matching the rotated visual footprint
    // instead of the stale unrotated one (see SpecWidgetRenderer.renderHeartBar for the
    // equivalent in-game rotation).
    const { w, h, x, y } = selectedWidget;
    const newW = h, newH = w;
    const newX = x + (w - newW) / 2;
    const newY = y + (h - newH) / 2;
    updateWidget({
      ...selectedWidget,
      x: newX, y: newY, w: newW, h: newH,
      props: { ...selectedWidget.props, rotation: next.toString() },
    });
  }, [selectedWidget, updateWidget]);

  // Centers the current selection (one or more widgets) as a group within its parent's bounds
  // (or the screen, for root-level widgets) — shifts every selected widget by the same delta so
  // their combined bounding box lands centered, preserving their relative arrangement rather
  // than centering each one individually (which would just stack them on top of each other).
  const centerSelection = useCallback((axis: "horizontal" | "vertical") => {
    if (selectedIds.length === 0) return;
    const targets = screen.widgets.filter((w) => selectedIds.includes(w.id));
    if (targets.length === 0) return;
    const parent = targets[0].parentId ? screen.widgets.find((w) => w.id === targets[0].parentId) : undefined;
    const containerW = parent ? parent.w : screen.width;
    const containerH = parent ? parent.h : screen.height;

    const minX = Math.min(...targets.map((w) => w.x));
    const maxX = Math.max(...targets.map((w) => w.x + w.w));
    const minY = Math.min(...targets.map((w) => w.y));
    const maxY = Math.max(...targets.map((w) => w.y + w.h));

    const dx = axis === "horizontal" ? containerW / 2 - (minX + maxX) / 2 : 0;
    const dy = axis === "vertical" ? containerH / 2 - (minY + maxY) / 2 : 0;
    if (dx === 0 && dy === 0) return;

    const targetIds = new Set(targets.map((w) => w.id));
    commitScreen({
      ...screen,
      widgets: screen.widgets.map((w) => (targetIds.has(w.id) ? { ...w, x: w.x + dx, y: w.y + dy } : w)),
    });
  }, [selectedIds, screen, commitScreen]);

  const addScreen = useCallback(() => {
    const newScreen: ScreenSpec = { id: `screen_${screens.length + 1}`, modId: screen.modId, width: 350, height: 200, widgets: [] };
    commit({ ...entry, screens: [...screens, newScreen], activeIdx: screens.length, activeDocType: "screen" });
    setSelectedId(null);
  }, [entry, screens, screen.modId, commit]);

  const removeScreen = useCallback((idx: number) => {
    if (screens.length <= 1) return;
    const next = screens.filter((_, i) => i !== idx);
    const newActiveIdx = idx < activeIdx ? activeIdx - 1 : idx === activeIdx ? Math.min(activeIdx, next.length - 1) : activeIdx;
    commit({ ...entry, screens: next, activeIdx: newActiveIdx, activeDocType: "screen" });
    setSelectedId(null);
  }, [entry, screens, activeIdx, commit]);

  const renameScreen = useCallback((idx: number, name: string) => {
    commit({ ...entry, screens: screens.map((s, i) => i === idx ? { ...s, id: name } : s) });
  }, [entry, screens, commit]);

  const moveScreen = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const next = arrayMove(screens, fromIdx, toIdx);
    const newActiveIdx = fromIdx === activeIdx ? toIdx
      : fromIdx < activeIdx && toIdx >= activeIdx ? activeIdx - 1
      : fromIdx > activeIdx && toIdx <= activeIdx ? activeIdx + 1
      : activeIdx;
    commit({ ...entry, screens: next, activeIdx: newActiveIdx });
  }, [entry, screens, activeIdx, commit]);

  const switchScreen = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeIdx: idx, activeDocType: "screen" } : e));
    setSelectedId(null);
  }, [cursor]);

  const switchItem = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeItemIdx: idx, activeDocType: "item" } : e));
  }, [cursor]);

  const addItem = useCallback(() => {
    const id = newSpecId("item", items);
    const newItem: ItemSpec = { ...ITEM_DEFAULT, id };
    commit({ ...entry, items: [...items, newItem], activeItemIdx: items.length, activeDocType: "item" });
  }, [entry, items, commit]);

  const removeItem = useCallback((idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    const newActiveItemIdx = Math.max(0, idx < activeItemIdx ? activeItemIdx - 1 : Math.min(activeItemIdx, next.length - 1));
    commit({ ...entry, items: next, activeItemIdx: newActiveItemIdx });
  }, [entry, items, activeItemIdx, commit]);

  const renameItem = useCallback((idx: number, name: string) => {
    commit({ ...entry, items: items.map((it, i) => i === idx ? { ...it, id: name } : it) });
  }, [entry, items, commit]);

  const duplicateItem = useCallback((idx: number) => {
    const original = items[idx];
    if (!original) return;
    const copy: ItemSpec = { ...original, id: duplicateSpecId(original.id, items) };
    const next = [...items.slice(0, idx + 1), copy, ...items.slice(idx + 1)];
    commit({ ...entry, items: next, activeItemIdx: idx + 1, activeDocType: "item" });
  }, [entry, items, commit]);

  const updateItem = useCallback((updated: ItemSpec) => {
    commit({ ...entry, items: items.map((it, i) => i === activeItemIdx ? updated : it) });
  }, [entry, items, activeItemIdx, commit]);

  const switchBlock = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeBlockIdx: idx, activeDocType: "block" } : e));
  }, [cursor]);

  const addBlock = useCallback(() => {
    const id = newSpecId("block", blocks);
    const newBlock: BlockSpec = { ...BLOCK_DEFAULT, id };
    commit({ ...entry, blocks: [...blocks, newBlock], activeBlockIdx: blocks.length, activeDocType: "block" });
  }, [entry, blocks, commit]);

  const removeBlock = useCallback((idx: number) => {
    const next = blocks.filter((_, i) => i !== idx);
    const newActiveBlockIdx = Math.max(0, idx < activeBlockIdx ? activeBlockIdx - 1 : Math.min(activeBlockIdx, next.length - 1));
    commit({ ...entry, blocks: next, activeBlockIdx: newActiveBlockIdx });
  }, [entry, blocks, activeBlockIdx, commit]);

  const renameBlock = useCallback((idx: number, name: string) => {
    commit({ ...entry, blocks: blocks.map((b, i) => i === idx ? { ...b, id: name } : b) });
  }, [entry, blocks, commit]);

  const duplicateBlock = useCallback((idx: number) => {
    const original = blocks[idx];
    if (!original) return;
    const copy: BlockSpec = { ...original, id: duplicateSpecId(original.id, blocks) };
    const next = [...blocks.slice(0, idx + 1), copy, ...blocks.slice(idx + 1)];
    commit({ ...entry, blocks: next, activeBlockIdx: idx + 1, activeDocType: "block" });
  }, [entry, blocks, commit]);

  const updateBlock = useCallback((updated: BlockSpec) => {
    commit({ ...entry, blocks: blocks.map((b, i) => i === activeBlockIdx ? updated : b) });
  }, [entry, blocks, activeBlockIdx, commit]);

  const addCreativeTab = useCallback(() => {
    const name = window.prompt("Creative tab name:");
    if (!name || !name.trim()) return;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    const id = slug || `tab_${creativeTabs.length + 1}`;
    commit({ ...entry, creativeTabs: [...creativeTabs, { id, displayName: name.trim() }] });
  }, [entry, creativeTabs, commit]);

  const renameCreativeTab = useCallback((idx: number, displayName: string) => {
    commit({ ...entry, creativeTabs: creativeTabs.map((t, i) => i === idx ? { ...t, displayName } : t) });
  }, [entry, creativeTabs, commit]);

  const removeCreativeTab = useCallback((idx: number) => {
    commit({ ...entry, creativeTabs: creativeTabs.filter((_, i) => i !== idx) });
  }, [entry, creativeTabs, commit]);

  // Bulk "export just this category" — a middle ground between exporting one single doc and the
  // whole project (screens+items+blocks+... all together). Also used to seed new custom-attribute
  // ids as "{project}_{displayname}" (see addCustomAttribute below).
  const friendlyModId = useCallback(() => {
    return (
      screens.find((s) => s.modId?.trim())?.modId?.trim() ||
      items.find((i) => i.modId?.trim())?.modId?.trim() ||
      blocks.find((b) => b.modId?.trim())?.modId?.trim() ||
      effects.find((e) => e.modId?.trim())?.modId?.trim() ||
      potions.find((p) => p.modId?.trim())?.modId?.trim() ||
      achievements.find((a) => a.modId?.trim())?.modId?.trim() ||
      recipes.find((r) => r.modId?.trim())?.modId?.trim() ||
      trades.find((t) => t.modId?.trim())?.modId?.trim() ||
      lootEntries.find((l) => l.modId?.trim())?.modId?.trim() ||
      biomes.find((b) => b.modId?.trim())?.modId?.trim() ||
      dimensions.find((d) => d.modId?.trim())?.modId?.trim() ||
      armors.find((a) => a.modId?.trim())?.modId?.trim() ||
      projectKey
    );
  }, [screens, items, blocks, effects, potions, achievements, recipes, trades, lootEntries, biomes, dimensions, armors, projectKey]);

  const switchCustomAttribute = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeAttributeIdx: idx, activeDocType: "attribute" } : e));
  }, [cursor]);

  const addCustomAttribute = useCallback(() => {
    const displayName = "New Attribute";
    const base = suggestCustomAttributeId(friendlyModId(), displayName);
    let id = base, n = 2;
    while (customAttributes.some((a) => a.id === id)) { id = `${base}_${n}`; n++; }
    commit({ ...entry, customAttributes: [...customAttributes, { ...defaultCustomAttribute(id), displayName }], activeAttributeIdx: customAttributes.length, activeDocType: "attribute" });
  }, [entry, customAttributes, commit, friendlyModId]);

  /** Renames a custom attribute's id (not just its displayName) — the id is what items/effects
   * actually reference in their attribute-modifier lists, so existing references are rewritten too. */
  const renameCustomAttributeId = useCallback((idx: number, rawId: string) => {
    const oldId = customAttributes[idx]?.id;
    const id = slugifyId(rawId) || oldId;
    if (!oldId || id === oldId) return;
    if (customAttributes.some((a, i) => i !== idx && a.id === id)) {
      alert(`Attribute id "${id}" is already in use.`);
      return;
    }
    const rewriteMods = (mods?: AttributeModifierSpec[]) =>
      mods?.map((m) => m.attribute === oldId ? { ...m, attribute: id } : m);
    commit({
      ...entry,
      customAttributes: customAttributes.map((a, i) => i === idx ? { ...a, id } : a),
      items: items.map((it) => it.attributes ? { ...it, attributes: rewriteMods(it.attributes) } : it),
      effects: effects.map((ef) => ef.attributes ? { ...ef, attributes: rewriteMods(ef.attributes) } : ef),
    });
  }, [entry, customAttributes, items, effects, commit]);

  const updateCustomAttribute = useCallback((idx: number, patch: Partial<CustomAttributeSpec>) => {
    commit({ ...entry, customAttributes: customAttributes.map((a, i) => i === idx ? { ...a, ...patch } : a) });
  }, [entry, customAttributes, commit]);

  const duplicateCustomAttribute = useCallback((idx: number) => {
    const original = customAttributes[idx];
    if (!original) return;
    const copy: CustomAttributeSpec = { ...original, id: duplicateSpecId(original.id, customAttributes) };
    const next = [...customAttributes.slice(0, idx + 1), copy, ...customAttributes.slice(idx + 1)];
    commit({ ...entry, customAttributes: next, activeAttributeIdx: idx + 1, activeDocType: "attribute" });
  }, [entry, customAttributes, commit]);

  const removeCustomAttribute = useCallback((idx: number) => {
    if (customAttributes.length <= 0) return;
    const next = customAttributes.filter((_, i) => i !== idx);
    const newActiveAttributeIdx = Math.max(0, idx < activeAttributeIdx ? activeAttributeIdx - 1 : Math.min(activeAttributeIdx, next.length - 1));
    commit({ ...entry, customAttributes: next, activeAttributeIdx: newActiveAttributeIdx });
  }, [entry, customAttributes, activeAttributeIdx, commit]);

  const switchEffect = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeEffectIdx: idx, activeDocType: "effect" } : e));
  }, [cursor]);

  const addEffect = useCallback(() => {
    const id = newSpecId("effect", effects);
    commit({ ...entry, effects: [...effects, { ...EFFECT_DEFAULT, id }], activeEffectIdx: effects.length, activeDocType: "effect" });
  }, [entry, effects, commit]);

  const renameEffect = useCallback((idx: number, name: string) => {
    commit({ ...entry, effects: effects.map((e, i) => i === idx ? { ...e, id: name } : e) });
  }, [entry, effects, commit]);

  const duplicateEffect = useCallback((idx: number) => {
    const original = effects[idx];
    if (!original) return;
    const copy: EffectSpec = { ...original, id: duplicateSpecId(original.id, effects) };
    const next = [...effects.slice(0, idx + 1), copy, ...effects.slice(idx + 1)];
    commit({ ...entry, effects: next, activeEffectIdx: idx + 1, activeDocType: "effect" });
  }, [entry, effects, commit]);

  const updateEffect = useCallback((idx: number, patch: Partial<EffectSpec>) => {
    commit({ ...entry, effects: effects.map((e, i) => i === idx ? { ...e, ...patch } : e) });
  }, [entry, effects, commit]);

  const removeEffect = useCallback((idx: number) => {
    const next = effects.filter((_, i) => i !== idx);
    const newActiveEffectIdx = Math.max(0, idx < activeEffectIdx ? activeEffectIdx - 1 : Math.min(activeEffectIdx, next.length - 1));
    commit({ ...entry, effects: next, activeEffectIdx: newActiveEffectIdx });
  }, [entry, effects, activeEffectIdx, commit]);

  const switchPotion = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activePotionIdx: idx, activeDocType: "potion" } : e));
  }, [cursor]);

  const addPotion = useCallback(() => {
    const id = newSpecId("potion", potions);
    commit({ ...entry, potions: [...potions, { ...POTION_DEFAULT, id }], activePotionIdx: potions.length, activeDocType: "potion" });
  }, [entry, potions, commit]);

  const renamePotion = useCallback((idx: number, name: string) => {
    commit({ ...entry, potions: potions.map((p, i) => i === idx ? { ...p, id: name } : p) });
  }, [entry, potions, commit]);

  const updatePotion = useCallback((idx: number, patch: Partial<PotionSpec>) => {
    commit({ ...entry, potions: potions.map((p, i) => i === idx ? { ...p, ...patch } : p) });
  }, [entry, potions, commit]);

  const duplicatePotion = useCallback((idx: number) => {
    const original = potions[idx];
    if (!original) return;
    const copy: PotionSpec = { ...original, id: duplicateSpecId(original.id, potions) };
    const next = [...potions.slice(0, idx + 1), copy, ...potions.slice(idx + 1)];
    commit({ ...entry, potions: next, activePotionIdx: idx + 1, activeDocType: "potion" });
  }, [entry, potions, commit]);

  const removePotion = useCallback((idx: number) => {
    const next = potions.filter((_, i) => i !== idx);
    const newActivePotionIdx = Math.max(0, idx < activePotionIdx ? activePotionIdx - 1 : Math.min(activePotionIdx, next.length - 1));
    commit({ ...entry, potions: next, activePotionIdx: newActivePotionIdx });
  }, [entry, potions, activePotionIdx, commit]);

  const switchAchievement = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeAchievementIdx: idx, activeDocType: "achievement" } : e));
  }, [cursor]);

  const addAchievement = useCallback(() => {
    const id = newSpecId("achievement", achievements);
    commit({ ...entry, achievements: [...achievements, { ...ACHIEVEMENT_DEFAULT, id }], activeAchievementIdx: achievements.length, activeDocType: "achievement" });
  }, [entry, achievements, commit]);

  const renameAchievement = useCallback((idx: number, name: string) => {
    commit({ ...entry, achievements: achievements.map((a, i) => i === idx ? { ...a, id: name } : a) });
  }, [entry, achievements, commit]);

  const updateAchievement = useCallback((idx: number, patch: Partial<AchievementSpec>) => {
    commit({ ...entry, achievements: achievements.map((a, i) => i === idx ? { ...a, ...patch } : a) });
  }, [entry, achievements, commit]);

  const duplicateAchievement = useCallback((idx: number) => {
    const original = achievements[idx];
    if (!original) return;
    const copy: AchievementSpec = { ...original, id: duplicateSpecId(original.id, achievements) };
    const next = [...achievements.slice(0, idx + 1), copy, ...achievements.slice(idx + 1)];
    commit({ ...entry, achievements: next, activeAchievementIdx: idx + 1, activeDocType: "achievement" });
  }, [entry, achievements, commit]);

  const removeAchievement = useCallback((idx: number) => {
    const next = achievements.filter((_, i) => i !== idx);
    const newActiveAchievementIdx = Math.max(0, idx < activeAchievementIdx ? activeAchievementIdx - 1 : Math.min(activeAchievementIdx, next.length - 1));
    commit({ ...entry, achievements: next, activeAchievementIdx: newActiveAchievementIdx });
  }, [entry, achievements, activeAchievementIdx, commit]);

  const switchRecipe = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeRecipeIdx: idx, activeDocType: "recipe" } : e));
  }, [cursor]);

  const addRecipe = useCallback(() => {
    const id = newSpecId("recipe", recipes);
    commit({ ...entry, recipes: [...recipes, { ...RECIPE_DEFAULT, id }], activeRecipeIdx: recipes.length, activeDocType: "recipe" });
  }, [entry, recipes, commit]);

  const renameRecipe = useCallback((idx: number, name: string) => {
    commit({ ...entry, recipes: recipes.map((r, i) => i === idx ? { ...r, id: name } : r) });
  }, [entry, recipes, commit]);

  const updateRecipe = useCallback((idx: number, patch: Partial<RecipeSpec>) => {
    commit({ ...entry, recipes: recipes.map((r, i) => i === idx ? { ...r, ...patch } : r) });
  }, [entry, recipes, commit]);

  const duplicateRecipe = useCallback((idx: number) => {
    const original = recipes[idx];
    if (!original) return;
    const copy: RecipeSpec = { ...original, id: duplicateSpecId(original.id, recipes) };
    const next = [...recipes.slice(0, idx + 1), copy, ...recipes.slice(idx + 1)];
    commit({ ...entry, recipes: next, activeRecipeIdx: idx + 1, activeDocType: "recipe" });
  }, [entry, recipes, commit]);

  const removeRecipe = useCallback((idx: number) => {
    const next = recipes.filter((_, i) => i !== idx);
    const newActiveRecipeIdx = Math.max(0, idx < activeRecipeIdx ? activeRecipeIdx - 1 : Math.min(activeRecipeIdx, next.length - 1));
    commit({ ...entry, recipes: next, activeRecipeIdx: newActiveRecipeIdx });
  }, [entry, recipes, activeRecipeIdx, commit]);

  const switchTrade = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeTradeIdx: idx, activeDocType: "trade" } : e));
  }, [cursor]);

  const addTrade = useCallback(() => {
    const id = newSpecId("trade", trades);
    commit({ ...entry, trades: [...trades, { ...TRADE_DEFAULT, id }], activeTradeIdx: trades.length, activeDocType: "trade" });
  }, [entry, trades, commit]);

  const renameTrade = useCallback((idx: number, name: string) => {
    commit({ ...entry, trades: trades.map((t, i) => i === idx ? { ...t, id: name } : t) });
  }, [entry, trades, commit]);

  const updateTrade = useCallback((idx: number, patch: Partial<TradeSpec>) => {
    commit({ ...entry, trades: trades.map((t, i) => i === idx ? { ...t, ...patch } : t) });
  }, [entry, trades, commit]);

  const duplicateTrade = useCallback((idx: number) => {
    const original = trades[idx];
    if (!original) return;
    const copy: TradeSpec = { ...original, id: duplicateSpecId(original.id, trades) };
    const next = [...trades.slice(0, idx + 1), copy, ...trades.slice(idx + 1)];
    commit({ ...entry, trades: next, activeTradeIdx: idx + 1, activeDocType: "trade" });
  }, [entry, trades, commit]);

  const removeTrade = useCallback((idx: number) => {
    const next = trades.filter((_, i) => i !== idx);
    const newActiveTradeIdx = Math.max(0, idx < activeTradeIdx ? activeTradeIdx - 1 : Math.min(activeTradeIdx, next.length - 1));
    commit({ ...entry, trades: next, activeTradeIdx: newActiveTradeIdx });
  }, [entry, trades, activeTradeIdx, commit]);

  const switchLootEntry = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeLootEntryIdx: idx, activeDocType: "loot" } : e));
  }, [cursor]);

  const addLootEntry = useCallback(() => {
    const id = newSpecId("loot", lootEntries);
    commit({ ...entry, lootEntries: [...lootEntries, { ...LOOT_ENTRY_DEFAULT, id }], activeLootEntryIdx: lootEntries.length, activeDocType: "loot" });
  }, [entry, lootEntries, commit]);

  const renameLootEntry = useCallback((idx: number, name: string) => {
    commit({ ...entry, lootEntries: lootEntries.map((l, i) => i === idx ? { ...l, id: name } : l) });
  }, [entry, lootEntries, commit]);

  const updateLootEntry = useCallback((idx: number, patch: Partial<LootEntrySpec>) => {
    commit({ ...entry, lootEntries: lootEntries.map((l, i) => i === idx ? { ...l, ...patch } : l) });
  }, [entry, lootEntries, commit]);

  const duplicateLootEntry = useCallback((idx: number) => {
    const original = lootEntries[idx];
    if (!original) return;
    const copy: LootEntrySpec = { ...original, id: duplicateSpecId(original.id, lootEntries) };
    const next = [...lootEntries.slice(0, idx + 1), copy, ...lootEntries.slice(idx + 1)];
    commit({ ...entry, lootEntries: next, activeLootEntryIdx: idx + 1, activeDocType: "loot" });
  }, [entry, lootEntries, commit]);

  const removeLootEntry = useCallback((idx: number) => {
    const next = lootEntries.filter((_, i) => i !== idx);
    const newActiveLootEntryIdx = Math.max(0, idx < activeLootEntryIdx ? activeLootEntryIdx - 1 : Math.min(activeLootEntryIdx, next.length - 1));
    commit({ ...entry, lootEntries: next, activeLootEntryIdx: newActiveLootEntryIdx });
  }, [entry, lootEntries, activeLootEntryIdx, commit]);

  const switchBiome = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeBiomeIdx: idx, activeDocType: "biome" } : e));
  }, [cursor]);

  const addBiome = useCallback(() => {
    const id = newSpecId("biome", biomes);
    commit({ ...entry, biomes: [...biomes, { ...BIOME_DEFAULT, id }], activeBiomeIdx: biomes.length, activeDocType: "biome" });
  }, [entry, biomes, commit]);

  const renameBiome = useCallback((idx: number, name: string) => {
    commit({ ...entry, biomes: biomes.map((b, i) => i === idx ? { ...b, id: name } : b) });
  }, [entry, biomes, commit]);

  const updateBiome = useCallback((idx: number, patch: Partial<BiomeSpec>) => {
    commit({ ...entry, biomes: biomes.map((b, i) => i === idx ? { ...b, ...patch } : b) });
  }, [entry, biomes, commit]);

  const duplicateBiome = useCallback((idx: number) => {
    const original = biomes[idx];
    if (!original) return;
    const copy: BiomeSpec = { ...original, id: duplicateSpecId(original.id, biomes) };
    const next = [...biomes.slice(0, idx + 1), copy, ...biomes.slice(idx + 1)];
    commit({ ...entry, biomes: next, activeBiomeIdx: idx + 1, activeDocType: "biome" });
  }, [entry, biomes, commit]);

  const removeBiome = useCallback((idx: number) => {
    const next = biomes.filter((_, i) => i !== idx);
    const newActiveBiomeIdx = Math.max(0, idx < activeBiomeIdx ? activeBiomeIdx - 1 : Math.min(activeBiomeIdx, next.length - 1));
    commit({ ...entry, biomes: next, activeBiomeIdx: newActiveBiomeIdx });
  }, [entry, biomes, activeBiomeIdx, commit]);

  const switchDimension = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeDimensionIdx: idx, activeDocType: "dimension" } : e));
  }, [cursor]);

  const addDimension = useCallback(() => {
    const id = newSpecId("dimension", dimensions);
    commit({ ...entry, dimensions: [...dimensions, { ...DIMENSION_DEFAULT, id }], activeDimensionIdx: dimensions.length, activeDocType: "dimension" });
  }, [entry, dimensions, commit]);

  const renameDimension = useCallback((idx: number, name: string) => {
    commit({ ...entry, dimensions: dimensions.map((d, i) => i === idx ? { ...d, id: name } : d) });
  }, [entry, dimensions, commit]);

  const updateDimension = useCallback((idx: number, patch: Partial<DimensionSpec>) => {
    commit({ ...entry, dimensions: dimensions.map((d, i) => i === idx ? { ...d, ...patch } : d) });
  }, [entry, dimensions, commit]);

  const duplicateDimension = useCallback((idx: number) => {
    const original = dimensions[idx];
    if (!original) return;
    const copy: DimensionSpec = { ...original, id: duplicateSpecId(original.id, dimensions) };
    const next = [...dimensions.slice(0, idx + 1), copy, ...dimensions.slice(idx + 1)];
    commit({ ...entry, dimensions: next, activeDimensionIdx: idx + 1, activeDocType: "dimension" });
  }, [entry, dimensions, commit]);

  const removeDimension = useCallback((idx: number) => {
    const next = dimensions.filter((_, i) => i !== idx);
    const newActiveDimensionIdx = Math.max(0, idx < activeDimensionIdx ? activeDimensionIdx - 1 : Math.min(activeDimensionIdx, next.length - 1));
    commit({ ...entry, dimensions: next, activeDimensionIdx: newActiveDimensionIdx });
  }, [entry, dimensions, activeDimensionIdx, commit]);

  const switchArmor = useCallback((idx: number) => {
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeArmorIdx: idx, activeDocType: "armor" } : e));
  }, [cursor]);

  const addArmor = useCallback(() => {
    const id = newSpecId("armor", armors);
    commit({ ...entry, armors: [...armors, { ...ARMOR_DEFAULT, id }], activeArmorIdx: armors.length, activeDocType: "armor" });
  }, [entry, armors, commit]);

  const renameArmor = useCallback((idx: number, name: string) => {
    commit({ ...entry, armors: armors.map((a, i) => i === idx ? { ...a, id: name } : a) });
  }, [entry, armors, commit]);

  const updateArmor = useCallback((idx: number, patch: Partial<ArmorSpec>) => {
    commit({ ...entry, armors: armors.map((a, i) => i === idx ? { ...a, ...patch } : a) });
  }, [entry, armors, commit]);

  const duplicateArmor = useCallback((idx: number) => {
    const original = armors[idx];
    if (!original) return;
    const copy: ArmorSpec = { ...original, id: duplicateSpecId(original.id, armors) };
    const next = [...armors.slice(0, idx + 1), copy, ...armors.slice(idx + 1)];
    commit({ ...entry, armors: next, activeArmorIdx: idx + 1, activeDocType: "armor" });
  }, [entry, armors, commit]);

  const removeArmor = useCallback((idx: number) => {
    const next = armors.filter((_, i) => i !== idx);
    const newActiveArmorIdx = Math.max(0, idx < activeArmorIdx ? activeArmorIdx - 1 : Math.min(activeArmorIdx, next.length - 1));
    commit({ ...entry, armors: next, activeArmorIdx: newActiveArmorIdx });
  }, [entry, armors, activeArmorIdx, commit]);

  const handleSaveAttributePreset = useCallback(() => {
    if (activeDocType !== "item" || !activeItem) return;
    if (!activeItem.attributes || activeItem.attributes.length === 0) {
      alert("The current item has no attributes yet.");
      return;
    }
    const name = window.prompt("Preset name:", activeItem.id);
    if (!name || !name.trim()) return;
    const preset: AttributePreset = { id: genId(), name: name.trim(), attributes: activeItem.attributes, createdAt: Date.now() };
    setAttributePresets((prev) => {
      const next = [...prev, preset];
      saveAttributePresets(next);
      return next;
    });
  }, [activeDocType, activeItem]);

  const handleApplyAttributePreset = useCallback((id: string) => {
    if (activeDocType !== "item" || !activeItem) return;
    const preset = attributePresets.find((p) => p.id === id);
    if (!preset) return;
    updateItem({ ...activeItem, attributes: [...(activeItem.attributes ?? []), ...preset.attributes] });
  }, [activeDocType, activeItem, attributePresets, updateItem]);

  const handleRenameAttributePreset = useCallback((id: string, name: string) => {
    setAttributePresets((prev) => {
      const next = prev.map((p) => p.id === id ? { ...p, name } : p);
      saveAttributePresets(next);
      return next;
    });
  }, []);

  const handleDeleteAttributePreset = useCallback((id: string) => {
    setAttributePresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveAttributePresets(next);
      return next;
    });
  }, []);

  const openTextureEditor = useCallback((returnTo?: { docType: "item" | "block" | "effect"; index: number } | { docType: "armor"; index: number; field: TexTarget }) => {
    setTextureEditorReturnTo(returnTo ?? null);
    setTextureEditorInitialKey(null);
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeDocType: "texture" } : e));
  }, [cursor]);

  /** Reopens an already-created custom texture (see the "My Textures" sidebar gallery) for
   * further editing — loads it onto the canvas on mount, standalone (no item/block to write back
   * to on save, same as a fresh "Texture Editor" open). */
  const openExistingTexture = useCallback((key: string) => {
    setTextureEditorReturnTo(null);
    setTextureEditorInitialKey(key);
    setHistory(h => h.map((e, i) => i === cursor ? { ...e, activeDocType: "texture" } : e));
  }, [cursor]);

  const handleTextureEditorSave = useCallback((key: string) => {
    if (!textureEditorReturnTo) return; // standalone use — texture is already saved as a pack texture
    const index = textureEditorReturnTo.index;
    if (textureEditorReturnTo.docType === "armor") {
      const field = textureEditorReturnTo.field;
      commit({ ...entry, armors: armors.map((a, i) => i === index ? { ...a, [field]: key } : a), activeDocType: "armor", activeArmorIdx: index });
    } else if (textureEditorReturnTo.docType === "item") {
      commit({ ...entry, items: items.map((it, i) => i === index ? { ...it, texture: key } : it), activeDocType: "item", activeItemIdx: index });
    } else if (textureEditorReturnTo.docType === "block") {
      commit({ ...entry, blocks: blocks.map((b, i) => i === index ? { ...b, texture: key } : b), activeDocType: "block", activeBlockIdx: index });
    } else {
      commit({ ...entry, effects: effects.map((ef, i) => i === index ? { ...ef, icon: key } : ef), activeDocType: "effect", activeEffectIdx: index });
    }
    setTextureEditorReturnTo(null);
  }, [textureEditorReturnTo, entry, items, blocks, armors, effects, commit]);

  const handleTextureEditorBack = useCallback(() => {
    const returnTo = textureEditorReturnTo;
    setTextureEditorReturnTo(null);
    setHistory(h => h.map((e, i) => {
      if (i !== cursor) return e;
      if (returnTo) {
        if (returnTo.docType === "armor") return { ...e, activeDocType: "armor", activeArmorIdx: returnTo.index };
        if (returnTo.docType === "item") return { ...e, activeDocType: "item", activeItemIdx: returnTo.index };
        if (returnTo.docType === "block") return { ...e, activeDocType: "block", activeBlockIdx: returnTo.index };
        return { ...e, activeDocType: "effect", activeEffectIdx: returnTo.index };
      }
      return { ...e, activeDocType: "screen" };
    }));
  }, [textureEditorReturnTo, cursor]);

  const handleSaveTemplate = useCallback(() => {
    if (activeDocType === "item") {
      if (!activeItem) return;
      const name = window.prompt("Template name:", activeItem.id);
      if (!name || !name.trim()) return;
      const template: ItemTemplate = { id: genId(), name: name.trim(), item: activeItem, createdAt: Date.now() };
      setItemTemplates((prev) => { const next = [...prev, template]; saveItemTemplates(next); return next; });
      return;
    }
    if (activeDocType === "block") {
      if (!activeBlock) return;
      const name = window.prompt("Template name:", activeBlock.id);
      if (!name || !name.trim()) return;
      const template: BlockTemplate = { id: genId(), name: name.trim(), block: activeBlock, createdAt: Date.now() };
      setBlockTemplates((prev) => { const next = [...prev, template]; saveBlockTemplates(next); return next; });
      return;
    }
    const name = window.prompt("Template name:", screen.id);
    if (!name || !name.trim()) return;
    const template: ScreenTemplate = {
      id: genId(),
      name: name.trim(),
      screen,
      createdAt: Date.now(),
    };
    setTemplates((prev) => {
      const next = [...prev, template];
      saveTemplates(next);
      return next;
    });
  }, [activeDocType, activeItem, activeBlock, screen]);

  const handleInsertTemplate = useCallback((id: string) => {
    if (activeDocType === "item") {
      const template = itemTemplates.find((t) => t.id === id);
      if (!template) return;
      const existingIds = new Set(items.map((it) => it.id));
      let itemId = template.item.id;
      let suffix = 2;
      while (existingIds.has(itemId)) itemId = `${template.item.id}_${suffix++}`;
      const newItem: ItemSpec = { ...template.item, id: itemId };
      commit({ ...entry, items: [...items, newItem], activeItemIdx: items.length, activeDocType: "item" });
      return;
    }
    if (activeDocType === "block") {
      const template = blockTemplates.find((t) => t.id === id);
      if (!template) return;
      const existingIds = new Set(blocks.map((b) => b.id));
      let blockId = template.block.id;
      let suffix = 2;
      while (existingIds.has(blockId)) blockId = `${template.block.id}_${suffix++}`;
      const newBlock: BlockSpec = { ...template.block, id: blockId };
      commit({ ...entry, blocks: [...blocks, newBlock], activeBlockIdx: blocks.length, activeDocType: "block" });
      return;
    }
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const existingIds = new Set(screens.map((s) => s.id));
    let screenId = template.screen.id;
    let suffix = 2;
    while (existingIds.has(screenId)) screenId = `${template.screen.id}_${suffix++}`;
    const newScreen: ScreenSpec = { ...template.screen, id: screenId };
    commit({ ...entry, screens: [...screens, newScreen], activeIdx: screens.length, activeDocType: "screen" });
    setSelectedId(null);
  }, [activeDocType, itemTemplates, items, blockTemplates, blocks, templates, screens, entry, commit]);

  const handleRenameTemplate = useCallback((id: string, name: string) => {
    if (activeDocType === "item") {
      setItemTemplates((prev) => { const next = prev.map((t) => t.id === id ? { ...t, name } : t); saveItemTemplates(next); return next; });
      return;
    }
    if (activeDocType === "block") {
      setBlockTemplates((prev) => { const next = prev.map((t) => t.id === id ? { ...t, name } : t); saveBlockTemplates(next); return next; });
      return;
    }
    setTemplates((prev) => {
      const next = prev.map((t) => t.id === id ? { ...t, name } : t);
      saveTemplates(next);
      return next;
    });
  }, [activeDocType]);

  const handleDeleteTemplate = useCallback((id: string) => {
    if (activeDocType === "item") {
      setItemTemplates((prev) => { const next = prev.filter((t) => t.id !== id); saveItemTemplates(next); return next; });
      return;
    }
    if (activeDocType === "block") {
      setBlockTemplates((prev) => { const next = prev.filter((t) => t.id !== id); saveBlockTemplates(next); return next; });
      return;
    }
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveTemplates(next);
      return next;
    });
  }, [activeDocType]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = !!target.closest?.("input, textarea, select, [contenteditable='true']");
      if (inInput) return;
      const mod = e.metaKey || e.ctrlKey;
      // The texture editor has its own independent undo/redo stack (pixel edits, not project
      // history) — let it handle Ctrl+Z/Ctrl+Y itself instead of undoing the project.
      if (activeDocType !== "texture") {
        if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
      }
      if (activeDocType !== "screen") return; // rest of the shortcuts are screen/widget-only
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomIn(); return; }
      if (mod && e.key === "-") { e.preventDefault(); zoomOut(); return; }
      if (mod && e.key === "0") { e.preventDefault(); zoomReset(); return; }
      if (mod && e.key === "c") { e.preventDefault(); copyWidget(); return; }
      if (mod && e.key === "v") { e.preventDefault(); pasteWidget(); return; }
      if (mod && e.key === "d") { e.preventDefault(); duplicateWidget(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteWidget(); return; }
      if (e.key === "Escape") { if (tryMode) setTryMode(false); else setSelectedId(null); return; }
      if (e.key === "t" || e.key === "T") { setTryMode((v) => { if (!v) setSelectedId(null); return !v; }); return; }
      if (e.key === "r" || e.key === "R") { rotateWidget(); return; }
      const step = e.shiftKey ? gridSize : 1;
      if (e.key === "ArrowLeft")  { e.preventDefault(); nudgeWidget(-step, 0); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); nudgeWidget(step, 0);  return; }
      if (e.key === "ArrowUp")    { e.preventDefault(); nudgeWidget(0, -step); return; }
      if (e.key === "ArrowDown")  { e.preventDefault(); nudgeWidget(0, step);  return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeDocType, undo, redo, copyWidget, pasteWidget, duplicateWidget, deleteWidget, nudgeWidget, rotateWidget, gridSize, tryMode, zoomIn, zoomOut, zoomReset]);

  const handleExportScreen = useCallback(async (idx: number) => {
    try {
      const target = screens[idx];
      const exported = buildExportedScreen(target);
      const json = JSON.stringify(exported, null, 2);
      await downloadExport(`${target.id}.json`, json, { screens: [exported] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [screens]);

  const handleExportItem = useCallback(async (idx: number) => {
    try {
      const target = items[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { items: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [items]);

  const handleExportBlock = useCallback(async (idx: number) => {
    try {
      const target = blocks[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { blocks: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [blocks]);

  const handleExportEffect = useCallback(async (idx: number) => {
    try {
      const target = effects[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { effects: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [effects]);

  const handleExportPotion = useCallback(async (idx: number) => {
    try {
      const target = potions[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { potions: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [potions]);

  const handleExportCustomAttribute = useCallback(async (idx: number) => {
    try {
      const target = customAttributes[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { customAttributes: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [customAttributes]);

  const handleExportAchievement = useCallback(async (idx: number) => {
    try {
      const target = achievements[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { achievements: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [achievements]);

  const handleExportRecipe = useCallback(async (idx: number) => {
    try {
      const target = recipes[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { recipes: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [recipes]);

  const handleExportTrade = useCallback(async (idx: number) => {
    try {
      const target = trades[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { trades: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [trades]);

  const handleExportLootEntry = useCallback(async (idx: number) => {
    try {
      const target = lootEntries[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { lootEntries: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [lootEntries]);

  const handleExportBiome = useCallback(async (idx: number) => {
    try {
      const target = biomes[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { biomes: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [biomes]);

  const handleExportDimension = useCallback(async (idx: number) => {
    try {
      const target = dimensions[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { dimensions: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [dimensions]);

  const handleExportArmor = useCallback(async (idx: number) => {
    try {
      const target = armors[idx];
      const json = JSON.stringify(target, null, 2);
      await downloadExport(`${target.id}.json`, json, { armors: [target] });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [armors]);

  const handleExportAllScreens = useCallback(async () => {
    try {
      const exportedScreens = screens.map(buildExportedScreen);
      const json = JSON.stringify(exportedScreens, null, 2);
      await downloadExport(`${friendlyModId()}.screens.json`, json, { screens: exportedScreens });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [screens, friendlyModId]);

  const handleExportAllItems = useCallback(async () => {
    try {
      const json = JSON.stringify(items, null, 2);
      await downloadExport(`${friendlyModId()}.items.json`, json, { items });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [items, friendlyModId]);

  const handleExportAllBlocks = useCallback(async () => {
    try {
      const json = JSON.stringify(blocks, null, 2);
      await downloadExport(`${friendlyModId()}.blocks.json`, json, { blocks });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [blocks, friendlyModId]);

  const handleExportAllEffects = useCallback(async () => {
    try {
      const json = JSON.stringify(effects, null, 2);
      await downloadExport(`${friendlyModId()}.effects.json`, json, { effects });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [effects, friendlyModId]);

  const handleExportAllPotions = useCallback(async () => {
    try {
      const json = JSON.stringify(potions, null, 2);
      await downloadExport(`${friendlyModId()}.potions.json`, json, { potions });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [potions, friendlyModId]);

  const handleExportAllCustomAttributes = useCallback(async () => {
    try {
      const json = JSON.stringify(customAttributes, null, 2);
      await downloadExport(`${friendlyModId()}.attributes.json`, json, { customAttributes });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [customAttributes, friendlyModId]);

  const handleExportAllAchievements = useCallback(async () => {
    try {
      const json = JSON.stringify(achievements, null, 2);
      await downloadExport(`${friendlyModId()}.achievements.json`, json, { achievements });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [achievements, friendlyModId]);

  const handleExportAllRecipes = useCallback(async () => {
    try {
      const json = JSON.stringify(recipes, null, 2);
      await downloadExport(`${friendlyModId()}.recipes.json`, json, { recipes });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [recipes, friendlyModId]);

  const handleExportAllTrades = useCallback(async () => {
    try {
      const json = JSON.stringify(trades, null, 2);
      await downloadExport(`${friendlyModId()}.trades.json`, json, { trades });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [trades, friendlyModId]);

  const handleExportAllLootEntries = useCallback(async () => {
    try {
      const json = JSON.stringify(lootEntries, null, 2);
      await downloadExport(`${friendlyModId()}.loot.json`, json, { lootEntries });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [lootEntries, friendlyModId]);

  const handleExportAllBiomes = useCallback(async () => {
    try {
      const json = JSON.stringify(biomes, null, 2);
      await downloadExport(`${friendlyModId()}.biomes.json`, json, { biomes });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [biomes, friendlyModId]);

  const handleExportAllDimensions = useCallback(async () => {
    try {
      const json = JSON.stringify(dimensions, null, 2);
      await downloadExport(`${friendlyModId()}.dimensions.json`, json, { dimensions });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [dimensions, friendlyModId]);

  const handleExportAllArmors = useCallback(async () => {
    try {
      const json = JSON.stringify(armors, null, 2);
      await downloadExport(`${friendlyModId()}.armors.json`, json, { armors });
    } catch (e) {
      alert(`Could not export: ${e instanceof Error ? e.message : e}`);
    }
  }, [armors, friendlyModId]);

  const handleCopyJava = useCallback(async () => {
    try {
      const java = generateJavaClass(screen);
      await copyToClipboard(java);
    } catch (e) {
      alert(`Could not copy: ${e instanceof Error ? e.message : e}`);
    }
  }, [screen]);

  const handleImportClick = () => importRef.current?.click();
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const migrated = migrateScreenJson(JSON.parse(ev.target?.result as string) as Record<string, unknown>);
        const parsed = normalizeScreen(migrated);
        if (!parsed.id || !Array.isArray(parsed.widgets)) throw new Error("Invalid ScreenSpec");
        const existingIds = new Set(screens.map((s) => s.id));
        let id = parsed.id;
        let suffix = 2;
        while (existingIds.has(id)) id = `${parsed.id}_${suffix++}`;
        const newScreen: ScreenSpec = { ...parsed, id };
        commit({ ...entry, screens: [...screens, newScreen], activeIdx: screens.length, activeDocType: "screen" });
        setSelectedId(null);
      } catch {
        alert("Failed to parse ScreenSpec JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExportProject = useCallback(async () => {
    try {
      const exportedScreens = screens.map(buildExportedScreen);
      const project: ProjectFile = {
        name: projectKey,
        screens: exportedScreens,
        items,
        blocks,
        creativeTabs,
        customAttributes,
        effects,
        potions,
        achievements,
        recipes,
        trades,
        lootEntries,
        biomes,
        dimensions,
        armors,
        appVersion: APP_VERSION,
      };
      const json = JSON.stringify(project, null, 2);
      // Name the download after the mod, not the internal storage key (e.g. "project_1699…").
      const friendlyName = screens.find((s) => s.modId?.trim())?.modId?.trim() || projectKey;
      await downloadFullProjectExport(friendlyName, json, {
        screens: exportedScreens, items, blocks, creativeTabs, customAttributes, effects, potions,
        achievements, recipes, trades, lootEntries, biomes, dimensions, armors,
      });
    } catch (e) {
      alert(`Could not export project: ${e instanceof Error ? e.message : e}`);
    }
  }, [projectKey, screens, items, blocks, creativeTabs, customAttributes, effects, potions, achievements, recipes, trades, lootEntries, biomes, dimensions, armors]);

  const handleImportProjectClick = () => importProjectRef.current?.click();
  const handleImportProjectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const migrated = migrateProjectJson(JSON.parse(ev.target?.result as string) as Record<string, unknown>) as unknown as ProjectFile;
        if (!Array.isArray(migrated.screens) || migrated.screens.length === 0) throw new Error("Invalid project file");
        const importedScreens = migrated.screens
          .map((s) => migrateScreenJson(s as unknown as Record<string, unknown>))
          .map(normalizeScreen);
        for (const s of importedScreens) {
          if (!s.id || !Array.isArray(s.widgets)) throw new Error("Invalid ScreenSpec in project");
        }
        const importedItems = (Array.isArray(migrated.items) ? migrated.items : []).map(normalizeItem);
        const importedBlocks = (Array.isArray(migrated.blocks) ? migrated.blocks : []).map(normalizeBlock);
        const importedCreativeTabs = Array.isArray(migrated.creativeTabs) ? migrated.creativeTabs : [];
        const importedCustomAttributes = Array.isArray(migrated.customAttributes) ? migrated.customAttributes : [];
        const importedEffects = (Array.isArray(migrated.effects) ? migrated.effects : []).map(normalizeEffect);
        const importedPotions = (Array.isArray(migrated.potions) ? migrated.potions : []).map(normalizePotion);
        const importedAchievements = (Array.isArray(migrated.achievements) ? migrated.achievements : []).map(normalizeAchievement);
        const importedRecipes = (Array.isArray(migrated.recipes) ? migrated.recipes : []).map(normalizeRecipe);
        const importedTrades = (Array.isArray(migrated.trades) ? migrated.trades : []).map(normalizeTrade);
        const importedLootEntries = (Array.isArray(migrated.lootEntries) ? migrated.lootEntries : []).map(normalizeLootEntry);
        const importedBiomes = (Array.isArray(migrated.biomes) ? migrated.biomes : []).map(normalizeBiome);
        const importedDimensions = (Array.isArray(migrated.dimensions) ? migrated.dimensions : []).map(normalizeDimension);
        const importedArmors = (Array.isArray(migrated.armors) ? migrated.armors : []).map(normalizeArmor);
        commit({
          ...entry,
          screens: importedScreens, items: importedItems, blocks: importedBlocks,
          creativeTabs: importedCreativeTabs, customAttributes: importedCustomAttributes,
          effects: importedEffects, potions: importedPotions,
          achievements: importedAchievements, recipes: importedRecipes, trades: importedTrades, lootEntries: importedLootEntries,
          biomes: importedBiomes, dimensions: importedDimensions, armors: importedArmors,
          activeIdx: 0, activeDocType: "screen", activeItemIdx: 0, activeBlockIdx: 0, activeAttributeIdx: 0,
          activeEffectIdx: 0, activePotionIdx: 0, activeAchievementIdx: 0, activeRecipeIdx: 0, activeTradeIdx: 0,
          activeLootEntryIdx: 0, activeBiomeIdx: 0, activeDimensionIdx: 0, activeArmorIdx: 0,
        });
        setSelectedId(null);
      } catch {
        alert("Failed to parse project JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSaveToTestMod = useCallback(async () => {
    try {
      const exported = buildExportedScreen(screen);
      const res = await fetch("/api/dev/test-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exported),
      });
      if (!res.ok) throw new Error("Server error");
    } catch (e) {
      alert(`Could not save to test mod: ${e instanceof Error ? e.message : e}`);
    }
  }, [screen]);

  if (!projectLoaded || !initialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-200">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <TexturePickerModal
        open={showTextureDebug}
        packTextures={packTextures}
        current=""
        onSelect={() => {}}
        onClose={() => setShowTextureDebug(false)}
      />
      <SidebarProvider>
        {!tryMode && (
          <AppSidebar
            screens={screens}
            activeIdx={activeIdx}
            modId={screen.modId}
            widgets={screen.widgets}
            selectedId={selectedId}
            selectedIds={selectedIds}
            onGoHome={() => router.push("/")}
            onSelectScreen={switchScreen}
            onAddScreen={addScreen}
            onRemoveScreen={removeScreen}
            onRenameScreen={renameScreen}
            onMoveScreen={moveScreen}
            onImportScreen={handleImportClick}
            onExportScreen={handleExportScreen}
            onExportAllScreens={handleExportAllScreens}
            items={items}
            blocks={blocks}
            activeDocType={activeDocType}
            activeItemIdx={activeItemIdx}
            activeBlockIdx={activeBlockIdx}
            onSelectItem={switchItem}
            onAddItem={addItem}
            onRemoveItem={removeItem}
            onRenameItem={renameItem}
            onDuplicateItem={duplicateItem}
            onExportItem={handleExportItem}
            onExportAllItems={handleExportAllItems}
            onSelectBlock={switchBlock}
            onAddBlock={addBlock}
            onRemoveBlock={removeBlock}
            onRenameBlock={renameBlock}
            onDuplicateBlock={duplicateBlock}
            onExportBlock={handleExportBlock}
            onExportAllBlocks={handleExportAllBlocks}
            templates={templates}
            itemTemplates={itemTemplates}
            blockTemplates={blockTemplates}
            onSaveTemplate={handleSaveTemplate}
            onInsertTemplate={handleInsertTemplate}
            onRenameTemplate={handleRenameTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            creativeTabs={creativeTabs}
            onAddCreativeTab={addCreativeTab}
            onRenameCreativeTab={renameCreativeTab}
            onRemoveCreativeTab={removeCreativeTab}
            attributePresets={attributePresets}
            onSaveAttributePreset={handleSaveAttributePreset}
            onApplyAttributePreset={handleApplyAttributePreset}
            onRenameAttributePreset={handleRenameAttributePreset}
            onDeleteAttributePreset={handleDeleteAttributePreset}
            customAttributes={customAttributes}
            activeAttributeIdx={activeAttributeIdx}
            onSelectCustomAttribute={switchCustomAttribute}
            onAddCustomAttribute={addCustomAttribute}
            onRenameCustomAttribute={(idx, displayName) => updateCustomAttribute(idx, { displayName })}
            onRemoveCustomAttribute={removeCustomAttribute}
            onDuplicateCustomAttribute={duplicateCustomAttribute}
            onExportCustomAttribute={handleExportCustomAttribute}
            onExportAllCustomAttributes={handleExportAllCustomAttributes}
            effects={effects}
            activeEffectIdx={activeEffectIdx}
            onSelectEffect={switchEffect}
            onAddEffect={addEffect}
            onRenameEffect={renameEffect}
            onRemoveEffect={removeEffect}
            onDuplicateEffect={duplicateEffect}
            onExportEffect={handleExportEffect}
            onExportAllEffects={handleExportAllEffects}
            potions={potions}
            activePotionIdx={activePotionIdx}
            onSelectPotion={switchPotion}
            onAddPotion={addPotion}
            onRenamePotion={renamePotion}
            onRemovePotion={removePotion}
            onDuplicatePotion={duplicatePotion}
            onExportPotion={handleExportPotion}
            onExportAllPotions={handleExportAllPotions}
            achievements={achievements}
            activeAchievementIdx={activeAchievementIdx}
            onSelectAchievement={switchAchievement}
            onAddAchievement={addAchievement}
            onRenameAchievement={renameAchievement}
            onRemoveAchievement={removeAchievement}
            onDuplicateAchievement={duplicateAchievement}
            onExportAchievement={handleExportAchievement}
            onExportAllAchievements={handleExportAllAchievements}
            recipes={recipes}
            activeRecipeIdx={activeRecipeIdx}
            onSelectRecipe={switchRecipe}
            onAddRecipe={addRecipe}
            onRenameRecipe={renameRecipe}
            onRemoveRecipe={removeRecipe}
            onDuplicateRecipe={duplicateRecipe}
            onExportRecipe={handleExportRecipe}
            onExportAllRecipes={handleExportAllRecipes}
            trades={trades}
            activeTradeIdx={activeTradeIdx}
            onSelectTrade={switchTrade}
            onAddTrade={addTrade}
            onRenameTrade={renameTrade}
            onRemoveTrade={removeTrade}
            onDuplicateTrade={duplicateTrade}
            onExportTrade={handleExportTrade}
            onExportAllTrades={handleExportAllTrades}
            lootEntries={lootEntries}
            activeLootEntryIdx={activeLootEntryIdx}
            onSelectLootEntry={switchLootEntry}
            onAddLootEntry={addLootEntry}
            onRenameLootEntry={renameLootEntry}
            onRemoveLootEntry={removeLootEntry}
            onDuplicateLootEntry={duplicateLootEntry}
            onExportLootEntry={handleExportLootEntry}
            onExportAllLootEntries={handleExportAllLootEntries}
            biomes={biomes}
            activeBiomeIdx={activeBiomeIdx}
            onSelectBiome={switchBiome}
            onAddBiome={addBiome}
            onRenameBiome={renameBiome}
            onRemoveBiome={removeBiome}
            onDuplicateBiome={duplicateBiome}
            onExportBiome={handleExportBiome}
            onExportAllBiomes={handleExportAllBiomes}
            dimensions={dimensions}
            activeDimensionIdx={activeDimensionIdx}
            onSelectDimension={switchDimension}
            onAddDimension={addDimension}
            onRenameDimension={renameDimension}
            onRemoveDimension={removeDimension}
            onDuplicateDimension={duplicateDimension}
            onExportDimension={handleExportDimension}
            onExportAllDimensions={handleExportAllDimensions}
            armors={armors}
            activeArmorIdx={activeArmorIdx}
            onSelectArmor={switchArmor}
            onAddArmor={addArmor}
            onRenameArmor={renameArmor}
            onRemoveArmor={removeArmor}
            onDuplicateArmor={duplicateArmor}
            onExportArmor={handleExportArmor}
            onExportAllArmors={handleExportAllArmors}
            onOpenTextureEditor={() => openTextureEditor()}
            onOpenExistingTexture={openExistingTexture}
            onAddWidget={addWidget}
            onSelectWidget={selectWidgetInTree}
            onDeleteWidget={deleteWidget}
            onToggleHiddenWidget={toggleHiddenWidget}
            onRenameWidget={renameWidget}
            onReparentWidget={reparentWidget}
            onReorderWidget={reorderWidget}
          />
        )}

        <div className="flex flex-1 flex-col overflow-hidden h-svh">
          {activeDocType === "screen" ? (
            <Toolbar
              screen={screen}
              gridSize={gridSize}
              showGrid={showGrid}
              snapToParent={snapToParent}
              snapToSiblings={snapToSiblings}
              canUndo={cursor > 0}
              canRedo={cursor < history.length - 1}
              hasSelection={selectedIds.length > 0}
              onCenterHorizontal={() => centerSelection("horizontal")}
              onCenterVertical={() => centerSelection("vertical")}
              tryMode={tryMode}
              onUndo={undo}
              onRedo={redo}
              onGridSizeChange={setGridSize}
              onToggleGrid={() => setShowGrid((v) => !v)}
              onToggleSnapToParent={() => setSnapToParent((v) => !v)}
              onToggleSnapToSiblings={() => setSnapToSiblings((v) => !v)}
              onToggleTryMode={() => { setTryMode((v) => { if (!v) setSelectedId(null); return !v; }); }}
              onScreenChange={(patch) => commitScreen({ ...screen, ...patch })}
              onExportProject={handleExportProject}
              onImportProject={handleImportProjectClick}
              onCopyJava={handleCopyJava}
              onResetTextures={handleResetTextures}
              onViewTextures={() => setShowTextureDebug(true)}
              onExtractPack={extractPack}
              onSaveToTestMod={process.env.NODE_ENV === "development" ? handleSaveToTestMod : undefined}
              scale={scale}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onZoomReset={zoomReset}
              bindingsSchema={screen.bindingsSchema ?? {}}
              onUpdateBindingsSchema={updateBindingsSchema}
              actions={screen.actions ?? []}
              onUpdateActions={updateActions}
              modId={screen.modId}
            />
          ) : (
            <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={undo} disabled={cursor === 0}>Undo</Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={redo} disabled={cursor >= history.length - 1}>Redo</Button>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleExportProject}>Export Project</Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleImportProjectClick}>Import Project</Button>
            </div>
          )}

          <div className="flex flex-1 overflow-hidden">
            {activeDocType === "screen" ? (
              <div
                ref={canvasWrapperRef}
                className="flex flex-1 overflow-hidden p-8"
                onMouseDown={(e) => {
                  if (e.target !== e.currentTarget) return; // only the wrapper background, not canvas
                  if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
                  setSelectedId(null);
                }}
              >
                <div style={{ transform: `translate(${panX}px, ${panY}px)`, margin: "auto", flexShrink: 0 }}>
                <Canvas
                  width={screen.width}
                  height={screen.height}
                  scale={scale}
                  widgets={screen.widgets}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  gridSize={gridSize}
                  showGrid={showGrid}
                  snapToParent={snapToParent}
                  snapToSiblings={snapToSiblings}
                  tryMode={tryMode}
                  onSelect={setSelectedId}
                  onToggleSelect={toggleSelectWidget}
                  onUpdateWidget={updateWidget}
                  onUpdateWidgets={(updated) => {
                    const updatedIds = new Set(updated.map(w => w.id));
                    const merged = screen.widgets.map(w => updatedIds.has(w.id) ? updated.find(u => u.id === w.id)! : w);
                    commitScreen({ ...screen, widgets: merged });
                  }}
                  bindingsSchema={screen.bindingsSchema ?? {}}
                  onAddWidget={(type, x, y) => addWidget(type, undefined, x, y)}
                />
                </div>
              </div>
            ) : activeDocType === "texture" ? (
              <TextureEditorPanel
                suggestedName={
                  textureEditorReturnTo
                    ? ((textureEditorReturnTo.docType === "item"
                        ? items[textureEditorReturnTo.index]?.id
                        : textureEditorReturnTo.docType === "block"
                        ? blocks[textureEditorReturnTo.index]?.id
                        : textureEditorReturnTo.docType === "armor"
                        ? armors[textureEditorReturnTo.index]?.id
                        : effects[textureEditorReturnTo.index]?.id) ?? "texture")
                    : textureEditorInitialKey
                    ? textureEditorInitialKey.replace(/^custom\//, "").replace(/\.[^./]+$/, "")
                    : "texture"
                }
                initialTextureKey={textureEditorInitialKey ?? undefined}
                onUpload={uploadCustomTexture}
                onSave={handleTextureEditorSave}
                onBack={textureEditorReturnTo ? handleTextureEditorBack : undefined}
              />
            ) : activeDocType === "attribute" ? (
              // The properties form gets the main window instead of the cramped 256px aside — same
              // "form needs real width" reasoning as Dimension originally, now applied uniformly to
              // every spec-form content type; the small preview moves to the aside instead (below).
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <CustomAttributePropertyPanel
                    attribute={activeCustomAttribute}
                    onUpdate={(patch) => updateCustomAttribute(activeAttributeIdx, patch)}
                    onRenameId={(id) => renameCustomAttributeId(activeAttributeIdx, id)}
                  />
                </div>
              </div>
            ) : activeDocType === "effect" ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <EffectPropertyPanel
                    effect={activeEffect}
                    customAttributes={customAttributes}
                    onUpdate={(patch) => updateEffect(activeEffectIdx, patch)}
                    onOpenTextureEditor={() => openTextureEditor({ docType: "effect", index: activeEffectIdx })}
                  />
                </div>
              </div>
            ) : activeDocType === "potion" ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <PotionPropertyPanel
                    potion={activePotion}
                    effects={effects}
                    onUpdate={(patch) => updatePotion(activePotionIdx, patch)}
                  />
                </div>
              </div>
            ) : activeDocType === "achievement" ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <AchievementPropertyPanel
                    achievement={activeAchievement}
                    achievements={achievements}
                    items={items}
                    dimensions={dimensions}
                    modId={friendlyModId()}
                    onUpdate={(patch) => updateAchievement(activeAchievementIdx, patch)}
                  />
                </div>
              </div>
            ) : activeDocType === "recipe" ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <RecipePropertyPanel
                    recipe={activeRecipe}
                    items={items}
                    modId={friendlyModId()}
                    onUpdate={(patch) => updateRecipe(activeRecipeIdx, patch)}
                  />
                </div>
              </div>
            ) : activeDocType === "trade" ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <TradePropertyPanel
                    trade={activeTrade}
                    items={items}
                    modId={friendlyModId()}
                    onUpdate={(patch) => updateTrade(activeTradeIdx, patch)}
                  />
                </div>
              </div>
            ) : activeDocType === "loot" ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <LootEntryPropertyPanel
                    entry={activeLootEntry}
                    items={items}
                    modId={friendlyModId()}
                    onUpdate={(patch) => updateLootEntry(activeLootEntryIdx, patch)}
                  />
                </div>
              </div>
            ) : activeDocType === "biome" ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <BiomePropertyPanel
                    biome={activeBiome}
                    onUpdate={(patch) => updateBiome(activeBiomeIdx, patch)}
                  />
                </div>
              </div>
            ) : activeDocType === "dimension" ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <DimensionPropertyPanel
                    dimension={activeDimension}
                    biomes={biomes}
                    blocks={blocks}
                    modId={friendlyModId()}
                    onUpdate={(patch) => updateDimension(activeDimensionIdx, patch)}
                  />
                </div>
              </div>
            ) : activeDocType === "armor" ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <ArmorPropertyPanel
                    armor={activeArmor}
                    items={items}
                    creativeTabs={creativeTabs}
                    modId={friendlyModId()}
                    onUpdate={(patch) => updateArmor(activeArmorIdx, patch)}
                    onOpenTextureEditor={(field) => openTextureEditor({ docType: "armor", index: activeArmorIdx, field })}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mx-auto max-w-3xl">
                  <ItemBlockPropertyPanel
                    doc={
                      activeDocType === "item"
                        ? (activeItem ? { kind: "item", spec: activeItem } : null)
                        : (activeBlock ? { kind: "block", spec: activeBlock } : null)
                    }
                    onUpdate={(spec) => activeDocType === "item" ? updateItem(spec as ItemSpec) : updateBlock(spec as BlockSpec)}
                    creativeTabs={creativeTabs}
                    customAttributes={customAttributes}
                    onOpenTextureEditor={() => openTextureEditor({ docType: activeDocType as "item" | "block", index: activeDocType === "item" ? activeItemIdx : activeBlockIdx })}
                  />
                </div>
              </div>
            )}

            {!tryMode && activeDocType !== "texture" && (
              <aside className="w-64 shrink-0 border-l bg-background overflow-y-auto">
                {activeDocType === "screen" ? (
                  <PropertyPanel
                    widget={selectedWidget}
                    onUpdate={updateWidget}
                    bindingsSchema={screen.bindingsSchema ?? {}}
                    actions={screen.actions ?? []}
                    onCreateAction={(name) => {
                      const updatedWidgets = selectedWidget
                        ? screen.widgets.map(w => w.id === selectedWidget.id ? { ...w, action: name } : w)
                        : screen.widgets;
                      commitScreen({ ...screen, actions: [...(screen.actions ?? []), name], widgets: updatedWidgets });
                    }}
                    inventoryAreaIds={screen.widgets.filter((w) => w.type === "inventory_area").map((w) => w.id)}
                  />
                ) : activeDocType === "attribute" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <CustomAttributePreview attribute={activeCustomAttribute} />
                  </div>
                ) : activeDocType === "effect" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <EffectPreview effect={activeEffect} />
                  </div>
                ) : activeDocType === "potion" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <PotionPreview potion={activePotion} />
                  </div>
                ) : activeDocType === "achievement" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <AchievementPreview achievement={activeAchievement} />
                  </div>
                ) : activeDocType === "recipe" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <RecipePreview recipe={activeRecipe} />
                  </div>
                ) : activeDocType === "trade" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <TradePreview trade={activeTrade} />
                  </div>
                ) : activeDocType === "loot" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <LootEntryPreview entry={activeLootEntry} />
                  </div>
                ) : activeDocType === "biome" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <BiomePreview biome={activeBiome} />
                  </div>
                ) : activeDocType === "dimension" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <DimensionPreview dimension={activeDimension} />
                  </div>
                ) : activeDocType === "armor" ? (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <ArmorPreview armor={activeArmor} />
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <ItemBlockPreview
                      doc={
                        activeDocType === "item"
                          ? (activeItem ? { kind: "item", spec: activeItem } : null)
                          : (activeBlock ? { kind: "block", spec: activeBlock } : null)
                      }
                    />
                  </div>
                )}
              </aside>
            )}
          </div>
        </div>

        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />
        <input
          ref={importProjectRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportProjectFile}
        />
      </SidebarProvider>
    </>
  );
}
