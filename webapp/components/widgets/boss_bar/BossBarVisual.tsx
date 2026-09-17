"use client";

import { FONT_SIZE } from "../shared";
import type { VisualProps } from "../shared";

const FALLBACK_COLORS: Record<string, string> = {
  pink: "#e05fe0", blue: "#4040ff", red: "#ff4040", green: "#40c040",
  yellow: "#e0e040", purple: "#a040e0", white: "#e0e0e0",
};

// rotation swaps widget.w/h on every R press (see EditorPage.rotateWidget), so the box's own
// w/h are always the rotated footprint — recover the pre-rotation ("native") size for the actual
// bar content by swapping back when rotated 90/270, then center+rotate it within that box. Mirrors
// SpecWidgetRenderer.renderBossBar so editor preview and real in-game rendering agree.
export default function BossBarVisual({ widget, tex }: VisualProps) {
  const value = parseFloat(widget.props.value ?? "0");
  const frac = Math.max(0, Math.min(1, value / 100));
  const color = widget.props.color ?? "pink";
  const rotation = parseInt(widget.props.rotation ?? "0", 10);
  const swapped = rotation === 90 || rotation === 270;
  const nativeW = swapped ? widget.h : widget.w;
  const nativeH = swapped ? widget.w : widget.h;

  const bgTex = tex(`mc_boss_bar_${color}_background.png`);
  const fgTex = tex(`mc_boss_bar_${color}_progress.png`);
  const fallback = FALLBACK_COLORS[color] ?? FALLBACK_COLORS.pink;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "visible" }}>
      <div style={{
        position: "absolute", left: "50%", top: "50%", width: nativeW, height: nativeH,
        transform: `translate(-50%, -50%)${rotation ? ` rotate(${rotation}deg)` : ""}`,
        overflow: "hidden",
      }}>
        {bgTex
          ? <img draggable={false} src={bgTex} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated" }} />
          : <div style={{ position: "absolute", inset: 0, background: "#141414", border: "1px solid #000" }} />}
        {frac > 0 && (
          fgTex
            ? <div style={{
                position: "absolute", inset: 0, width: `${frac * 100}%`, overflow: "hidden",
              }}>
                <img draggable={false} src={fgTex} alt="" style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${100 / frac}%`, imageRendering: "pixelated" }} />
              </div>
            : <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${frac * 100}%`, background: fallback }} />
        )}
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
