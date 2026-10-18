"use client";

import type { ComponentType, MutableRefObject, RefObject } from "react";
import type { WidgetSpec } from "@/lib/types";
import { TAB_TOP_SLICE, computeSideTabLayout, sideTabSpot } from "../tabLayout";
import { SelectionOverlay } from "@/components/SelectionOverlay";
import { SideTabBackground, SideTabLabel } from "../TabParts";
import { GuideLines, type DragGuidesInfo } from "@/components/DragGuides";
import { GroupSelectionOverlay, type GroupDragInfo } from "@/components/GroupSelectionOverlay";

interface EditWidgetProps {
  widget: WidgetSpec;
  scale: number;
  selectedId: string | null;
  selectedIds: string[];
  snapPx: number;
  draggingPos: { id: string; x: number; y: number } | null;
  draggingSize: { id: string; w: number; h: number; x: number; y: number } | null;
  setDraggingSize: (v: { id: string; w: number; h: number; x: number; y: number } | null) => void;
  dragGuides: DragGuidesInfo | null;
  groupDrag: GroupDragInfo | null;
  onResizeCommit: (widget: WidgetSpec) => void;
  childMap: Map<string, WidgetSpec[]>;
  zBase: number;
}

/**
 * Tab strip down the left or right edge of a `tabs` widget ("tab_position"
 * prop). Tabs stack evenly over the full height (no per-tab drag/resize);
 * `tabHeaderHeight` is the strip's width here.
 */
export function TabsSideEditHeader({
  widget, side, tabChildren, tex, activeTabId, inlineEdit, setInlineEdit,
  inlineInputRef, commitInlineEdit, setPreviewTabId, tabHeaderHeight,
  scale, selectedId, selectedIds, selectionChangedRef, snapPx, draggingPos, draggingSize, setDraggingSize, dragGuides, groupDrag, onResizeCommit, childMap, activeTabChildren, EditWidget,
}: {
  widget: WidgetSpec;
  side: "left" | "right";
  tabChildren: WidgetSpec[];
  tex: (name: string) => string | undefined;
  activeTabId: string | null;
  inlineEdit: { id: string; text: string } | null;
  setInlineEdit: (edit: { id: string; text: string } | null) => void;
  inlineInputRef: RefObject<HTMLInputElement | null>;
  commitInlineEdit: (draft: string) => void;
  setPreviewTabId: (id: string) => void;
  tabHeaderHeight: number;
  scale: number;
  selectedId: string | null;
  selectedIds: string[];
  snapPx: number;
  draggingPos: { id: string; x: number; y: number } | null;
  draggingSize: { id: string; w: number; h: number; x: number; y: number } | null;
  setDraggingSize: (v: { id: string; w: number; h: number; x: number; y: number } | null) => void;
  dragGuides: DragGuidesInfo | null;
  groupDrag: GroupDragInfo | null;
  onResizeCommit: (widget: WidgetSpec) => void;
  childMap: Map<string, WidgetSpec[]>;
  activeTabChildren: WidgetSpec[];
  selectionChangedRef: MutableRefObject<boolean>;
  EditWidget: ComponentType<EditWidgetProps>;
}) {
  const overlap = TAB_TOP_SLICE;
  const liveW = draggingSize?.id === widget.id ? draggingSize.w : widget.w;
  const liveH = draggingSize?.id === widget.id ? draggingSize.h : widget.h;
  const strip = tabHeaderHeight;
  const tabThickness = strip + overlap;
  const tabs = computeSideTabLayout(tabChildren, liveH);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div data-tab-header style={{
        position: "absolute", top: 0, bottom: 0, width: strip, overflow: "visible", zIndex: 2,
        ...(side === "left" ? { left: 0 } : { left: liveW - strip }),
      }}>
        {tabs.filter(({ tab }) => !tab.hidden).map(({ tab, y: tabY, h: tabLen }) => {
          const isActive = tab.id === activeTabId;
          const spot = sideTabSpot(tabY, tabLen, liveH);
          return (
            <div
              key={tab.id}
              data-widget-id={tab.id}
              style={{
                position: "absolute",
                // Pokes 1px past the outer edge and `overlap`px into the pane, like top tabs.
                left: side === "left" ? -1 : -overlap + 1,
                top: tabY, width: tabThickness, height: tabLen,
                zIndex: isActive ? 3 : 2,
                overflow: "visible", userSelect: "none", cursor: "default",
              }}
              onClick={() => setPreviewTabId(tab.id)}
              onDoubleClick={(e) => {
                if (selectedId !== tab.id) return;
                if (selectionChangedRef.current) return;
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                setInlineEdit({ id: tab.id, text: tab.text });
              }}
            >
              <SideTabBackground side={side} spot={spot} active={isActive} length={tabLen} thickness={tabThickness} />
              <SideTabLabel tab={tab} isActive={isActive} side={side} stripWidth={strip} overlap={overlap} tabLength={tabLen} editing={inlineEdit?.id === tab.id} />
              {inlineEdit?.id === tab.id && (
                <input
                  ref={inlineInputRef}
                  defaultValue={inlineEdit.text}
                  onBlur={(e) => commitInlineEdit(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.currentTarget.blur(); }
                    if (e.key === "Escape") { setInlineEdit(null); }
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute", top: "50%", transform: "translateY(-50%)", height: 10,
                    left: side === "left" ? 0 : overlap, width: strip,
                    background: "rgba(0,0,0,0.75)",
                    color: "#fff", border: "none", outline: "2px solid #ff0",
                    fontSize: 6, fontFamily: '"Minecraft", monospace',
                    textAlign: "center",
                    zIndex: 10, padding: 0,
                  }}
                />
              )}
              {selectedId === tab.id && <SelectionOverlay scale={scale} knobs={[]} />}
            </div>
          );
        })}
      </div>
      <div style={{
        position: "absolute", top: 0,
        left: side === "left" ? strip : 0,
        width: liveW - strip, height: liveH,
        overflow: "hidden", zIndex: 1,
      }}>
        {tex("mc_panel_slice.png") && (
          <div style={{ position: "absolute", inset: 0, boxSizing: "border-box",
            borderImage: `url("${tex("mc_panel_slice.png")}") 3 fill / 3px stretch` }} />
        )}
        {dragGuides && dragGuides.parentId === activeTabId && <GuideLines {...dragGuides} />}
        <GroupSelectionOverlay widgets={activeTabChildren} selectedIds={selectedIds} groupDrag={groupDrag} />
        {!tabChildren.find(t => t.id === activeTabId)?.hidden && activeTabChildren.map((child, idx) => (
          <EditWidget key={child.id} widget={child} scale={scale} selectedId={selectedId} selectedIds={selectedIds}
            snapPx={snapPx} draggingPos={draggingPos} draggingSize={draggingSize}
            setDraggingSize={setDraggingSize} dragGuides={dragGuides} groupDrag={groupDrag} onResizeCommit={onResizeCommit}
            childMap={childMap} zBase={idx + 1} />
        ))}
      </div>
    </div>
  );
}
