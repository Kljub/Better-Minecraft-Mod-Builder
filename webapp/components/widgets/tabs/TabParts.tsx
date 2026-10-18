"use client";

import type { WidgetSpec } from "@/lib/types";
import { useTextures } from "@/lib/TextureContext";

/** The 9-sliced border-image background of a single tab. */
export function TabBackground({ tex, tabW, tabH, borderImageCss }: {
  tex: string;
  tabW: number;
  tabH: number;
  borderImageCss: string;
}) {
  return (
    <div style={{
      position: "absolute", left: 0, top: 0,
      width: tabW, height: tabH,
      boxSizing: "border-box", overflow: "visible",
      pointerEvents: "none",
      borderImage: borderImageCss,
    }} />
  );
}

/** The centered label (icon or text) inside a tab. */
export function TabLabel({ tab, isActive, inactivePaddingTop, tabHeaderHeight, editing = false }: {
  tab: WidgetSpec;
  isActive: boolean;
  inactivePaddingTop: number;
  tabHeaderHeight: number;
  editing?: boolean;
}) {
  if (editing) return null;
  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      paddingTop: isActive ? 0 : inactivePaddingTop,
      whiteSpace: "nowrap",
      fontSize: 6,
      fontFamily: '"Minecraft", monospace',
      color: isActive ? "#404040" : "#909090",
      pointerEvents: "none",
    }}>
      {tab.icon
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={tab.icon} alt="" style={{ width: tabHeaderHeight * 0.6, height: tabHeaderHeight * 0.6, imageRendering: "pixelated", pointerEvents: "none" }} />
        : <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{tab.text || tab.id}</span>
      }
    </div>
  );
}

/**
 * A side tab's background: vanilla's own advancement side-tab sprite
 * (gui/sprites/advancements/tab_{left,right}_{top,middle,bottom}[_selected].png,
 * 32×28, open toward the content pane) 9-sliced to the tab's box — the same
 * sprite the runtime draws (SpecWidgetRenderer.renderSideTab). If the pack
 * textures don't include it, falls back to the top-tab sprite turned sideways:
 * mirrored across the diagonal for left tabs (exactly vanilla's left-tab
 * shading), rotated +90° for right tabs.
 */
export function SideTabBackground({ side, spot, active, length, thickness }: {
  side: "left" | "right";
  spot: "top" | "middle" | "bottom";
  active: boolean;
  length: number;
  thickness: number;
}) {
  const { packTextures, textures } = useTextures();
  const sideTex = packTextures[`gui/sprites/advancements/tab_${side}_${spot}${active ? "_selected" : ""}.png`];
  if (sideTex) {
    // 4px on the outer edge (inactive sprites' 4px transparent margin lives there), 3px on the pane side.
    const slices = side === "left" ? "4 3 3 4" : "4 4 3 3";
    const widths = side === "left" ? "4px 3px 3px 4px" : "4px 4px 3px 3px";
    return (
      <div style={{
        position: "absolute", left: 0, top: 0, width: thickness, height: length,
        boxSizing: "border-box", pointerEvents: "none",
        borderImage: `url("${sideTex}") ${slices} fill / ${widths} stretch`,
      }} />
    );
  }
  const variant = spot === "top" ? "left" : spot === "bottom" ? "right" : "middle";
  const topTex = (textures as Record<string, string>)[`tab_${active ? "selected" : "unselected"}_${variant}.png`];
  if (!topTex) return null;
  return (
    <div style={{
      position: "absolute", left: 0, top: 0,
      width: length, height: thickness,
      boxSizing: "border-box", overflow: "visible",
      pointerEvents: "none",
      borderImage: `url("${topTex}") 4 3 0 4 fill / 4px 3px 0px 4px stretch`,
      transformOrigin: "0 0",
      transform: side === "left" ? "matrix(0, 1, 1, 0, 0, 0)" : `translateX(${thickness}px) rotate(90deg)`,
    }} />
  );
}

/** A side tab's label — kept upright, centered on the part of the tab outside the content pane. */
export function SideTabLabel({ tab, isActive, side, stripWidth, overlap, tabLength, editing = false }: {
  tab: WidgetSpec;
  isActive: boolean;
  side: "left" | "right";
  stripWidth: number;
  overlap: number;
  tabLength: number;
  editing?: boolean;
}) {
  if (editing) return null;
  // Inactive tabs' sprite art sits 2px further from the outer edge — shift the label with it.
  const inset = isActive ? 0 : 2;
  return (
    <div style={{
      position: "absolute", top: 0, height: tabLength,
      left: side === "left" ? inset : overlap, width: stripWidth - inset,
      display: "flex", alignItems: "center", justifyContent: "center",
      whiteSpace: "nowrap", overflow: "hidden",
      fontSize: 6,
      fontFamily: '"Minecraft", monospace',
      color: isActive ? "#404040" : "#909090",
      pointerEvents: "none",
    }}>
      {tab.icon
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={tab.icon} alt="" style={{ width: stripWidth * 0.6, height: stripWidth * 0.6, imageRendering: "pixelated", pointerEvents: "none" }} />
        : <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{tab.text || tab.id}</span>
      }
    </div>
  );
}
