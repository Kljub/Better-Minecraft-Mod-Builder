"use client";

import type { VisualProps } from "../shared";

// Falls back to a flat vanilla-green fill when the real sprites haven't been
// extracted (see lib/textureTasks.ts HUD_SPRITES) — same partial-width-fill
// technique as the real one (SpecWidgetRenderer.renderXpBar) once they load.
const FALLBACK_TRACK = "#141414";
const FALLBACK_FILL = "#80ff00";

export default function XpBarVisual({ widget, tex }: VisualProps) {
  const value = parseFloat(widget.props.value ?? "35");
  const frac = Math.max(0, Math.min(1, value / 100));

  const bgTex = tex("mc_xp_bar_background.png");
  const fgTex = tex("mc_xp_bar_progress.png");

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {bgTex
        ? <img draggable={false} src={bgTex} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", imageRendering: "pixelated" }} />
        : <div style={{ position: "absolute", inset: 0, background: FALLBACK_TRACK, border: "1px solid #000" }} />}
      {frac > 0 && (
        fgTex
          ? <div style={{ position: "absolute", inset: 0, width: `${frac * 100}%`, overflow: "hidden" }}>
              <img draggable={false} src={fgTex} alt="" style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${100 / frac}%`, imageRendering: "pixelated" }} />
            </div>
          : <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${frac * 100}%`, background: FALLBACK_FILL }} />
      )}
    </div>
  );
}
