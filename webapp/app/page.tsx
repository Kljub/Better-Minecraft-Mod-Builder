"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import WelcomeScreen from "@/components/WelcomeScreen";
import SetupScreen from "@/components/SetupScreen";
import { useTextures } from "@/lib/TextureContext";
import type {
  ScreenSpec, ItemSpec, BlockSpec, CreativeTabSpec, CustomAttributeSpec, EffectSpec, PotionSpec,
  AchievementSpec, RecipeSpec, TradeSpec, LootEntrySpec, BiomeSpec, DimensionSpec, ArmorSpec,
} from "@/lib/types";
import type { ProjectSummary } from "@/components/WelcomeScreen";
import { migrateProjectJson, migrateScreenJson } from "@/lib/migrations";

const PROJECTS_KEY = "mc-ui-builder-projects";
const LEGACY_KEY = "mc-ui-builder-session";

interface HistoryEntry {
  screens: ScreenSpec[];
  items: ItemSpec[];
  blocks: BlockSpec[];
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
  armors: ArmorSpec[];
  activeIdx: number;
  activeDocType:
    | "screen" | "item" | "block" | "attribute" | "effect" | "potion" | "texture"
    | "achievement" | "recipe" | "trade" | "loot" | "biome" | "dimension" | "armor";
  activeItemIdx: number;
  activeBlockIdx: number;
  activeAttributeIdx: number;
  activeEffectIdx: number;
  activePotionIdx: number;
  activeAchievementIdx: number;
  activeRecipeIdx: number;
  activeTradeIdx: number;
  activeLootEntryIdx: number;
  activeBiomeIdx: number;
  activeDimensionIdx: number;
  activeArmorIdx: number;
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

function emptyHistoryEntry(screens: ScreenSpec[]): HistoryEntry {
  return {
    screens, items: [], blocks: [], creativeTabs: [], customAttributes: [], effects: [], potions: [],
    achievements: [], recipes: [], trades: [], lootEntries: [], biomes: [], dimensions: [], armors: [],
    activeIdx: 0, activeDocType: "screen", activeItemIdx: 0, activeBlockIdx: 0,
    activeAttributeIdx: 0, activeEffectIdx: 0, activePotionIdx: 0,
    activeAchievementIdx: 0, activeRecipeIdx: 0, activeTradeIdx: 0, activeLootEntryIdx: 0,
    activeBiomeIdx: 0, activeDimensionIdx: 0, activeArmorIdx: 0,
  };
}

function migrateSession(raw: Record<string, unknown>): SavedSession {
  const hist = raw.history as unknown[];
  if (!Array.isArray(hist) || hist.length === 0) {
    return { history: [emptyHistoryEntry([{ id: "main", width: 350, height: 200, widgets: [] }])], cursor: 0, gridSize: 4, showGrid: true };
  }
  if ('widgets' in (hist[0] as object)) {
    return { ...raw, history: (hist as ScreenSpec[]).map(s => emptyHistoryEntry([s])) } as unknown as SavedSession;
  }
  return raw as unknown as SavedSession;
}

function loadProjects(): StoredProject[] {
  try {
    const oldRaw = localStorage.getItem(LEGACY_KEY);
    if (oldRaw) {
      const old = JSON.parse(oldRaw) as Record<string, unknown>;
      const hist = old.history as unknown[];
      if (Array.isArray(hist) && hist.length > 0) {
        const key = `project_${Date.now()}`;
        const session = migrateSession(old);
        const list: StoredProject[] = [{ key, session, updatedAt: Date.now() }];
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
        localStorage.removeItem(LEGACY_KEY);
        return list;
      }
      localStorage.removeItem(LEGACY_KEY);
    }
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredProject[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(p => ({ ...p, session: migrateSession(p.session as unknown as Record<string, unknown>) }));
  } catch {
    return [];
  }
}

function saveProjects(projects: StoredProject[]): void {
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); } catch { /* quota */ }
}

