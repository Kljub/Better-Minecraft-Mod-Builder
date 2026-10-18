import { describe, it, expect } from "vitest";
import { tabContentArea, tabContentRect, computeDragBounds, computeResizeBounds, computeInitialSize, findAxisAlignment } from "@/lib/widgetBounds";
import { makeWidget } from "./fixtures";
import { computeSideTabLayout, sideTabSpot } from "@/components/widgets/tabs/tabLayout";

// ── tabContentArea ─────────────────────────────────────────────────────────────

describe("tabContentArea", () => {
  it("subtracts tab_height from the tabs widget height", () => {
    const tabs = makeWidget({ id: "tabs", type: "tabs", w: 200, h: 150, props: { tab_height: "30" } });
    expect(tabContentArea(tabs)).toEqual({ w: 200, h: 120 });
  });

  it("defaults tab_height to 20 when prop absent", () => {
    const tabs = makeWidget({ id: "tabs", type: "tabs", w: 100, h: 80 });
    expect(tabContentArea(tabs)).toEqual({ w: 100, h: 60 });
  });
});

describe("tabContentRect", () => {
  it("puts the pane below the strip for top tabs", () => {
    const tabs = makeWidget({ id: "tabs", type: "tabs", w: 200, h: 150, props: { tab_height: "30" } });
    expect(tabContentRect(tabs)).toEqual({ x: 0, y: 30, w: 200, h: 120 });
  });

  it("puts the pane right of the strip for left tabs (tab_height = strip width)", () => {
    const tabs = makeWidget({ id: "tabs", type: "tabs", w: 200, h: 150, props: { tab_height: "40", tab_position: "left" } });
    expect(tabContentRect(tabs)).toEqual({ x: 40, y: 0, w: 160, h: 150 });
    expect(tabContentArea(tabs)).toEqual({ w: 160, h: 150 });
  });

  it("puts the pane left of the strip for right tabs", () => {
    const tabs = makeWidget({ id: "tabs", type: "tabs", w: 200, h: 150, props: { tab_height: "40", tab_position: "right" } });
    expect(tabContentRect(tabs)).toEqual({ x: 0, y: 0, w: 160, h: 150 });
  });
});

describe("computeSideTabLayout", () => {
  it("stacks tabs evenly over the height with a 2px gap", () => {
    const tabs = ["a", "b", "c"].map((id) => makeWidget({ id, type: "tab" }));
    expect(computeSideTabLayout(tabs, 150).map(({ y, h }) => ({ y, h }))).toEqual([
      { y: 0, h: 48 }, { y: 50, h: 48 }, { y: 100, h: 48 },
    ]);
  });

  it("labels the first/last tab as top/bottom for sprite choice", () => {
    expect(sideTabSpot(0, 48, 150)).toBe("top");
    expect(sideTabSpot(50, 48, 150)).toBe("middle");
    expect(sideTabSpot(100, 50, 150)).toBe("bottom");
  });
});

// ── computeInitialSize ─────────────────────────────────────────────────────────

describe("computeInitialSize", () => {
  it("returns default size when no parent", () => {
    expect(computeInitialSize(60, 30, undefined, [])).toEqual({ w: 60, h: 30 });
  });

  it("clamps to panel/group parent dimensions", () => {
    const panel = makeWidget({ id: "panel", type: "panel", w: 40, h: 20 });
    // default size larger than panel → clamps
    expect(computeInitialSize(60, 30, "panel", [panel])).toEqual({ w: 40, h: 20 });
  });

  it("does not grow beyond default size inside a large parent", () => {
    const panel = makeWidget({ id: "panel", type: "panel", w: 200, h: 200 });
    expect(computeInitialSize(60, 30, "panel", [panel])).toEqual({ w: 60, h: 30 });
  });

  it("uses tabs content area (not tab header dimensions) for tab children", () => {
    const tabs = makeWidget({ id: "tabs", type: "tabs", w: 160, h: 120, props: { tab_height: "20" } });
    // tab widget's own w/h are tiny (header button), should NOT be used
    const tab = makeWidget({ id: "tab1", type: "tab", w: 40, h: 20, parentId: "tabs" });
    const all = [tabs, tab];
    // content area is 160 × 100; default 80×50 fits
    expect(computeInitialSize(80, 50, "tab1", all)).toEqual({ w: 80, h: 50 });
  });

  it("clamps to tabs content area when default exceeds it", () => {
    const tabs = makeWidget({ id: "tabs", type: "tabs", w: 100, h: 60, props: { tab_height: "20" } });
    const tab = makeWidget({ id: "tab1", type: "tab", w: 30, h: 15, parentId: "tabs" });
    // content area 100×40; default 120×80 → clamped to 100×40
    expect(computeInitialSize(120, 80, "tab1", [tabs, tab])).toEqual({ w: 100, h: 40 });
  });

  it("falls back to tab own dimensions when grandparent tabs widget is missing", () => {
    const tab = makeWidget({ id: "tab1", type: "tab", w: 30, h: 15, parentId: "orphan-tabs" });
    expect(computeInitialSize(60, 30, "tab1", [tab])).toEqual({ w: 30, h: 15 });
  });

  it("returns default size when parentId is not found in widgets list", () => {
    expect(computeInitialSize(60, 30, "ghost", [])).toEqual({ w: 60, h: 30 });
  });
});

