"use client";

import { FONT_SIZE } from "../shared";
import type { VisualProps } from "../shared";

// Fallback square color when the real vanilla sprite hasn't been extracted
// (see lib/textureTasks.ts HUD_SPRITES) — same 8px stride/9px cell layout
// as the real sprites so it lines up identically once they load.
const FALLBACK_COLORS: Record<string, string> = { red: "#dd0000", gold: "#ffd700", black: "#2b2b2b" };
const FALLBACK_EMPTY = "#4d4d4d";

export default function HeartBarVisual({ widget, tex }: VisualProps) {
  const max = parseFloat(widget.props.max ?? "20");
  const value = parseFloat(widget.props.value ?? String(max));
  const hp = Math.max(0, Math.min(max, Math.round(value)));
  const containers = Math.max(1, Math.ceil(max / 2));
  const color = widget.props.color ?? "red";
  const rotation = parseInt(widget.props.rotation ?? "0", 10);
  const nativeW = (containers - 1) * 8 + 9;

  const fullTex = color === "gold" ? tex("mc_heart_absorbing_full.png")
    : color === "black" ? tex("mc_heart_withered_full.png") : tex("mc_heart_full.png");
  const halfTex = color === "gold" ? tex("mc_heart_absorbing_half.png")
    : color === "black" ? tex("mc_heart_withered_half.png") : tex("mc_heart_half.png");
  const containerTex = tex("mc_heart_container.png");
  const fallbackColor = FALLBACK_COLORS[color] ?? FALLBACK_COLORS.red;

  const cells = [];
  for (let i = 0; i < containers; i++) {
    const full = i * 2 + 1 < hp;
    const half = i * 2 + 1 === hp;
    cells.push(
      <div key={i} style={{ position: "absolute", left: i * 8, top: 0, width: 9, height: 9 }}>
        {containerTex
          ? <img draggable={false} src={containerTex} alt="" style={{ position: "absolute", inset: 0, width: 9, height: 9, imageRendering: "pixelated" }} />
          : <div style={{ position: "absolute", inset: 0, background: FALLBACK_EMPTY, border: "1px solid #000" }} />}
        {(full || half) && (fullTex || halfTex ? (
          <img draggable={false} src={(full ? fullTex : halfTex) ?? fullTex ?? halfTex} alt="" style={{
            position: "absolute", inset: 0, width: half ? 5 : 9, height: 9, imageRendering: "pixelated",
          }} />
        ) : (
          <div style={{ position: "absolute", top: 0, left: 0, width: half ? "50%" : "100%", height: "100%", background: fallbackColor }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "visible" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%", width: nativeW, height: 9,
        transform: `translate(-50%, -50%)${rotation ? ` rotate(${rotation}deg)` : ""}`,
      }}>
        {cells}
      </div>
      {widget.text && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
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