function toSummaries(projects: StoredProject[]): ProjectSummary[] {
  return projects.map((p) => {
    const entry = p.session.history[p.session.cursor];
    const active = entry?.screens[entry.activeIdx] ?? entry?.screens[0];
    return { key: p.key, screenId: active?.id ?? "", modId: active?.modId, updatedAt: p.updatedAt };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function ProjectsPage() {
  const router = useRouter();
  const { initialized, setupRequired, ready } = useTextures();
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  useEffect(() => {
    setProjects(loadProjects());
    setProjectsLoaded(true);
  }, []);

  const handleOpenProject = useCallback((key: string) => {
    router.push(`/editor/${key}`);
  }, [router]);

  const handleCreateProject = useCallback((modId: string, screenId: string) => {
    const emptyScreen: ScreenSpec = { id: screenId, modId, width: 350, height: 200, widgets: [] };
    const session: SavedSession = {
      history: [emptyHistoryEntry([emptyScreen])],
      cursor: 0, gridSize: 4, showGrid: true, scale: 3,
    };
    const key = `project_${Date.now()}`;
    const newProject = { key, session, updatedAt: Date.now() };
    const current = loadProjects();
    saveProjects([...current, newProject]);
    setProjects((prev) => [...prev, newProject]);
    router.push(`/editor/${key}`);
  }, [router]);

  const handleDeleteProject = useCallback((key: string) => {
    setProjects((prev) => {
      const updated = prev.filter((p) => p.key !== key);
      saveProjects(updated);
      return updated;
    });
  }, []);

  const handleLoadProject = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        interface ProjectFile {
          screens: ScreenSpec[]; items?: ItemSpec[]; blocks?: BlockSpec[];
          creativeTabs?: CreativeTabSpec[]; customAttributes?: CustomAttributeSpec[];
          effects?: EffectSpec[]; potions?: PotionSpec[];
          achievements?: AchievementSpec[]; recipes?: RecipeSpec[]; trades?: TradeSpec[]; lootEntries?: LootEntrySpec[];
          biomes?: BiomeSpec[]; dimensions?: DimensionSpec[]; armors?: ArmorSpec[];
        }
        const migrated = migrateProjectJson(JSON.parse(ev.target?.result as string) as Record<string, unknown>) as unknown as ProjectFile;
        if (!Array.isArray(migrated.screens) || migrated.screens.length === 0) throw new Error("Invalid project file");
        const screens = migrated.screens
          .map((s) => migrateScreenJson(s as unknown as Record<string, unknown>))
          .map((s) => ({ ...s, widgets: s.widgets.map((w) => ({ ...w, props: w.props ?? {} })) }));
        for (const s of screens) {
          if (!s.id || !Array.isArray(s.widgets)) throw new Error("Invalid ScreenSpec in project");
        }
        const items = Array.isArray(migrated.items) ? migrated.items : [];
        const blocks = Array.isArray(migrated.blocks) ? migrated.blocks : [];
        const creativeTabs = Array.isArray(migrated.creativeTabs) ? migrated.creativeTabs : [];
        const customAttributes = Array.isArray(migrated.customAttributes) ? migrated.customAttributes : [];
        const effects = Array.isArray(migrated.effects) ? migrated.effects : [];
        const potions = Array.isArray(migrated.potions) ? migrated.potions : [];
        const achievements = Array.isArray(migrated.achievements) ? migrated.achievements : [];
        const recipes = Array.isArray(migrated.recipes) ? migrated.recipes : [];
        const trades = Array.isArray(migrated.trades) ? migrated.trades : [];
        const lootEntries = Array.isArray(migrated.lootEntries) ? migrated.lootEntries : [];
        const biomes = Array.isArray(migrated.biomes) ? migrated.biomes : [];
        const dimensions = Array.isArray(migrated.dimensions) ? migrated.dimensions : [];
        const armors = Array.isArray(migrated.armors) ? migrated.armors : [];
        const key = `project_${Date.now()}`;
        const session: SavedSession = {
          history: [{
            ...emptyHistoryEntry(screens), items, blocks, creativeTabs, customAttributes, effects, potions,
            achievements, recipes, trades, lootEntries, biomes, dimensions, armors,
          }],
          cursor: 0, gridSize: 4, showGrid: true, scale: 3,
        };
        const newProject = { key, session, updatedAt: Date.now() };
        const current = loadProjects();
        saveProjects([...current, newProject]);
        setProjects((prev) => [...prev, newProject]);
        router.push(`/editor/${key}`);
      } catch {
        alert("Failed to load project: invalid or corrupt JSON.");
      }
    };
    reader.readAsText(file);
  }, [router]);

  const handleEditTestScreen = useCallback(async () => {
    try {
      const res = await fetch("/api/dev/test-screen");
      if (!res.ok) throw new Error("Failed to load test screen");
      const parsed = await res.json() as ScreenSpec;
      if (!parsed.id || !Array.isArray(parsed.widgets)) throw new Error("Invalid ScreenSpec");
      const DEV_TEST_KEY = "__dev_test_screen__";
      const session: SavedSession = {
        history: [emptyHistoryEntry([parsed])],
        cursor: 0, gridSize: 4, showGrid: true, scale: 3,
      };
      const current = loadProjects();
      const exists = current.find(p => p.key === DEV_TEST_KEY);
      const updatedList = exists
        ? current.map(p => p.key === DEV_TEST_KEY ? { ...p, session, updatedAt: Date.now() } : p)
        : [...current, { key: DEV_TEST_KEY, session, updatedAt: Date.now() }];
      saveProjects(updatedList);
      setProjects(updatedList);
      router.push(`/editor/${DEV_TEST_KEY}`);
    } catch (e) {
      alert(`Could not load test screen: ${e instanceof Error ? e.message : e}`);
    }
  }, [router]);

  if (!projectsLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-200">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-400 border-t-transparent" />
      </div>
    );
  }

  if (initialized && setupRequired && !ready) {
    return <SetupScreen />;
  }

  return (
    <WelcomeScreen
      projects={toSummaries(projects)}
      onOpenProject={handleOpenProject}
      onCreateProject={handleCreateProject}
      onLoadProject={handleLoadProject}
      onDeleteProject={handleDeleteProject}
      onEditTestScreen={handleEditTestScreen}
    />
  );
}
