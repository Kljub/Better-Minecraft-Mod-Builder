"use client";

import { FONT_SIZE } from "../shared";
import type { VisualProps } from "../shared";

const FALLBACK_FULL = "#c0c0c0";
const FALLBACK_HALF = "#808080";
const FALLBACK_EMPTY = "#3a3a3a";

export default function ArmorBarVisual({ widget, tex }: VisualProps) {
  const value = parseFloat(widget.props.value ?? "0");
  const armor = Math.max(0, Math.round(value));

  const fullTex = tex("mc_armor_full.png");
  const halfTex = tex("mc_armor_half.png");
  const emptyTex = tex("mc_armor_empty.png");

  const cells = [];
  for (let i = 0; i < 10; i++) {
    const full = i * 2 + 1 < armor;
    const half = i * 2 + 1 === armor;
    const iconTex = full ? fullTex : half ? halfTex : emptyTex;
    const fallback = full ? FALLBACK_FULL : half ? FALLBACK_HALF : FALLBACK_EMPTY;
    cells.push(
      <div key={i} style={{ position: "absolute", left: i * 8, top: 0, width: 9, height: 9 }}>
        {iconTex
          ? <img draggable={false} src={iconTex} alt="" style={{ position: "absolute", inset: 0, width: 9, height: 9, imageRendering: "pixelated" }} />
          : <div style={{ position: "absolute", inset: 0, background: fallback, border: "1px solid #000" }} />}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "visible" }}>
      {cells}
      {widget.text && (
        <div style={{
          position: "absolute", left: 0, top: 0, width: 81, height: 9, zIndex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: FONT_SIZE, fontFamily: '"Minecraft", monospace',
          color: "#fff", textShadow: "1px 1px 0 #333", userSelect: "none",
        }}>
          {widget.text}
        </div>
      )}
    </div>
  );
}
