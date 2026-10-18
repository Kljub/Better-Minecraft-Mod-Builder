import type { WidgetSpec } from "@/lib/types";

// Shared by TabsEditHeader.tsx and TabsTryHeader.tsx — both used to
// copy-paste this layout math, which meant a fix to one (e.g. default-width
// distribution, gap sizing) could silently stay missing from the other.

export const TAB_TOP_SLICE = 4;
export const TAB_SIDE_SLICE = 3;
export const TAB_LEFT_SLICE = 4;
export const TAB_GAP = 2;
export const NESTED_TAB_SLICE = 3;
export const NESTED_TAB_GAP = 0;

export interface ComputedTab {
  tab: WidgetSpec;
  x: number;
  w: number;
}

/**
 * Resolves each tab's on-screen x/width. Tabs default to x=0,w=0 until
 * dragged/resized once — while all tabs are still at that default, they're
 * distributed evenly across the container width; afterward each tab's own
 * x/w (set by a prior drag/resize) is used as-is.
 */
export function computeTabLayout(tabChildren: WidgetSpec[], containerWidth: number, gap?: number): {
  allDefault: boolean;
  defaultTabW: number;
  getW: (t: WidgetSpec) => number;
  getX: (t: WidgetSpec, i: number) => number;
  tabs: ComputedTab[];
} {
  const g = gap ?? TAB_GAP;
  const allDefault = tabChildren.length > 0 && tabChildren.every((t) => t.w === 0);
  const defaultTabW = tabChildren.length > 0
    ? Math.max(16, Math.floor((containerWidth - g * Math.max(0, tabChildren.length - 1)) / tabChildren.length))
    : 0;
  const getW = (t: WidgetSpec) => (allDefault ? defaultTabW : Math.max(16, t.w || defaultTabW));
  const getX = (t: WidgetSpec, i: number) => (allDefault
    ? tabChildren.slice(0, i).reduce((acc, prev) => acc + getW(prev) + g, 0)
    : t.x);

  const tabs = tabChildren.map((t, i) => ({ tab: t, w: getW(t), x: getX(t, i) }));

  return { allDefault, defaultTabW, getW, getX, tabs };
}

/**
 * Given a list of already-computed tabs and a new container width, push tabs
 * left (from right to left) to ensure no tab overflows past `newW` and the
 * minimum `gap` between adjacent tabs is maintained.
 * Returns a new array with adjusted x values; widths are unchanged.
 */
export function reflowTabsForWidth(tabs: ComputedTab[], newW: number, gap: number): ComputedTab[] {
  const result = tabs.map(t => ({ ...t }));
  const n = result.length;
  if (n === 0) return result;
  // Clamp rightmost tab to container edge
  result[n - 1].x = Math.min(result[n - 1].x, newW - result[n - 1].w);
  // Propagate left: each tab must not overlap the one to its right
  for (let i = n - 2; i >= 0; i--) {
    const next = result[i + 1];
    result[i].x = Math.min(result[i].x, next.x - result[i].w - gap);
  }
  return result;
}

/**
 * Minimum container width needed to fit all tabs at their current sizes with at least `gap` between them.
 * For default-layout tabs (all w=0), uses `minTabW` for each tab.
 */
export function tabsMinWidth(tabChildren: WidgetSpec[], gap?: number, minTabW = 16): number {
  if (tabChildren.length === 0) return minTabW;
  const g = gap ?? TAB_GAP;
  const allDefault = tabChildren.every((t) => t.w === 0);
  // Min width = sum of all tab widths (or minTabW each) + gaps between them
  const widths = tabChildren.map(t => (allDefault ? minTabW : Math.max(minTabW, t.w)));
  return widths.reduce((sum, w) => sum + w, 0) + (tabChildren.length - 1) * g;
}

/**
 * Commits evenly-distributed x/w values for all tabs, with the last tab
 * absorbing any remainder so tabs fill the container with zero gap.
 */
export function defaultTabLayout(tabChildren: WidgetSpec[], containerWidth: number, gap: number): WidgetSpec[] {
  const { getW, getX } = computeTabLayout(tabChildren, containerWidth, gap);
  return tabChildren.map((tc, i) => {
    const x = getX(tc, i);
    const w = i === tabChildren.length - 1 ? containerWidth - x : getW(tc);
    return { ...tc, x, w };
  });
}

export type TabDrag = {
  type: "move" | "resize-right" | "resize-left";
  id: string;
  startMouseX: number;
  startX: number; startW: number;
  minX: number; maxX: number;
  minW: number; maxW: number;
};

/** "left" | "middle" | "right" — which tab-sprite variant to use, based on whether the tab touches either edge of the tabs container. */
export function tabEdgePosition(tabX: number, tabW: number, containerWidth: number): "left" | "middle" | "right" {
  if (tabX <= 0) return "left";
  if (tabX + tabW >= containerWidth) return "right";
  return "middle";
}

/**
 * Side (left/right) tabs: stacked top-to-bottom, evenly sharing the container
 * height with `gap` between them. Unlike top tabs they have no per-tab
 * drag/resize — their x/w/y/h fields are ignored. Mirrors the runtime's
 * SpecWidgetBuilder.forEachTab side branch exactly.
 */
export function computeSideTabLayout(tabChildren: WidgetSpec[], containerHeight: number, gap = TAB_GAP): { tab: WidgetSpec; y: number; h: number }[] {
  const n = tabChildren.length;
  if (n === 0) return [];
  const h = Math.max(16, Math.floor((containerHeight - gap * (n - 1)) / n));
  return tabChildren.map((tab, i) => ({ tab, y: i * (h + gap), h }));
}

/** Where a side tab sits along its strip — picks vanilla's tab_left_/tab_right_{top,middle,bottom} sprite, whose corner art meets the content pane's top/bottom corner. */
export function sideTabSpot(tabY: number, tabH: number, containerHeight: number): "top" | "middle" | "bottom" {
  if (tabY <= 0) return "top";
  if (tabY + tabH >= containerHeight) return "bottom";
  return "middle";
}
