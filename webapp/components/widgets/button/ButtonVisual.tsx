"use client";

import { FONT_SIZE } from "../shared";
import type { VisualProps } from "../shared";

/** Handles both `button` and `toggle_button` — same rendering, toggle just tints text/state differently. */
export default function ButtonVisual({ widget, interactState = "idle", toggled = false, tex, packTextures }: VisualProps) {
  const borderPx = 2;
  const isToggle = widget.type === "toggle_button";

  // Toggle "on" acts like permanently pressed: dark texture + dim overlay
  const effectivelyPressed = interactState === "pressed" || (isToggle && toggled);
  const btnTex = (interactState === "idle" && !effectivelyPressed) ? "mc_button_normal.png" : "mc_button_hover.png";

  return (
    <div style={{
      width: "100%", height: "100%", position: "relative",
      filter: effectivelyPressed ? "brightness(0.75)" : undefined,
      transform: effectivelyPressed ? `translateY(1px)` : undefined,
      overflow: "hidden",
    }}>
      {tex(btnTex) && (
        <div style={{ position: "absolute", inset: 0, boxSizing: "border-box",
          borderImage: `url("${tex(btnTex)}") 2 fill / ${borderPx}px stretch` }} />
      )}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: FONT_SIZE, fontFamily: '"Minecraft", monospace',
        color: isToggle && toggled ? "#55ff55" : "#fff",
        textShadow: `1px 1px 0 #333`,
        userSelect: "none", gap: 1,
      }}>
        {widget.icon && packTextures[widget.icon] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img draggable={false} src={packTextures[widget.icon]} alt="" style={{ width: FONT_SIZE, height: FONT_SIZE, imageRendering: "pixelated" }} />
        )}
        {widget.text}
      </div>
    </div>
  );
}
