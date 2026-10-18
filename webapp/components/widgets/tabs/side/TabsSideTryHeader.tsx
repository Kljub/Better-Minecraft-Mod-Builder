"use client";

import type { ComponentType } from "react";
import type { WidgetSpec } from "@/lib/types";
import { TAB_TOP_SLICE, computeSideTabLayout, sideTabSpot } from "../tabLayout";
import { SideTabBackground, SideTabLabel } from "../TabParts";

interface TryWidgetRootProps {
  widget: WidgetSpec;
  scale: number;
  childMap: Map<string, WidgetSpec[]>;
  zBase: number;
  allWidgets: WidgetSpec[];
  scrollListeners: Map<string, Set<() => void>>;
}

export function TabsSideTryHeader({
  widget, side, tabChildren, tex, resolvedTabId, setActiveTab, tabHeaderHeight,
  scale, childMap, activeTabChildren, allWidgets, TryWidgetRoot,
}: {
  widget: WidgetSpec;
  side: "left" | "right";
  tabChildren: WidgetSpec[];
  tex: (name: string) => string | undefined;
  resolvedTabId: string | null;
  setActiveTab: (tabsWidgetId: string, tabId: string) => void;
  tabHeaderHeight: number;
  scale: number;
  childMap: Map<string, WidgetSpec[]>;
  activeTabChildren: WidgetSpec[];
  allWidgets: WidgetSpec[];
  TryWidgetRoot: ComponentType<TryWidgetRootProps>;
}) {
  const overlap = TAB_TOP_SLICE;
  const strip = tabHeaderHeight;
  const tabThickness = strip + overlap;
  const tabs = computeSideTabLayout(tabChildren, widget.h);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{
        position: "absolute", top: 0, bottom: 0, width: strip, overflow: "visible", zIndex: 2,
        ...(side === "left" ? { left: 0 } : { left: widget.w - strip }),
      }}>
        {tabs.map(({ tab, y: tabY, h: tabLen }) => {
          const isActive = tab.id === resolvedTabId;
          const spot = sideTabSpot(tabY, tabLen, widget.h);
          return (
            <div
              key={tab.id}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setActiveTab(widget.id, tab.id)}
              style={{
                position: "absolute",
                left: side === "left" ? -1 : -overlap + 1,
                top: tabY, width: tabThickness, height: tabLen,
                zIndex: isActive ? 3 : 2,
                overflow: "visible", cursor: "pointer", userSelect: "none",
              }}
            >
              <SideTabBackground side={side} spot={spot} active={isActive} length={tabLen} thickness={tabThickness} />
              <SideTabLabel tab={tab} isActive={isActive} side={side} stripWidth={strip} overlap={overlap} tabLength={tabLen} />
            </div>
          );
        })}
      </div>
      <div style={{
        position: "absolute", top: 0, left: side === "left" ? strip : 0,
        width: widget.w - strip, height: widget.h, overflow: "hidden", zIndex: 1,
      }}>
        {tex("mc_panel_slice.png") && (
          <div style={{ position: "absolute", inset: 0, boxSizing: "border-box",
            borderImage: `url("${tex("mc_panel_slice.png")}") 3 fill / 3px stretch` }} />
        )}
        {activeTabChildren.map((child, idx) => (
          <TryWidgetRoot key={child.id} widget={child} scale={scale} childMap={childMap} zBase={idx + 1} allWidgets={allWidgets} scrollListeners={new Map()} />
        ))}
      </div>
    </div>
  );
}
