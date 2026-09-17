"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  Plus, Pencil, Trash2, GripVertical, ChevronDown, ChevronRight, ChevronLeft, Upload, Download,
  SavePlus, LayoutTemplate, Tags, Sparkles, Paintbrush, Trophy,
  Hammer, Mountain, Globe, Package, Users, Copy,
} from "lucide-react";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LayersTree from "@/components/LayersTree";
import { useTextures } from "@/lib/TextureContext";
import type {
  ScreenSpec, WidgetSpec, ItemSpec, BlockSpec, CreativeTabSpec, CustomAttributeSpec, EffectSpec, PotionSpec,
  AchievementSpec, RecipeSpec, TradeSpec, LootEntrySpec, BiomeSpec, DimensionSpec, ArmorSpec, EntitySpec,
} from "@/lib/types";
import type { ScreenTemplate, ItemTemplate, BlockTemplate } from "@/lib/templates";
import type { AttributePreset } from "@/lib/attributePresets";

export type ActiveDocType =
  | "screen" | "item" | "block" | "armor" | "entity" | "attribute" | "effect" | "potion" | "texture"
  | "achievement" | "recipe" | "trade" | "loot" | "biome" | "dimension";

interface TemplateListItem {
  id: string;
  name: string;
}

interface Props {
  screens: ScreenSpec[];
  activeIdx: number;
  modId?: string;
  widgets: WidgetSpec[];
  selectedId: string | null;
  selectedIds?: string[];
  onGoHome: () => void;
  onSelectScreen: (idx: number) => void;
  onAddScreen: () => void;
  onRemoveScreen: (idx: number) => void;
  onRenameScreen: (idx: number, name: string) => void;
  onMoveScreen: (fromIdx: number, toIdx: number) => void;
  onImportScreen: () => void;
  onExportScreen: (idx: number) => void;
  onExportAllScreens: () => void;

  items: ItemSpec[];
  blocks: BlockSpec[];
  activeDocType: ActiveDocType;
  activeItemIdx: number;
  activeBlockIdx: number;
  onSelectItem: (idx: number) => void;
  onAddItem: () => void;
  onRemoveItem: (idx: number) => void;
  onRenameItem: (idx: number, name: string) => void;
  onDuplicateItem: (idx: number) => void;
  onExportItem: (idx: number) => void;
  onExportAllItems: () => void;
  onSelectBlock: (idx: number) => void;
  onAddBlock: () => void;
  onRemoveBlock: (idx: number) => void;
  onRenameBlock: (idx: number, name: string) => void;
  onDuplicateBlock: (idx: number) => void;
  onExportBlock: (idx: number) => void;
  onExportAllBlocks: () => void;

  armors: ArmorSpec[];
  activeArmorIdx: number;
  onSelectArmor: (idx: number) => void;
  onAddArmor: () => void;
  onRenameArmor: (idx: number, name: string) => void;
  onRemoveArmor: (idx: number) => void;
  onDuplicateArmor: (idx: number) => void;
  onExportArmor: (idx: number) => void;
  onExportAllArmors: () => void;

  entities: EntitySpec[];
  activeEntityIdx: number;
  onSelectEntity: (idx: number) => void;
  onAddEntity: () => void;
  onRenameEntity: (idx: number, name: string) => void;
  onRemoveEntity: (idx: number) => void;
  onDuplicateEntity: (idx: number) => void;
  onExportEntity: (idx: number) => void;
  onExportAllEntities: () => void;

  templates: ScreenTemplate[];
  itemTemplates: ItemTemplate[];
  blockTemplates: BlockTemplate[];
  onSaveTemplate: () => void;
  onInsertTemplate: (id: string) => void;
  onRenameTemplate: (id: string, name: string) => void;
  onDeleteTemplate: (id: string) => void;

  creativeTabs: CreativeTabSpec[];
  onAddCreativeTab: () => void;
  onRenameCreativeTab: (idx: number, displayName: string) => void;
  onRemoveCreativeTab: (idx: number) => void;

  attributePresets: AttributePreset[];
  onSaveAttributePreset: () => void;
  onApplyAttributePreset: (id: string) => void;
  onRenameAttributePreset: (id: string, name: string) => void;
  onDeleteAttributePreset: (id: string) => void;

  customAttributes: CustomAttributeSpec[];
  activeAttributeIdx: number;
  onSelectCustomAttribute: (idx: number) => void;
  onAddCustomAttribute: () => void;
  onRenameCustomAttribute: (idx: number, displayName: string) => void;
  onRemoveCustomAttribute: (idx: number) => void;
  onDuplicateCustomAttribute: (idx: number) => void;
  onExportCustomAttribute: (idx: number) => void;

  effects: EffectSpec[];
  activeEffectIdx: number;
  onSelectEffect: (idx: number) => void;
  onAddEffect: () => void;
  onRenameEffect: (idx: number, name: string) => void;
  onRemoveEffect: (idx: number) => void;
  onDuplicateEffect: (idx: number) => void;
  onExportEffect: (idx: number) => void;
  onExportAllEffects: () => void;

  potions: PotionSpec[];
  activePotionIdx: number;
  onSelectPotion: (idx: number) => void;
  onAddPotion: () => void;
  onRenamePotion: (idx: number, name: string) => void;
  onRemovePotion: (idx: number) => void;
  onDuplicatePotion: (idx: number) => void;
  onExportPotion: (idx: number) => void;
  onExportAllPotions: () => void;

  achievements: AchievementSpec[];
  activeAchievementIdx: number;
  onSelectAchievement: (idx: number) => void;
  onAddAchievement: () => void;
  onRenameAchievement: (idx: number, name: string) => void;
  onRemoveAchievement: (idx: number) => void;
  onDuplicateAchievement: (idx: number) => void;
  onExportAchievement: (idx: number) => void;
  onExportAllAchievements: () => void;

  recipes: RecipeSpec[];
  activeRecipeIdx: number;
  onSelectRecipe: (idx: number) => void;
  onAddRecipe: () => void;
  onRenameRecipe: (idx: number, name: string) => void;
  onRemoveRecipe: (idx: number) => void;
  onDuplicateRecipe: (idx: number) => void;
  onExportRecipe: (idx: number) => void;
  onExportAllRecipes: () => void;

  trades: TradeSpec[];
  activeTradeIdx: number;
  onSelectTrade: (idx: number) => void;
  onAddTrade: () => void;
  onRenameTrade: (idx: number, name: string) => void;
  onRemoveTrade: (idx: number) => void;
  onDuplicateTrade: (idx: number) => void;
  onExportTrade: (idx: number) => void;
  onExportAllTrades: () => void;

  lootEntries: LootEntrySpec[];
  activeLootEntryIdx: number;
  onSelectLootEntry: (idx: number) => void;
  onAddLootEntry: () => void;
  onRenameLootEntry: (idx: number, name: string) => void;
  onRemoveLootEntry: (idx: number) => void;
  onDuplicateLootEntry: (idx: number) => void;
  onExportLootEntry: (idx: number) => void;
  onExportAllLootEntries: () => void;

  biomes: BiomeSpec[];
  activeBiomeIdx: number;
  onSelectBiome: (idx: number) => void;
  onAddBiome: () => void;
  onRenameBiome: (idx: number, name: string) => void;
  onRemoveBiome: (idx: number) => void;
  onDuplicateBiome: (idx: number) => void;
  onExportBiome: (idx: number) => void;
  onExportAllBiomes: () => void;

