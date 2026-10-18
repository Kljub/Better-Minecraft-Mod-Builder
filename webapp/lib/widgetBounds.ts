import type { WidgetSpec } from "./types";

type Box = { x: number; y: number; w: number; h: number };

/**
 * Finds the closest sibling-edge/center alignment on one axis: checks the
 * dragged widget's leading edge, center, and trailing edge against the same
 * three points on each sibling, and returns the position that would make them
 * coincide exactly, plus a guide line spanning just the two widgets' extent
 * on the other axis. Returns null if no sibling is within `threshold`.
 */
export function findAxisAlignment(
  candidate: number,
  size: number,
  otherStart: number,
  otherSize: number,
  siblings: Box[],
  axis: "x" | "y",
  threshold: number,
): { value: number; guidePos: number; guideFrom: number; guideTo: number } | null {
  const targetEdges = [candidate, candidate + size / 2, candidate + size];
  // Centered alignment reads as more intentional than an edge coincidence, so it
  // wins ties and near-ties (e.g. two widgets of equal height, whose top, center,
  // and bottom would all match a sibling's at the exact same distance) rather than
  // whichever edge happens to be checked first.
  const CENTER_BIAS = threshold / 2;
  const rank = (dist: number, ti: number) => dist - (ti === 1 ? CENTER_BIAS : 0);
  let best: { dist: number; ti: number; value: number; guidePos: number; guideFrom: number; guideTo: number } | null = null;
  for (const s of siblings) {
    const sStart = axis === "x" ? s.x : s.y;
    const sSize = axis === "x" ? s.w : s.h;
    const sOtherStart = axis === "x" ? s.y : s.x;
    const sOtherSize = axis === "x" ? s.h : s.w;
    const siblingEdges = [sStart, sStart + sSize / 2, sStart + sSize];
    for (let ti = 0; ti < targetEdges.length; ti++) {
      for (const sEdge of siblingEdges) {
        const dist = Math.abs(targetEdges[ti] - sEdge);
        if (dist > threshold) continue;
        if (best && rank(dist, ti) >= rank(best.dist, best.ti)) continue;
        const value = Math.round(sEdge - (ti === 0 ? 0 : ti === 1 ? size / 2 : size));
        best = {
          dist,
          ti,
          value,
          guidePos: sEdge,
          guideFrom: Math.min(otherStart, sOtherStart),
          guideTo: Math.max(otherStart + otherSize, sOtherStart + sOtherSize),
        };
      }
    }
  }
  return best;
}

/** Which edge of a `tabs` widget its tab strip sits on ("tab_position" prop, default top). */
export type TabSide = "top" | "left" | "right";

export function tabSide(tabs: WidgetSpec): TabSide {
  const p = tabs.props?.tab_position;
  return p === "left" || p === "right" ? p : "top";
}

/**
 * The content pane of a `tabs` widget, relative to the widget's own origin —
 * the full widget minus the tab strip. `tab_height` is the strip's thickness:
 * its height for top tabs, its width for side tabs. A `tab` child's content
 * coordinates are relative to this rect's x/y.
 */
export function tabContentRect(tabs: WidgetSpec): { x: number; y: number; w: number; h: number } {
  const strip = parseInt(tabs.props?.tab_height ?? "20", 10);
  switch (tabSide(tabs)) {
    case "left":  return { x: strip, y: 0, w: tabs.w - strip, h: tabs.h };
    case "right": return { x: 0, y: 0, w: tabs.w - strip, h: tabs.h };
    default:      return { x: 0, y: strip, w: tabs.w, h: tabs.h - strip };
  }
}

/**
 * Returns the usable content area (width × height) of a `tabs` widget —
 * i.e. the full widget size minus the tab strip.
 */
export function tabContentArea(tabs: WidgetSpec): { w: number; h: number } {
  const { w, h } = tabContentRect(tabs);
  return { w, h };
}

/**
 * Returns the maximum x/y a widget can be dragged to without leaving its
 * parent container. Coordinates are relative to the container origin.
 * Falls back to the canvas dimensions for root widgets.
 */
export function computeDragBounds(
  target: WidgetSpec,
  allWidgets: WidgetSpec[],
  canvasW: number,
  canvasH: number,
): { maxX: number; maxY: number } {
  if (target.parentId) {
    const parent = allWidgets.find(w => w.id === target.parentId);
    if (parent?.type === "tab" && parent.parentId) {
      const tabs = allWidgets.find(w => w.id === parent.parentId);
      if (tabs) {
        const { w, h } = tabContentArea(tabs);
        return { maxX: w - target.w, maxY: h - target.h };
      }
    }
    if (parent) return { maxX: parent.w - target.w, maxY: parent.h - target.h };
  }
  return { maxX: canvasW - target.w, maxY: canvasH - target.h };
}

/**
 * Returns the maximum width/height a widget can be resized to without
 * overflowing its parent container, or null for root widgets (unconstrained).
 */
export function computeResizeBounds(
  widget: WidgetSpec,
  allWidgets: WidgetSpec[],
): { maxW: number; maxH: number } | null {
  if (!widget.parentId) return null;
  const parent = allWidgets.find(w => w.id === widget.parentId);
  if (!parent) return null;
  if (parent.type === "tab" && parent.parentId) {
    const tabs = allWidgets.find(w => w.id === parent.parentId);
    if (tabs) {
      const { w, h } = tabContentArea(tabs);
      return { maxW: w - widget.x, maxH: h - widget.y };
    }
  }
  return { maxW: parent.w - widget.x, maxH: parent.h - widget.y };
}

/**
 * Computes the w/h to use when adding a new widget as a child of parentId.
 * For `tab` children the content area comes from the grandparent `tabs` widget;
 * for any other container it comes from the parent's own dimensions.
 */
export function computeInitialSize(
  defaultW: number,
  defaultH: number,
  parentId: string | undefined,
  allWidgets: WidgetSpec[],
): { w: number; h: number } {
  if (!parentId) return { w: defaultW, h: defaultH };
  const parent = allWidgets.find(w => w.id === parentId);
  if (!parent) return { w: defaultW, h: defaultH };

  let clampW: number;
  let clampH: number;
  if (parent.type === "tab" && parent.parentId) {
    const tabs = allWidgets.find(w => w.id === parent.parentId);
    if (tabs) {
      const { w, h } = tabContentArea(tabs);
      clampW = w;
      clampH = h;
    } else {
      clampW = parent.w;
      clampH = parent.h;
    }
  } else {
    clampW = parent.w;
    clampH = parent.h;
  }
  return { w: Math.min(defaultW, clampW), h: Math.min(defaultH, clampH) };
}