// ── computeDragBounds ──────────────────────────────────────────────────────────

describe("computeDragBounds", () => {
  it("root widget is bounded by canvas dimensions", () => {
    const btn = makeWidget({ id: "btn", type: "button", w: 20, h: 10 });
    expect(computeDragBounds(btn, [btn], 320, 180)).toEqual({ maxX: 300, maxY: 170 });
  });

  it("widget inside a panel is bounded by panel dimensions", () => {
    const panel = makeWidget({ id: "panel", type: "panel", w: 80, h: 60 });
    const btn = makeWidget({ id: "btn", type: "button", w: 20, h: 10, parentId: "panel" });
    expect(computeDragBounds(btn, [panel, btn], 320, 180)).toEqual({ maxX: 60, maxY: 50 });
  });

  it("tab child is bounded by the tabs content area, not the tab button dimensions", () => {
    const tabs = makeWidget({ id: "tabs", type: "tabs", w: 160, h: 120, props: { tab_height: "20" } });
    // tab button is tiny — its w/h must NOT be used for bounds
    const tab = makeWidget({ id: "tab1", type: "tab", w: 30, h: 15, parentId: "tabs" });
    const btn = makeWidget({ id: "btn", type: "button", w: 20, h: 10, parentId: "tab1" });
    // content area 160 × (120-20)=100; maxX = 160-20=140, maxY = 100-10=90
    expect(computeDragBounds(btn, [tabs, tab, btn], 320, 180)).toEqual({ maxX: 140, maxY: 90 });
  });

  it("falls back to canvas when grandparent tabs widget is missing", () => {
    const tab = makeWidget({ id: "tab1", type: "tab", w: 30, h: 15, parentId: "ghost-tabs" });
    const btn = makeWidget({ id: "btn", type: "button", w: 20, h: 10, parentId: "tab1" });
    // parent is tab, but grandparent not found → falls back to tab's own dims
    expect(computeDragBounds(btn, [tab, btn], 320, 180)).toEqual({ maxX: 10, maxY: 5 });
  });
});

// ── computeResizeBounds ────────────────────────────────────────────────────────

describe("computeResizeBounds", () => {
  it("returns null for root widgets", () => {
    const btn = makeWidget({ id: "btn", type: "button" });
    expect(computeResizeBounds(btn, [btn])).toBeNull();
  });

  it("constrains resize within panel parent", () => {
    const panel = makeWidget({ id: "panel", type: "panel", w: 80, h: 60 });
    const btn = makeWidget({ id: "btn", type: "button", x: 10, y: 5, w: 20, h: 10, parentId: "panel" });
    // maxW = 80-10=70, maxH = 60-5=55
    expect(computeResizeBounds(btn, [panel, btn])).toEqual({ maxW: 70, maxH: 55 });
  });

  it("constrains resize within tabs content area for tab children", () => {
    const tabs = makeWidget({ id: "tabs", type: "tabs", w: 160, h: 120, props: { tab_height: "20" } });
    const tab = makeWidget({ id: "tab1", type: "tab", w: 30, h: 15, parentId: "tabs" });
    const btn = makeWidget({ id: "btn", type: "button", x: 10, y: 5, w: 20, h: 10, parentId: "tab1" });
    // content area 160×100; maxW = 160-10=150, maxH = 100-5=95
    expect(computeResizeBounds(btn, [tabs, tab, btn])).toEqual({ maxW: 150, maxH: 95 });
  });

  it("returns null when parentId present but parent not found", () => {
    const btn = makeWidget({ id: "btn", type: "button", parentId: "ghost" });
    expect(computeResizeBounds(btn, [btn])).toBeNull();
  });
});