  dimensions: DimensionSpec[];
  activeDimensionIdx: number;
  onSelectDimension: (idx: number) => void;
  onAddDimension: () => void;
  onRenameDimension: (idx: number, name: string) => void;
  onRemoveDimension: (idx: number) => void;
  onDuplicateDimension: (idx: number) => void;
  onExportDimension: (idx: number) => void;
  onExportAllDimensions: () => void;

  onExportAllCustomAttributes: () => void;

  onOpenTextureEditor: () => void;
  onOpenExistingTexture: (key: string) => void;

  onAddWidget: (type: string, parentId?: string) => void;
  onSelectWidget: (id: string, shiftKey: boolean, modKey: boolean) => void;
  onDeleteWidget: (id: string) => void;
  onToggleHiddenWidget: (id: string) => void;
  onRenameWidget: (id: string, name: string) => void;
  onReparentWidget: (id: string, newParentId: string | null) => void;
  onReorderWidget: (draggedIds: string[], overId: string, placement: "before" | "after" | "inside") => void;
}

function SortableScreenItem({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-50" : undefined}
    >
      <button
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        className="absolute left-0.5 top-1.5 flex h-5 w-4 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground [&>svg]:size-3.5"
      >
        <GripVertical />
      </button>
      {children}
    </SidebarMenuItem>
  );
}

/** Simple (non-reorderable) list row shared by the Items/Blocks/Creative Tabs/Attribute Presets
 * groups — rename on double-click, actions on hover, same look as the Screens rows minus the drag
 * handle. `onExport` is optional since Creative Tabs / Attribute Presets don't have one. */
function SimpleListRow({
  label,
  isActive,
  isRenaming,
  renameValue,
  renameRef,
  onSelect,
  onStartRename,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  onExport,
  onDuplicate,
  onDelete,
  deleteDisabled,
  icon,
}: {
  label: string;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameRef: React.RefObject<HTMLInputElement | null>;
  onSelect: () => void;
  onStartRename: () => void;
  onRenameChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onExport?: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <SidebarMenuItem className="relative">
      {isRenaming ? (
        <div className="px-2 py-0.5">
          <Input
            ref={renameRef}
            className="h-6 text-xs"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitRename();
              if (e.key === "Escape") onCancelRename();
            }}
            onBlur={onCommitRename}
          />
        </div>
      ) : (
        <>
          <SidebarMenuButton
            size="sm"
            isActive={isActive}
            onClick={onSelect}
            onDoubleClick={onStartRename}
            className="pl-2 pr-20"
          >
            {icon}
            <span className="truncate">{label || "(unnamed)"}</span>
          </SidebarMenuButton>
          <div className="absolute right-1 top-1.5 hidden items-center gap-0.5 group-hover/menu-item:flex">
            {onExport && (
              <button
                title="Export JSON"
                onClick={(e) => { e.stopPropagation(); onExport(); }}
                className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
              >
                <Download />
              </button>
            )}
            {onDuplicate && (
              <button
                title="Duplicate"
                onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
              >
                <Copy />
              </button>
            )}
            <button
              title="Rename"
              onClick={(e) => { e.stopPropagation(); onStartRename(); }}
              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
            >
              <Pencil />
            </button>
            <button
              title="Delete"
              disabled={deleteDisabled}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent disabled:pointer-events-none disabled:opacity-30 [&>svg]:size-3.5"
            >
              <Trash2 />
            </button>
          </div>
        </>
      )}
    </SidebarMenuItem>
  );
}

