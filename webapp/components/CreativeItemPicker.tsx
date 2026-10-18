"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  ALL_ITEMS, CREATIVE_TABS, ITEM_ICONS, TAB_ITEMS, isBlockItem, itemLabel, searchItems, textureUrl,
  type CreativeTabId, type ItemIcon,
} from "@/lib/creativeInventory";

/**
 * Item picker styled like Minecraft's creative inventory: search bar, category tabs above and
 * below, a 9-wide slot grid with a scrollbar, block items drawn as little isometric cubes and a
 * tooltip on hover. "This Mod" lists the project's own items/blocks.
 */
export interface ModItem { id: string; label?: string; iconUrl?: string }

const SLOT = 36; // px — 18 px game slot at 2×

export default function CreativeItemPicker({ open, onClose, onSelect, modItems = [], blocksOnly = false, title }: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  modItems?: ModItem[];
  blocksOnly?: boolean;
  title?: string;
}) {
  const [tab, setTab] = useState<CreativeTabId>(modItems.length ? "mod" : "building_blocks");
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  const modIds = useMemo(() => modItems.map((m) => m.id), [modItems]);
  const modById = useMemo(() => new Map(modItems.map((m) => [m.id, m])), [modItems]);
  const tabs = CREATIVE_TABS.filter((t) => t.id !== "mod" || modItems.length);

  // Typing switches to the search tab, like the game.
  const activeTab: CreativeTabId = query.trim() ? "search" : tab;
  const shown = useMemo(() => {
    const base = activeTab === "search" ? [...modIds, ...ALL_ITEMS.map((i) => `minecraft:${i}`)]
      : activeTab === "mod" ? modIds
      : (TAB_ITEMS[activeTab] ?? []).map((i) => `minecraft:${i}`);
    const filtered = blocksOnly ? base.filter((id) => !id.startsWith("minecraft:") || isBlockItem(id.slice(10))) : base;
    return searchItems(filtered, query);
  }, [activeTab, query, modIds, blocksOnly]);

  if (!open) return null;
  const tabLabel = tabs.find((t) => t.id === activeTab)?.label ?? "";
  const rows = Math.max(5, Math.ceil(shown.length / 9));

  const tabButton = (t: (typeof CREATIVE_TABS)[number]) => {
    const active = activeTab === t.id;
    return (
      <button key={t.id} type="button" title={t.label} aria-label={t.label} aria-pressed={active}
        onClick={() => { setTab(t.id); if (t.id !== "search") setQuery(""); }}
        className={`mc-tab relative flex h-[44px] w-[42px] items-center justify-center ${active ? "mc-tab-active z-10" : ""}`}>
        {t.id === "mod" ? <ModTabIcon /> : <ItemIconView icon={ITEM_ICONS[t.icon]} size={24} />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" onMouseDown={onClose}>
      <div className="flex flex-col items-center gap-3" onMouseDown={(e) => e.stopPropagation()} data-testid="creative-item-picker">
        <div className="flex items-center gap-1">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search items" placeholder="Search…"
            className="h-8 w-[300px] border-2 border-[#a0a0a0] bg-black px-2 font-mono text-sm text-white outline-none placeholder:text-[#777]" />
          <button type="button" onClick={onClose} title="Close" className="mc-button flex h-8 w-8 items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col">
          <div className="flex items-end gap-0.5 pl-1" data-row="top">{tabs.filter((t) => t.row === "top").map(tabButton)}</div>
          <div className="mc-panel -mt-[2px] flex flex-col gap-1 p-2.5">
            <div className="text-sm text-[#3f3f3f]" style={{ fontFamily: "monospace" }}>{title && activeTab !== "search" ? `${title} — ${tabLabel}` : tabLabel}</div>
            <div className="mc-slots grid overflow-y-auto" style={{ gridTemplateColumns: `repeat(9, ${SLOT}px)`, maxHeight: SLOT * 6 + 4 }} data-testid="creative-grid">
              {Array.from({ length: rows * 9 }, (_, i) => {
                const id = shown[i];
                const mod = id ? modById.get(id) : undefined;
                return (
                  <button key={i} type="button" disabled={!id} data-item={id}
                    onClick={() => id && onSelect(id)}
                    onMouseMove={(e) => id && setHover({ id, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHover(null)}
                    className="mc-slot flex items-center justify-center enabled:hover:bg-[#c5c5c5]/60" style={{ width: SLOT, height: SLOT }}>
                    {id && (mod ? <ModItemIcon item={mod} /> : <ItemIconView icon={ITEM_ICONS[id.slice(10)]} size={28} />)}
                  </button>
                );
              })}
            </div>
            {shown.length === 0 && <div className="py-2 text-center text-xs text-[#3f3f3f]">No items match.</div>}
          </div>
          <div className="-mt-[2px] flex items-start gap-0.5 pl-1" data-row="bottom">{tabs.filter((t) => t.row === "bottom").map(tabButton)}</div>
        </div>
      </div>
      {hover && (
        <div className="pointer-events-none fixed z-[80] border-2 border-[#25015b] bg-[#100010]/95 px-2 py-1 text-xs text-white"
          style={{ left: hover.x + 14, top: hover.y - 10, fontFamily: "monospace" }}>
          {modById.get(hover.id)?.label ?? itemLabel(hover.id)}
          <div className="text-[10px] text-[#a8a8a8]">{hover.id}</div>
        </div>
      )}
    </div>
  );
}

/** One inventory icon: a flat sprite, or an isometric cube from its top/left/right textures. */
export function ItemIconView({ icon, size }: { icon?: ItemIcon; size: number }) {
  if (!icon) return <span className="text-[9px] text-[#3f3f3f]">?</span>;
  // Background images sized to the full width and anchored at the top: animated textures are tall
  // frame strips (command block, sea lantern, magma …) and show their first frame like this.
  const img = (path: string) => (
    <span className="absolute inset-0" style={{
      backgroundImage: `url(${textureUrl(path)})`, backgroundSize: "100% auto", backgroundPosition: "top", backgroundRepeat: "no-repeat", imageRendering: "pixelated",
    }} />
  );
  const tint = (path: string) => icon.k ? (
    <span className="absolute inset-0" style={{
      backgroundColor: icon.k, mixBlendMode: "multiply",
      WebkitMaskImage: `url(${textureUrl(path)})`, maskImage: `url(${textureUrl(path)})`,
      WebkitMaskSize: "100% auto", maskSize: "100% auto", WebkitMaskPosition: "top", maskPosition: "top", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
    }} />
  ) : null;
  if (icon.t === "f") {
    return (
      <span className="relative block" style={{ width: size, height: size }}>
        {icon.a && img(icon.a)}{icon.a && tint(icon.a)}
        {icon.b && img(icon.b)}
      </span>
    );
  }
  // Isometric cube like the game's inventory render. Face squares (s×s) are mapped with affine
  // matrices onto the cube's top / front-left / right faces; the cube is 2s tall and √3·s wide.
  const s = size / 2;
  const dx = (size - 1.732 * s) / 2;
  const face = (path: string | undefined, m: [number, number, number, number, number, number], shade: number, tinted = false) => path && (
    <span className="absolute left-0 top-0 block" style={{ width: s, height: s, transformOrigin: "0 0", transform: `matrix(${m.join(",")})`, filter: `brightness(${shade})` }}>
      {img(path)}{tinted && tint(path)}
    </span>
  );
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <span className="absolute top-0" style={{ left: dx }}>
        {face(icon.u, [0.866, -0.5, 0.866, 0.5, 0, 0.5 * s], 1, true)}
        {face(icon.l, [0.866, 0.5, 0, 1, 0, 0.5 * s], 0.8)}
        {face(icon.r, [0.866, -0.5, 0, 1, 0.866 * s, s], 0.6)}
      </span>
    </span>
  );
}

function ModItemIcon({ item }: { item: ModItem }) {
  if (item.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.iconUrl} alt="" className="h-7 w-7" style={{ imageRendering: "pixelated" }} />;
  }
  return <span className="text-[10px] font-bold text-[#3f3f3f]">{(item.label ?? item.id.split(":").pop() ?? "?").slice(0, 2).toUpperCase()}</span>;
}

function ModTabIcon() {
  return <ItemIconView icon={ITEM_ICONS["chest"]} size={24} />;
}