// ── findAxisAlignment ──────────────────────────────────────────────────────────

describe("findAxisAlignment", () => {
  it("returns null when no sibling edge is within the threshold", () => {
    const sibling = { x: 100, y: 0, w: 20, h: 10 };
    expect(findAxisAlignment(0, 10, 0, 10, [sibling], "x", 4)).toBeNull();
  });

  it("matches a closer edge over a farther center", () => {
    // Sibling is huge so its center/right edges are far away — only its left
    // edge (100) can possibly match, isolating the left-edge comparison.
    // candidate x=99, size=10 → left edge 99, distance 1 from sibling's 100.
    const sibling = { x: 100, y: 0, w: 1000, h: 10 };
    const result = findAxisAlignment(99, 10, 0, 10, [sibling], "x", 1);
    expect(result?.value).toBe(100); // snapped so candidate's left edge lands on 100
    expect(result?.guidePos).toBe(100);
  });

  it("prefers a close center match over a farther-but-still-in-threshold edge match", () => {
    // sibling edges: left=100, center=110, right=120.
    // candidate x=104, size=10 → candidate edges: left=104, center=109, right=114.
    // left-left distance = 4 (passes threshold); center-center = 1 (closer, and biased).
    const sibling = { x: 100, y: 0, w: 20, h: 10 };
    const result = findAxisAlignment(104, 10, 0, 10, [sibling], "x", 4);
    // Snapped so candidate's center lands on sibling's center (110): value = 110 - size/2.
    expect(result?.value).toBe(105);
    expect(result?.guidePos).toBe(110);
  });

  it("prefers center alignment over top/bottom on an exact tie (equal-height siblings)", () => {
    // Equal-height sibling: top/center/bottom of the candidate are all the same
    // distance from the sibling's top/center/bottom — center must win the tie
    // rather than whichever edge happens to be checked first.
    const sibling = { x: 0, y: 50, w: 10, h: 20 }; // edges: top=50, center=60, bottom=70
    const result = findAxisAlignment(53, 20, 0, 10, [sibling], "y", 4); // candidate edges: 53, 63, 73
    // Snapped so candidate's center lands on sibling's center (60): value = 60 - size/2.
    expect(result?.value).toBe(50);
    expect(result?.guidePos).toBe(60);
  });

  it("computes the guide span as the union of both widgets' extent on the other axis", () => {
    const sibling = { x: 100, y: 30, w: 20, h: 5 }; // other-axis (y) extent: 30..35
    // candidate's other-axis (y) extent: otherStart=40, otherSize=10 → 40..50
    const result = findAxisAlignment(97, 10, 40, 10, [sibling], "x", 4);
    expect(result?.guideFrom).toBe(30);
    expect(result?.guideTo).toBe(50);
  });

  it("rounds center-alignment values to whole pixels for odd-sized widgets", () => {
    // sibling center = 100 + 15/2 = 107.5; candidate size 20 → center offset 10.
    // value = 107.5 - 10 = 97.5, which must be rounded so exported x stays an integer.
    const sibling = { x: 100, y: 0, w: 15, h: 10 };
    const result = findAxisAlignment(97, 20, 0, 10, [sibling], "x", 4);
    expect(result?.value).toBe(98);
    expect(Number.isInteger(result!.value)).toBe(true);
  });

  it("picks the closest match across multiple siblings", () => {
    // Both siblings are huge so only their left edges can possibly match —
    // isolates which sibling's left edge is closer without cross-edge noise.
    const near = { x: 1, y: 0, w: 1000, h: 10 };    // left edge 1, distance 1
    const far = { x: 1000, y: 0, w: 1000, h: 10 };  // left edge 1000, far outside threshold
    const result = findAxisAlignment(0, 10, 0, 10, [far, near], "x", 1);
    expect(result?.value).toBe(1);
  });
});