export default function AppSidebar({
  screens, activeIdx, modId, widgets, selectedId, selectedIds,
  onGoHome, onSelectScreen, onAddScreen, onRemoveScreen, onRenameScreen, onMoveScreen, onImportScreen, onExportScreen, onExportAllScreens,
  items, blocks, activeDocType, activeItemIdx, activeBlockIdx,
  onSelectItem, onAddItem, onRemoveItem, onRenameItem, onDuplicateItem, onExportItem, onExportAllItems,
  onSelectBlock, onAddBlock, onRemoveBlock, onRenameBlock, onDuplicateBlock, onExportBlock, onExportAllBlocks,
  armors, activeArmorIdx, onSelectArmor, onAddArmor, onRenameArmor, onRemoveArmor, onDuplicateArmor, onExportArmor, onExportAllArmors,
  entities, activeEntityIdx, onSelectEntity, onAddEntity, onRenameEntity, onRemoveEntity, onDuplicateEntity, onExportEntity, onExportAllEntities,
  templates, itemTemplates, blockTemplates, onSaveTemplate, onInsertTemplate, onRenameTemplate, onDeleteTemplate,
  creativeTabs, onAddCreativeTab, onRenameCreativeTab, onRemoveCreativeTab,
  attributePresets, onSaveAttributePreset, onApplyAttributePreset, onRenameAttributePreset, onDeleteAttributePreset,
  customAttributes, activeAttributeIdx, onSelectCustomAttribute, onAddCustomAttribute, onRenameCustomAttribute, onRemoveCustomAttribute, onDuplicateCustomAttribute, onExportCustomAttribute,
  effects, activeEffectIdx, onSelectEffect, onAddEffect, onRenameEffect, onRemoveEffect, onDuplicateEffect, onExportEffect, onExportAllEffects,
  potions, activePotionIdx, onSelectPotion, onAddPotion, onRenamePotion, onRemovePotion, onDuplicatePotion, onExportPotion, onExportAllPotions,
  achievements, activeAchievementIdx, onSelectAchievement, onAddAchievement, onRenameAchievement, onRemoveAchievement, onDuplicateAchievement, onExportAchievement, onExportAllAchievements,
  recipes, activeRecipeIdx, onSelectRecipe, onAddRecipe, onRenameRecipe, onRemoveRecipe, onDuplicateRecipe, onExportRecipe, onExportAllRecipes,
  trades, activeTradeIdx, onSelectTrade, onAddTrade, onRenameTrade, onRemoveTrade, onDuplicateTrade, onExportTrade, onExportAllTrades,
  lootEntries, activeLootEntryIdx, onSelectLootEntry, onAddLootEntry, onRenameLootEntry, onRemoveLootEntry, onDuplicateLootEntry, onExportLootEntry, onExportAllLootEntries,
  biomes, activeBiomeIdx, onSelectBiome, onAddBiome, onRenameBiome, onRemoveBiome, onDuplicateBiome, onExportBiome, onExportAllBiomes,
  dimensions, activeDimensionIdx, onSelectDimension, onAddDimension, onRenameDimension, onRemoveDimension, onDuplicateDimension, onExportDimension, onExportAllDimensions,
  onExportAllCustomAttributes,
  onOpenTextureEditor,
  onOpenExistingTexture,
  onAddWidget, onSelectWidget, onDeleteWidget, onToggleHiddenWidget, onRenameWidget, onReparentWidget, onReorderWidget,
}: Props) {
  const { packTextures, renameCustomTexture, deleteCustomTexture } = useTextures();
  const customTextureKeys = Object.keys(packTextures).filter((k) => k.startsWith("custom/")).sort();
  const [myTexturesOpen, setMyTexturesOpen] = useState(false);

  const [screensOpen, setScreensOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [armorsOpen, setArmorsOpen] = useState(false);
  const [entitiesOpen, setEntitiesOpen] = useState(false);
  const [creativeTabsOpen, setCreativeTabsOpen] = useState(false);
  const [attributePresetsOpen, setAttributePresetsOpen] = useState(false);
  const [customAttributesOpen, setCustomAttributesOpen] = useState(false);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [potionsOpen, setPotionsOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [tradesOpen, setTradesOpen] = useState(false);
  const [lootEntriesOpen, setLootEntriesOpen] = useState(false);
  const [biomesOpen, setBiomesOpen] = useState(false);
  const [dimensionsOpen, setDimensionsOpen] = useState(false);

  // Focus mode — clicking a content-type group's label hides every other group and shows a
  // "ProjectName > Group" breadcrumb in the header; clicking the project name in that breadcrumb
  // exits focus and shows every group again. Texture Editor/Templates/Layers stay visible always
  // (utility panels, not "classes"). A first click on an unfocused group both focuses it and opens
  // it; a click while it's already the focused one just toggles its own open/closed state, same as
  // before focus mode existed.
  const [focusedGroup, setFocusedGroup] = useState<string | null>(null);
  const showGroup = (key: string) => focusedGroup === null || focusedGroup === key;
  const groupLabelClick = (key: string, setOpen?: (fn: (v: boolean) => boolean) => void) => {
    if (focusedGroup === key) { setOpen?.((v) => !v); return; }
    setFocusedGroup(key);
    setOpen?.(() => true);
  };
  // key -> that group's own setOpen (undefined for the two static placeholders) — used only to
  // collapse the previously-focused group back closed when returning to the full overview, so it
  // doesn't come back already expanded next time (it was opened as a side effect of focusing it).
  const GROUP_SETTERS: Record<string, ((fn: (v: boolean) => boolean) => void) | undefined> = {
    screens: setScreensOpen, items: setItemsOpen, blocks: setBlocksOpen, armors: setArmorsOpen, entities: setEntitiesOpen, creativeTabs: setCreativeTabsOpen,
    attributePresets: setAttributePresetsOpen, customAttributes: setCustomAttributesOpen,
    effects: setEffectsOpen, potions: setPotionsOpen, achievements: setAchievementsOpen,
    recipes: setRecipesOpen, trades: setTradesOpen, lootEntries: setLootEntriesOpen,
    biomes: setBiomesOpen, dimensions: setDimensionsOpen,
  };
  const unfocusGroup = () => {
    if (focusedGroup) GROUP_SETTERS[focusedGroup]?.(() => false);
    setFocusedGroup(null);
  };
  const GROUP_LABELS: Record<string, string> = {
    screens: "Screens", items: "Items", blocks: "Blocks", armors: "Armor", entities: "Entities", creativeTabs: "Creative Tabs",
    attributePresets: "Attribute Presets", customAttributes: "Custom Attributes",
    effects: "Effects", potions: "Potions", achievements: "Achievements", recipes: "Crafting Recipes",
    trades: "Trading", lootEntries: "Loot Tables", biomes: "Biomes", dimensions: "Dimensions",
  };
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null);
  const [templateRenameValue, setTemplateRenameValue] = useState("");
  const templateRenameRef = useRef<HTMLInputElement>(null);

  const [renamingItemIdx, setRenamingItemIdx] = useState<number | null>(null);
  const [itemRenameValue, setItemRenameValue] = useState("");
  const itemRenameRef = useRef<HTMLInputElement>(null);
  const [renamingBlockIdx, setRenamingBlockIdx] = useState<number | null>(null);
  const [blockRenameValue, setBlockRenameValue] = useState("");
  const blockRenameRef = useRef<HTMLInputElement>(null);
  const [renamingArmorIdx, setRenamingArmorIdx] = useState<number | null>(null);
  const [armorRenameValue, setArmorRenameValue] = useState("");
  const armorRenameRef = useRef<HTMLInputElement>(null);

  const [renamingEntityIdx, setRenamingEntityIdx] = useState<number | null>(null);
  const [entityRenameValue, setEntityRenameValue] = useState("");
  const entityRenameRef = useRef<HTMLInputElement>(null);

  const [renamingTabIdx, setRenamingTabIdx] = useState<number | null>(null);
  const [tabRenameValue, setTabRenameValue] = useState("");
  const tabRenameRef = useRef<HTMLInputElement>(null);

  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [presetRenameValue, setPresetRenameValue] = useState("");
  const presetRenameRef = useRef<HTMLInputElement>(null);

  const [renamingAttrIdx, setRenamingAttrIdx] = useState<number | null>(null);
  const [attrRenameValue, setAttrRenameValue] = useState("");
  const attrRenameRef = useRef<HTMLInputElement>(null);

  const [renamingEffectIdx, setRenamingEffectIdx] = useState<number | null>(null);
  const [effectRenameValue, setEffectRenameValue] = useState("");
  const effectRenameRef = useRef<HTMLInputElement>(null);
  const [renamingPotionIdx, setRenamingPotionIdx] = useState<number | null>(null);
  const [potionRenameValue, setPotionRenameValue] = useState("");
  const potionRenameRef = useRef<HTMLInputElement>(null);

  const [renamingAchievementIdx, setRenamingAchievementIdx] = useState<number | null>(null);
  const [achievementRenameValue, setAchievementRenameValue] = useState("");
  const achievementRenameRef = useRef<HTMLInputElement>(null);
  const [renamingRecipeIdx, setRenamingRecipeIdx] = useState<number | null>(null);
  const [recipeRenameValue, setRecipeRenameValue] = useState("");
  const recipeRenameRef = useRef<HTMLInputElement>(null);
  const [renamingTradeIdx, setRenamingTradeIdx] = useState<number | null>(null);
  const [tradeRenameValue, setTradeRenameValue] = useState("");
  const tradeRenameRef = useRef<HTMLInputElement>(null);
  const [renamingLootEntryIdx, setRenamingLootEntryIdx] = useState<number | null>(null);
  const [lootEntryRenameValue, setLootEntryRenameValue] = useState("");
  const lootEntryRenameRef = useRef<HTMLInputElement>(null);

  const [renamingBiomeIdx, setRenamingBiomeIdx] = useState<number | null>(null);
  const [biomeRenameValue, setBiomeRenameValue] = useState("");
  const biomeRenameRef = useRef<HTMLInputElement>(null);
  const [renamingDimensionIdx, setRenamingDimensionIdx] = useState<number | null>(null);
  const [dimensionRenameValue, setDimensionRenameValue] = useState("");
  const dimensionRenameRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const screenIds = screens.map(s => s.id);

  const handleScreenDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromIdx = screens.findIndex(s => s.id === active.id);
    const toIdx = screens.findIndex(s => s.id === over.id);
    if (fromIdx === -1 || toIdx === -1) return;
    onMoveScreen(fromIdx, toIdx);
  };

  useEffect(() => {
    if (renamingIdx !== null) renameRef.current?.focus();
  }, [renamingIdx]);

  const startRename = (idx: number) => {
    setRenamingIdx(idx);
    setRenameValue(screens[idx].id);
  };

  const commitRename = () => {
    if (renamingIdx !== null && renameValue.trim()) onRenameScreen(renamingIdx, renameValue.trim());
    setRenamingIdx(null);
  };

  useEffect(() => {
    if (renamingItemIdx !== null) itemRenameRef.current?.focus();
  }, [renamingItemIdx]);
  const startItemRename = (idx: number) => { setRenamingItemIdx(idx); setItemRenameValue(items[idx].id); };
  const commitItemRename = () => {
    if (renamingItemIdx !== null && itemRenameValue.trim()) onRenameItem(renamingItemIdx, itemRenameValue.trim());
    setRenamingItemIdx(null);
  };

  useEffect(() => {
    if (renamingBlockIdx !== null) blockRenameRef.current?.focus();
  }, [renamingBlockIdx]);
  const startBlockRename = (idx: number) => { setRenamingBlockIdx(idx); setBlockRenameValue(blocks[idx].id); };
  const commitBlockRename = () => {
    if (renamingBlockIdx !== null && blockRenameValue.trim()) onRenameBlock(renamingBlockIdx, blockRenameValue.trim());
    setRenamingBlockIdx(null);
  };

  useEffect(() => {
    if (renamingArmorIdx !== null) armorRenameRef.current?.focus();
  }, [renamingArmorIdx]);
  const startArmorRename = (idx: number) => { setRenamingArmorIdx(idx); setArmorRenameValue(armors[idx].id); };
  const commitArmorRename = () => {
    if (renamingArmorIdx !== null && armorRenameValue.trim()) onRenameArmor(renamingArmorIdx, armorRenameValue.trim());
    setRenamingArmorIdx(null);
  };

  useEffect(() => {
    if (renamingEntityIdx !== null) entityRenameRef.current?.focus();
  }, [renamingEntityIdx]);
  const startEntityRename = (idx: number) => { setRenamingEntityIdx(idx); setEntityRenameValue(entities[idx].id); };
  const commitEntityRename = () => {
    if (renamingEntityIdx !== null && entityRenameValue.trim()) onRenameEntity(renamingEntityIdx, entityRenameValue.trim());
    setRenamingEntityIdx(null);
  };

  useEffect(() => {
    if (renamingEffectIdx !== null) effectRenameRef.current?.focus();
  }, [renamingEffectIdx]);
  const startEffectRename = (idx: number) => { setRenamingEffectIdx(idx); setEffectRenameValue(effects[idx].id); };
  const commitEffectRename = () => {
    if (renamingEffectIdx !== null && effectRenameValue.trim()) onRenameEffect(renamingEffectIdx, effectRenameValue.trim());
    setRenamingEffectIdx(null);
  };

  useEffect(() => {
    if (renamingPotionIdx !== null) potionRenameRef.current?.focus();
  }, [renamingPotionIdx]);
  const startPotionRename = (idx: number) => { setRenamingPotionIdx(idx); setPotionRenameValue(potions[idx].id); };
  const commitPotionRename = () => {
    if (renamingPotionIdx !== null && potionRenameValue.trim()) onRenamePotion(renamingPotionIdx, potionRenameValue.trim());
    setRenamingPotionIdx(null);
  };

  useEffect(() => {
    if (renamingAchievementIdx !== null) achievementRenameRef.current?.focus();
  }, [renamingAchievementIdx]);
  const startAchievementRename = (idx: number) => { setRenamingAchievementIdx(idx); setAchievementRenameValue(achievements[idx].id); };
  const commitAchievementRename = () => {
    if (renamingAchievementIdx !== null && achievementRenameValue.trim()) onRenameAchievement(renamingAchievementIdx, achievementRenameValue.trim());
    setRenamingAchievementIdx(null);
  };

  useEffect(() => {
    if (renamingRecipeIdx !== null) recipeRenameRef.current?.focus();
  }, [renamingRecipeIdx]);
  const startRecipeRename = (idx: number) => { setRenamingRecipeIdx(idx); setRecipeRenameValue(recipes[idx].id); };
  const commitRecipeRename = () => {
    if (renamingRecipeIdx !== null && recipeRenameValue.trim()) onRenameRecipe(renamingRecipeIdx, recipeRenameValue.trim());
    setRenamingRecipeIdx(null);
  };

  useEffect(() => {
    if (renamingTradeIdx !== null) tradeRenameRef.current?.focus();
  }, [renamingTradeIdx]);
  const startTradeRename = (idx: number) => { setRenamingTradeIdx(idx); setTradeRenameValue(trades[idx].id); };
  const commitTradeRename = () => {
    if (renamingTradeIdx !== null && tradeRenameValue.trim()) onRenameTrade(renamingTradeIdx, tradeRenameValue.trim());
    setRenamingTradeIdx(null);
  };

  useEffect(() => {
    if (renamingLootEntryIdx !== null) lootEntryRenameRef.current?.focus();
  }, [renamingLootEntryIdx]);
  const startLootEntryRename = (idx: number) => { setRenamingLootEntryIdx(idx); setLootEntryRenameValue(lootEntries[idx].id); };
  const commitLootEntryRename = () => {
    if (renamingLootEntryIdx !== null && lootEntryRenameValue.trim()) onRenameLootEntry(renamingLootEntryIdx, lootEntryRenameValue.trim());
    setRenamingLootEntryIdx(null);
  };

  useEffect(() => {
    if (renamingBiomeIdx !== null) biomeRenameRef.current?.focus();
  }, [renamingBiomeIdx]);
  const startBiomeRename = (idx: number) => { setRenamingBiomeIdx(idx); setBiomeRenameValue(biomes[idx].id); };
  const commitBiomeRename = () => {
    if (renamingBiomeIdx !== null && biomeRenameValue.trim()) onRenameBiome(renamingBiomeIdx, biomeRenameValue.trim());
    setRenamingBiomeIdx(null);
  };

  useEffect(() => {
    if (renamingDimensionIdx !== null) dimensionRenameRef.current?.focus();
  }, [renamingDimensionIdx]);
  const startDimensionRename = (idx: number) => { setRenamingDimensionIdx(idx); setDimensionRenameValue(dimensions[idx].id); };
  const commitDimensionRename = () => {
    if (renamingDimensionIdx !== null && dimensionRenameValue.trim()) onRenameDimension(renamingDimensionIdx, dimensionRenameValue.trim());
    setRenamingDimensionIdx(null);
  };

  useEffect(() => {
    if (renamingTabIdx !== null) tabRenameRef.current?.focus();
  }, [renamingTabIdx]);
  const startTabRename = (idx: number) => { setRenamingTabIdx(idx); setTabRenameValue(creativeTabs[idx].displayName); };
  const commitTabRename = () => {
    if (renamingTabIdx !== null && tabRenameValue.trim()) onRenameCreativeTab(renamingTabIdx, tabRenameValue.trim());
    setRenamingTabIdx(null);
  };

  useEffect(() => {
    if (renamingAttrIdx !== null) attrRenameRef.current?.focus();
  }, [renamingAttrIdx]);
  const startAttrRename = (idx: number) => { setRenamingAttrIdx(idx); setAttrRenameValue(customAttributes[idx].displayName); };
  const commitAttrRename = () => {
    if (renamingAttrIdx !== null && attrRenameValue.trim()) onRenameCustomAttribute(renamingAttrIdx, attrRenameValue.trim());
    setRenamingAttrIdx(null);
  };

  useEffect(() => {
    if (renamingPresetId !== null) presetRenameRef.current?.focus();
  }, [renamingPresetId]);
  const startPresetRename = (p: AttributePreset) => { setRenamingPresetId(p.id); setPresetRenameValue(p.name); };
  const commitPresetRename = () => {
    if (renamingPresetId !== null && presetRenameValue.trim()) onRenameAttributePreset(renamingPresetId, presetRenameValue.trim());
    setRenamingPresetId(null);
  };

  useEffect(() => {
    if (renamingTemplateId !== null) templateRenameRef.current?.focus();
  }, [renamingTemplateId]);

  const startTemplateRename = (t: TemplateListItem) => {
    setRenamingTemplateId(t.id);
    setTemplateRenameValue(t.name);
  };

  const commitTemplateRename = () => {
    if (renamingTemplateId !== null && templateRenameValue.trim()) onRenameTemplate(renamingTemplateId, templateRenameValue.trim());
    setRenamingTemplateId(null);
  };

  const activeTemplates: TemplateListItem[] =
    activeDocType === "item" ? itemTemplates : activeDocType === "block" ? blockTemplates : templates;
  const docLabel = activeDocType === "item" ? "item" : activeDocType === "block" ? "block" : "screen";

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b">
        <div className="flex h-8 items-center gap-1 px-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 px-0 shrink-0" onClick={onGoHome} title="Back to projects">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {focusedGroup ? (
            <span className="flex min-w-0 items-center gap-1 text-sidebar-foreground">
              <button
                type="button"
                title="Show all categories"
                onClick={unfocusGroup}
                className="font-semibold truncate hover:underline"
              >
                {modId || "Unnamed project"}
              </button>
              <span className="shrink-0 text-muted-foreground">&gt;</span>
              <span className="font-semibold truncate">{GROUP_LABELS[focusedGroup] ?? focusedGroup}</span>
            </span>
          ) : (
            <span className="font-semibold truncate text-sidebar-foreground">
              {modId || "Unnamed project"}
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>

        {/* ── Screens ────────────────────────────────────────── */}
        <SidebarGroup className={showGroup("screens") ? undefined : "hidden"}>
          <SidebarGroupLabel
            className="cursor-pointer select-none"
            onClick={() => groupLabelClick("screens", setScreensOpen)}
          >
            {screensOpen
              ? <ChevronDown className="mr-1 h-3.5 w-3.5" />
              : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Screens
          </SidebarGroupLabel>

          <SidebarGroupAction title="Export all screens" onClick={onExportAllScreens} className="right-14">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Import screen JSON" onClick={onImportScreen} className="right-8">
            <Upload />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add screen" onClick={onAddScreen}>
            <Plus />
          </SidebarGroupAction>

          {screensOpen && (
            <SidebarGroupContent>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleScreenDragEnd}>
                <SortableContext items={screenIds} strategy={verticalListSortingStrategy}>
                  <SidebarMenu>
                    {screens.map((s, idx) => (
                      <SortableScreenItem key={s.id} id={s.id}>
                        {renamingIdx === idx ? (
                          <div className="px-2 py-0.5">
                            <Input
                              ref={renameRef}
                              className="h-6 text-xs"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") commitRename();
                                if (e.key === "Escape") setRenamingIdx(null);
                              }}
                              onBlur={commitRename}
                            />
                          </div>
                        ) : (
                          <>
                            <SidebarMenuButton
                              size="sm"
                              isActive={activeDocType === "screen" && idx === activeIdx}
                              onClick={() => onSelectScreen(idx)}
                              onDoubleClick={() => startRename(idx)}
                              className="pl-5 pr-16"
                            >
                              <span className="truncate">{s.id || "(unnamed)"}</span>
                            </SidebarMenuButton>
                            {/* Hover actions — three buttons in a row, absolutely positioned */}
                            <div className="absolute right-1 top-1.5 hidden items-center gap-0.5 group-hover/menu-item:flex">
                              <button
                                title="Export screen JSON"
                                onClick={e => { e.stopPropagation(); onExportScreen(idx); }}
                                className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
                              >
                                <Download />
                              </button>
                              <button
                                title="Rename"
                                onClick={e => { e.stopPropagation(); startRename(idx); }}
                                className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
                              >
                                <Pencil />
                              </button>
                              <button
                                title="Delete"
                                disabled={screens.length <= 1}
                                onClick={e => { e.stopPropagation(); onRemoveScreen(idx); }}
                                className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent disabled:pointer-events-none disabled:opacity-30 [&>svg]:size-3.5"
                              >
                                <Trash2 />
                              </button>
                            </div>
                          </>
                        )}
                      </SortableScreenItem>
                    ))}
                  </SidebarMenu>
                </SortableContext>
              </DndContext>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("screens") ? undefined : "hidden"} />

        {/* ── Items ──────────────────────────────────────────── */}
        <SidebarGroup className={showGroup("items") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("items", setItemsOpen)}>
            {itemsOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Items
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all items" onClick={onExportAllItems} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add item" onClick={onAddItem}>
            <Plus />
          </SidebarGroupAction>
          {itemsOpen && (
            <SidebarGroupContent>
              {items.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No items yet.</div>
              ) : (
                <SidebarMenu>
                  {items.map((it, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={it.id}
                      isActive={activeDocType === "item" && idx === activeItemIdx}
                      isRenaming={renamingItemIdx === idx}
                      renameValue={itemRenameValue}
                      renameRef={itemRenameRef}
                      onSelect={() => onSelectItem(idx)}
                      onStartRename={() => startItemRename(idx)}
                      onRenameChange={setItemRenameValue}
                      onCommitRename={commitItemRename}
                      onCancelRename={() => setRenamingItemIdx(null)}
                      onExport={() => onExportItem(idx)}
                      onDuplicate={() => onDuplicateItem(idx)}
                      onDelete={() => onRemoveItem(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("items") ? undefined : "hidden"} />

        {/* ── Blocks ─────────────────────────────────────────── */}
        <SidebarGroup className={showGroup("blocks") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("blocks", setBlocksOpen)}>
            {blocksOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Blocks
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all blocks" onClick={onExportAllBlocks} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add block" onClick={onAddBlock}>
            <Plus />
          </SidebarGroupAction>
          {blocksOpen && (
            <SidebarGroupContent>
              {blocks.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No blocks yet.</div>
              ) : (
                <SidebarMenu>
                  {blocks.map((b, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={b.id}
                      isActive={activeDocType === "block" && idx === activeBlockIdx}
                      isRenaming={renamingBlockIdx === idx}
                      renameValue={blockRenameValue}
                      renameRef={blockRenameRef}
                      onSelect={() => onSelectBlock(idx)}
                      onStartRename={() => startBlockRename(idx)}
                      onRenameChange={setBlockRenameValue}
                      onCommitRename={commitBlockRename}
                      onCancelRename={() => setRenamingBlockIdx(null)}
                      onExport={() => onExportBlock(idx)}
                      onDuplicate={() => onDuplicateBlock(idx)}
                      onDelete={() => onRemoveBlock(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("blocks") ? undefined : "hidden"} />

        {/* ── Armor ──────────────────────────────────────────── */}
        <SidebarGroup className={showGroup("armors") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("armors", setArmorsOpen)}>
            {armorsOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Armor
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all armor sets" onClick={onExportAllArmors} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add armor set" onClick={onAddArmor}>
            <Plus />
          </SidebarGroupAction>
          {armorsOpen && (
            <SidebarGroupContent>
              {armors.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No armor sets yet.</div>
              ) : (
                <SidebarMenu>
                  {armors.map((a, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={a.id}
                      isActive={activeDocType === "armor" && idx === activeArmorIdx}
                      isRenaming={renamingArmorIdx === idx}
                      renameValue={armorRenameValue}
                      renameRef={armorRenameRef}
                      onSelect={() => onSelectArmor(idx)}
                      onStartRename={() => startArmorRename(idx)}
                      onRenameChange={setArmorRenameValue}
                      onCommitRename={commitArmorRename}
                      onCancelRename={() => setRenamingArmorIdx(null)}
                      onExport={() => onExportArmor(idx)}
                      onDuplicate={() => onDuplicateArmor(idx)}
                      onDelete={() => onRemoveArmor(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("armors") ? undefined : "hidden"} />

        {/* ── Entities ───────────────────────────────────────── */}
        <SidebarGroup className={showGroup("entities") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("entities", setEntitiesOpen)}>
            {entitiesOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Entities
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all entities" onClick={onExportAllEntities} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add entity" onClick={onAddEntity}>
            <Plus />
          </SidebarGroupAction>
          {entitiesOpen && (
            <SidebarGroupContent>
              {entities.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No entities yet.</div>
              ) : (
                <SidebarMenu>
                  {entities.map((e, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={e.id}
                      isActive={activeDocType === "entity" && idx === activeEntityIdx}
                      isRenaming={renamingEntityIdx === idx}
                      renameValue={entityRenameValue}
                      renameRef={entityRenameRef}
                      onSelect={() => onSelectEntity(idx)}
                      onStartRename={() => startEntityRename(idx)}
                      onRenameChange={setEntityRenameValue}
                      onCommitRename={commitEntityRename}
                      onCancelRename={() => setRenamingEntityIdx(null)}
                      onExport={() => onExportEntity(idx)}
                      onDuplicate={() => onDuplicateEntity(idx)}
                      onDelete={() => onRemoveEntity(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("entities") ? undefined : "hidden"} />

        {/* ── Creative Tabs ──────────────────────────────────── */}
        <SidebarGroup className={showGroup("creativeTabs") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("creativeTabs", setCreativeTabsOpen)}>
            {creativeTabsOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Creative Tabs
          </SidebarGroupLabel>
          <SidebarGroupAction title="Add creative tab" onClick={onAddCreativeTab}>
            <Plus />
          </SidebarGroupAction>
          {creativeTabsOpen && (
            <SidebarGroupContent>
              {creativeTabs.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">
                  Only the vanilla tabs + one shared &quot;custom&quot; tab so far — add your own named tab here.
                </div>
              ) : (
                <SidebarMenu>
                  {creativeTabs.map((tab, idx) => (
                    <SidebarMenuItem key={tab.id} className="relative">
                      {renamingTabIdx === idx ? (
                        <div className="px-2 py-0.5">
                          <Input
                            ref={tabRenameRef}
                            className="h-6 text-xs"
                            value={tabRenameValue}
                            onChange={e => setTabRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") commitTabRename();
                              if (e.key === "Escape") setRenamingTabIdx(null);
                            }}
                            onBlur={commitTabRename}
                          />
                        </div>
                      ) : (
                        <>
                          <SidebarMenuButton size="sm" onDoubleClick={() => startTabRename(idx)} className="pl-5 pr-10 cursor-default">
                            <Tags className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{tab.displayName}</span>
                          </SidebarMenuButton>
                          <div className="absolute right-1 top-1.5 hidden items-center gap-0.5 group-hover/menu-item:flex">
                            <button
                              title="Rename"
                              onClick={e => { e.stopPropagation(); startTabRename(idx); }}
                              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
                            >
                              <Pencil />
                            </button>
                            <button
                              title="Delete"
                              onClick={e => { e.stopPropagation(); onRemoveCreativeTab(idx); }}
                              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("creativeTabs") ? undefined : "hidden"} />

        {/* ── Attribute Presets ──────────────────────────────── */}
        <SidebarGroup className={showGroup("attributePresets") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("attributePresets", setAttributePresetsOpen)}>
            {attributePresetsOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Attribute Presets
          </SidebarGroupLabel>
          <SidebarGroupAction title="Save current item's attributes as a preset" onClick={onSaveAttributePreset}>
            <SavePlus />
          </SidebarGroupAction>
          {attributePresetsOpen && (
            <SidebarGroupContent>
              {attributePresets.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">
                  No presets yet — select an item with attributes and save it as one.
                </div>
              ) : (
                <SidebarMenu>
                  {attributePresets.map((p) => (
                    <SidebarMenuItem key={p.id} className="relative">
                      {renamingPresetId === p.id ? (
                        <div className="px-2 py-0.5">
                          <Input
                            ref={presetRenameRef}
                            className="h-6 text-xs"
                            value={presetRenameValue}
                            onChange={e => setPresetRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") commitPresetRename();
                              if (e.key === "Escape") setRenamingPresetId(null);
                            }}
                            onBlur={commitPresetRename}
                          />
                        </div>
                      ) : (
                        <>
                          <SidebarMenuButton
                            size="sm"
                            onClick={() => onApplyAttributePreset(p.id)}
                            onDoubleClick={() => startPresetRename(p)}
                            title="Apply to the current item"
                            className="pl-5 pr-16"
                          >
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{p.name}</span>
                          </SidebarMenuButton>
                          <div className="absolute right-1 top-1.5 hidden items-center gap-0.5 group-hover/menu-item:flex">
                            <button
                              title="Rename"
                              onClick={e => { e.stopPropagation(); startPresetRename(p); }}
                              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
                            >
                              <Pencil />
                            </button>
                            <button
                              title="Delete"
                              onClick={e => { e.stopPropagation(); onDeleteAttributePreset(p.id); }}
                              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("attributePresets") ? undefined : "hidden"} />

        {/* ── Custom Attributes (global — usable from any item's Attributes list) ─ */}
        <SidebarGroup className={showGroup("customAttributes") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("customAttributes", setCustomAttributesOpen)}>
            {customAttributesOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Custom Attributes
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all custom attributes" onClick={onExportAllCustomAttributes} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add custom attribute" onClick={onAddCustomAttribute}>
            <Plus />
          </SidebarGroupAction>
          {customAttributesOpen && (
            <SidebarGroupContent>
              {customAttributes.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No custom attributes yet.</div>
              ) : (
                <SidebarMenu>
                  {customAttributes.map((attr, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={attr.displayName || attr.id}
                      isActive={activeDocType === "attribute" && idx === activeAttributeIdx}
                      isRenaming={renamingAttrIdx === idx}
                      renameValue={attrRenameValue}
                      renameRef={attrRenameRef}
                      onSelect={() => onSelectCustomAttribute(idx)}
                      onStartRename={() => startAttrRename(idx)}
                      onRenameChange={setAttrRenameValue}
                      onCommitRename={commitAttrRename}
                      onCancelRename={() => setRenamingAttrIdx(null)}
                      onExport={() => onExportCustomAttribute(idx)}
                      onDuplicate={() => onDuplicateCustomAttribute(idx)}
                      onDelete={() => onRemoveCustomAttribute(idx)}
                      icon={<Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("customAttributes") ? undefined : "hidden"} />

        {/* ── Effects ────────────────────────────────────────── */}
        <SidebarGroup className={showGroup("effects") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("effects", setEffectsOpen)}>
            {effectsOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Effects
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all effects" onClick={onExportAllEffects} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add effect" onClick={onAddEffect}>
            <Plus />
          </SidebarGroupAction>
          {effectsOpen && (
            <SidebarGroupContent>
              {effects.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No effects yet.</div>
              ) : (
                <SidebarMenu>
                  {effects.map((eff, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={eff.id}
                      isActive={activeDocType === "effect" && idx === activeEffectIdx}
                      isRenaming={renamingEffectIdx === idx}
                      renameValue={effectRenameValue}
                      renameRef={effectRenameRef}
                      onSelect={() => onSelectEffect(idx)}
                      onStartRename={() => startEffectRename(idx)}
                      onRenameChange={setEffectRenameValue}
                      onCommitRename={commitEffectRename}
                      onCancelRename={() => setRenamingEffectIdx(null)}
                      onExport={() => onExportEffect(idx)}
                      onDuplicate={() => onDuplicateEffect(idx)}
                      onDelete={() => onRemoveEffect(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("effects") ? undefined : "hidden"} />

        {/* ── Potions ────────────────────────────────────────── */}
        <SidebarGroup className={showGroup("potions") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("potions", setPotionsOpen)}>
            {potionsOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Potions
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all potions" onClick={onExportAllPotions} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add potion" onClick={onAddPotion}>
            <Plus />
          </SidebarGroupAction>
          {potionsOpen && (
            <SidebarGroupContent>
              {potions.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No potions yet.</div>
              ) : (
                <SidebarMenu>
                  {potions.map((p, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={p.id}
                      isActive={activeDocType === "potion" && idx === activePotionIdx}
                      isRenaming={renamingPotionIdx === idx}
                      renameValue={potionRenameValue}
                      renameRef={potionRenameRef}
                      onSelect={() => onSelectPotion(idx)}
                      onStartRename={() => startPotionRename(idx)}
                      onRenameChange={setPotionRenameValue}
                      onCommitRename={commitPotionRename}
                      onCancelRename={() => setRenamingPotionIdx(null)}
                      onExport={() => onExportPotion(idx)}
                      onDuplicate={() => onDuplicatePotion(idx)}
                      onDelete={() => onRemovePotion(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("potions") ? undefined : "hidden"} />

        {/* ── Texture Editor (single workspace entry, not a list) ─ */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="sm" isActive={activeDocType === "texture"} onClick={onOpenTextureEditor}>
                  <Paintbrush className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span>Texture Editor</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── My Textures (gallery of every custom-painted/uploaded texture) ─ */}
        <SidebarGroup>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => setMyTexturesOpen(v => !v)}>
            {myTexturesOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            My Textures
          </SidebarGroupLabel>
          {myTexturesOpen && (
            <SidebarGroupContent>
              {customTextureKeys.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No custom textures yet — paint or import one in the Texture Editor.</div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 px-2 py-1.5">
                  {customTextureKeys.map((key) => (
                    <div key={key} className="group/tex relative">
                      <button
                        type="button"
                        title={`${key.replace(/^custom\//, "")} — click to edit`}
                        onClick={() => onOpenExistingTexture(key)}
                        className="flex aspect-square w-full items-center justify-center overflow-hidden rounded border border-input bg-[#8b8b8b] hover:border-ring"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={packTextures[key]}
                          alt=""
                          draggable={false}
                          style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated" }}
                        />
                      </button>
                      <div className="absolute right-0 top-0 hidden gap-0.5 p-0.5 group-hover/tex:flex">
                        <button
                          type="button"
                          title="Rename"
                          onClick={(e) => {
                            e.stopPropagation();
                            const current = key.replace(/^custom\//, "").replace(/\.[^./]+$/, "");
                            const next = window.prompt("Rename texture:", current);
                            if (next && next.trim() && next.trim() !== current) renameCustomTexture(key, next.trim());
                          }}
                          className="flex h-4 w-4 items-center justify-center rounded bg-black/70 text-white hover:bg-black [&>svg]:size-2.5"
                        >
                          <Pencil />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={(e) => { e.stopPropagation(); deleteCustomTexture(key); }}
                          className="flex h-4 w-4 items-center justify-center rounded bg-black/70 text-white hover:bg-destructive [&>svg]:size-2.5"
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Achievements ───────────────────────────────────── */}
        <SidebarGroup className={showGroup("achievements") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("achievements", setAchievementsOpen)}>
            {achievementsOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            <Trophy className="mr-1 h-3.5 w-3.5" />
            Achievements
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all achievements" onClick={onExportAllAchievements} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add achievement" onClick={onAddAchievement}>
            <Plus />
          </SidebarGroupAction>
          {achievementsOpen && (
            <SidebarGroupContent>
              {achievements.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No achievements yet.</div>
              ) : (
                <SidebarMenu>
                  {achievements.map((a, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={a.id}
                      isActive={activeDocType === "achievement" && idx === activeAchievementIdx}
                      isRenaming={renamingAchievementIdx === idx}
                      renameValue={achievementRenameValue}
                      renameRef={achievementRenameRef}
                      onSelect={() => onSelectAchievement(idx)}
                      onStartRename={() => startAchievementRename(idx)}
                      onRenameChange={setAchievementRenameValue}
                      onCommitRename={commitAchievementRename}
                      onCancelRename={() => setRenamingAchievementIdx(null)}
                      onExport={() => onExportAchievement(idx)}
                      onDuplicate={() => onDuplicateAchievement(idx)}
                      onDelete={() => onRemoveAchievement(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("achievements") ? undefined : "hidden"} />

        {/* ── Crafting Recipes ───────────────────────────────── */}
        <SidebarGroup className={showGroup("recipes") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("recipes", setRecipesOpen)}>
            {recipesOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            <Hammer className="mr-1 h-3.5 w-3.5" />
            Crafting Recipes
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all recipes" onClick={onExportAllRecipes} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add recipe" onClick={onAddRecipe}>
            <Plus />
          </SidebarGroupAction>
          {recipesOpen && (
            <SidebarGroupContent>
              {recipes.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No recipes yet.</div>
              ) : (
                <SidebarMenu>
                  {recipes.map((r, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={r.id}
                      isActive={activeDocType === "recipe" && idx === activeRecipeIdx}
                      isRenaming={renamingRecipeIdx === idx}
                      renameValue={recipeRenameValue}
                      renameRef={recipeRenameRef}
                      onSelect={() => onSelectRecipe(idx)}
                      onStartRename={() => startRecipeRename(idx)}
                      onRenameChange={setRecipeRenameValue}
                      onCommitRename={commitRecipeRename}
                      onCancelRename={() => setRenamingRecipeIdx(null)}
                      onExport={() => onExportRecipe(idx)}
                      onDuplicate={() => onDuplicateRecipe(idx)}
                      onDelete={() => onRemoveRecipe(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("recipes") ? undefined : "hidden"} />

        {/* ── Trading — Villagers & Wandering Traders ─────────── */}
        <SidebarGroup className={showGroup("trades") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("trades", setTradesOpen)}>
            {tradesOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            <Users className="mr-1 h-3.5 w-3.5" />
            Trading
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all trades" onClick={onExportAllTrades} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add trade" onClick={onAddTrade}>
            <Plus />
          </SidebarGroupAction>
          {tradesOpen && (
            <SidebarGroupContent>
              {trades.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No trades yet.</div>
              ) : (
                <SidebarMenu>
                  {trades.map((t, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={t.id}
                      isActive={activeDocType === "trade" && idx === activeTradeIdx}
                      isRenaming={renamingTradeIdx === idx}
                      renameValue={tradeRenameValue}
                      renameRef={tradeRenameRef}
                      onSelect={() => onSelectTrade(idx)}
                      onStartRename={() => startTradeRename(idx)}
                      onRenameChange={setTradeRenameValue}
                      onCommitRename={commitTradeRename}
                      onCancelRename={() => setRenamingTradeIdx(null)}
                      onExport={() => onExportTrade(idx)}
                      onDuplicate={() => onDuplicateTrade(idx)}
                      onDelete={() => onRemoveTrade(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("trades") ? undefined : "hidden"} />

        {/* ── Loot Tables ──────────────────────────────────────── */}
        <SidebarGroup className={showGroup("lootEntries") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("lootEntries", setLootEntriesOpen)}>
            {lootEntriesOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            <Package className="mr-1 h-3.5 w-3.5" />
            Loot Tables
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all loot entries" onClick={onExportAllLootEntries} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add loot entry" onClick={onAddLootEntry}>
            <Plus />
          </SidebarGroupAction>
          {lootEntriesOpen && (
            <SidebarGroupContent>
              {lootEntries.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No loot entries yet.</div>
              ) : (
                <SidebarMenu>
                  {lootEntries.map((l, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={l.id}
                      isActive={activeDocType === "loot" && idx === activeLootEntryIdx}
                      isRenaming={renamingLootEntryIdx === idx}
                      renameValue={lootEntryRenameValue}
                      renameRef={lootEntryRenameRef}
                      onSelect={() => onSelectLootEntry(idx)}
                      onStartRename={() => startLootEntryRename(idx)}
                      onRenameChange={setLootEntryRenameValue}
                      onCommitRename={commitLootEntryRename}
                      onCancelRename={() => setRenamingLootEntryIdx(null)}
                      onExport={() => onExportLootEntry(idx)}
                      onDuplicate={() => onDuplicateLootEntry(idx)}
                      onDelete={() => onRemoveLootEntry(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("lootEntries") ? undefined : "hidden"} />

        {/* ── Biomes ───────────────────────────────────────────── */}
        <SidebarGroup className={showGroup("biomes") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("biomes", setBiomesOpen)}>
            {biomesOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            <Mountain className="mr-1 h-3.5 w-3.5" />
            Biomes
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all biomes" onClick={onExportAllBiomes} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add biome" onClick={onAddBiome}>
            <Plus />
          </SidebarGroupAction>
          {biomesOpen && (
            <SidebarGroupContent>
              {biomes.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No biomes yet.</div>
              ) : (
                <SidebarMenu>
                  {biomes.map((b, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={b.id}
                      isActive={activeDocType === "biome" && idx === activeBiomeIdx}
                      isRenaming={renamingBiomeIdx === idx}
                      renameValue={biomeRenameValue}
                      renameRef={biomeRenameRef}
                      onSelect={() => onSelectBiome(idx)}
                      onStartRename={() => startBiomeRename(idx)}
                      onRenameChange={setBiomeRenameValue}
                      onCommitRename={commitBiomeRename}
                      onCancelRename={() => setRenamingBiomeIdx(null)}
                      onExport={() => onExportBiome(idx)}
                      onDuplicate={() => onDuplicateBiome(idx)}
                      onDelete={() => onRemoveBiome(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("biomes") ? undefined : "hidden"} />

        {/* ── Dimensions ───────────────────────────────────────── */}
        <SidebarGroup className={showGroup("dimensions") ? undefined : "hidden"}>
          <SidebarGroupLabel className="cursor-pointer select-none" onClick={() => groupLabelClick("dimensions", setDimensionsOpen)}>
            {dimensionsOpen ? <ChevronDown className="mr-1 h-3.5 w-3.5" /> : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            <Globe className="mr-1 h-3.5 w-3.5" />
            Dimensions
          </SidebarGroupLabel>
          <SidebarGroupAction title="Export all dimensions" onClick={onExportAllDimensions} className="right-8">
            <Download />
          </SidebarGroupAction>
          <SidebarGroupAction title="Add dimension" onClick={onAddDimension}>
            <Plus />
          </SidebarGroupAction>
          {dimensionsOpen && (
            <SidebarGroupContent>
              {dimensions.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">No dimensions yet.</div>
              ) : (
                <SidebarMenu>
                  {dimensions.map((d, idx) => (
                    <SimpleListRow
                      key={idx}
                      label={d.id}
                      isActive={activeDocType === "dimension" && idx === activeDimensionIdx}
                      isRenaming={renamingDimensionIdx === idx}
                      renameValue={dimensionRenameValue}
                      renameRef={dimensionRenameRef}
                      onSelect={() => onSelectDimension(idx)}
                      onStartRename={() => startDimensionRename(idx)}
                      onRenameChange={setDimensionRenameValue}
                      onCommitRename={commitDimensionRename}
                      onCancelRename={() => setRenamingDimensionIdx(null)}
                      onExport={() => onExportDimension(idx)}
                      onDuplicate={() => onDuplicateDimension(idx)}
                      onDelete={() => onRemoveDimension(idx)}
                    />
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator className={showGroup("dimensions") ? undefined : "hidden"} />

        {/* ── Templates ──────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel
            className="cursor-pointer select-none"
            onClick={() => setTemplatesOpen(v => !v)}
          >
            {templatesOpen
              ? <ChevronDown className="mr-1 h-3.5 w-3.5" />
              : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
            Templates
          </SidebarGroupLabel>

          <SidebarGroupAction title={`Save current ${docLabel} as template`} onClick={onSaveTemplate}>
            <SavePlus />
          </SidebarGroupAction>

          {templatesOpen && (
            <SidebarGroupContent>
              {activeTemplates.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-muted-foreground">
                  No templates yet — save the current {docLabel} to start one.
                </div>
              ) : (
                <SidebarMenu>
                  {activeTemplates.map((t) => (
                    <SidebarMenuItem key={t.id} className="relative">
                      {renamingTemplateId === t.id ? (
                        <div className="px-2 py-0.5">
                          <Input
                            ref={templateRenameRef}
                            className="h-6 text-xs"
                            value={templateRenameValue}
                            onChange={e => setTemplateRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") commitTemplateRename();
                              if (e.key === "Escape") setRenamingTemplateId(null);
                            }}
                            onBlur={commitTemplateRename}
                          />
                        </div>
                      ) : (
                        <>
                          <SidebarMenuButton
                            size="sm"
                            onClick={() => onInsertTemplate(t.id)}
                            onDoubleClick={() => startTemplateRename(t)}
                            title={`Insert as new ${docLabel}`}
                            className="pl-5 pr-16"
                          >
                            <LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{t.name}</span>
                          </SidebarMenuButton>
                          <div className="absolute right-1 top-1.5 hidden items-center gap-0.5 group-hover/menu-item:flex">
                            <button
                              title="Rename"
                              onClick={e => { e.stopPropagation(); startTemplateRename(t); }}
                              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
                            >
                              <Pencil />
                            </button>
                            <button
                              title="Delete"
                              onClick={e => { e.stopPropagation(); onDeleteTemplate(t.id); }}
                              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-sidebar-accent [&>svg]:size-3.5"
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarSeparator />

        {/* ── Layers ─────────────────────────────────────────── (screen mode only) */}
        {activeDocType === "screen" && (
          <SidebarGroup>
            <SidebarGroupLabel
              className="cursor-pointer select-none"
              onClick={() => setLayersOpen(v => !v)}
            >
              {layersOpen
                ? <ChevronDown className="mr-1 h-3.5 w-3.5" />
                : <ChevronRight className="mr-1 h-3.5 w-3.5" />}
              Layers
            </SidebarGroupLabel>

            {layersOpen && (
              <SidebarGroupContent>
                <LayersTree
                  widgets={widgets}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  onSelect={onSelectWidget}
                  onAdd={onAddWidget}
                  onDelete={onDeleteWidget}
                  onToggleHidden={onToggleHiddenWidget}
                  onRename={onRenameWidget}
                  onReorder={onReorderWidget}
                />
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}


      </SidebarContent>
    </Sidebar>
  );
}
