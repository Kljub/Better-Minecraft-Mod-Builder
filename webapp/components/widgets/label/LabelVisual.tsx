"use client";

import { FONT_SIZE } from "../shared";
import type { VisualProps } from "../shared";

// Matches the designer's color picker convention (PropertyPanel's argbIntToHex/hexToArgbInt):
// the stored "color" prop is a plain 0xRRGGBB int, no alpha byte — same masking the real in-game
// render applies (SpecWidgetRenderer.renderLabel forces the alpha byte to opaque rather than
// trusting the stored value, since an alpha of 0 would make the text invisible).
function colorIntToCss(value: number): string {
  return "#" + (Math.trunc(value) & 0xffffff).toString(16).padStart(6, "0");
}

export default function LabelVisual({ widget }: VisualProps) {
  const align = widget.props.align ?? "left";
  const valign = widget.props.valign ?? "middle";
  const colorInt = parseInt(widget.props.color ?? "", 10);
  const color = Number.isFinite(colorInt) ? colorIntToCss(colorInt) : "#404040";
  const shadow = widget.props.shadow === "true";

  return (
    <div style={{
      width: "100%", height: "100%", boxSizing: "border-box",
      display: "flex",
      justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
      alignItems: valign === "top" ? "flex-start" : valign === "bottom" ? "flex-end" : "center",
      fontSize: FONT_SIZE, fontFamily: '"Minecraft", monospace',
      color, textShadow: shadow ? "1px 1px 0 rgba(0,0,0,0.6)" : undefined,
      overflow: "hidden", userSelect: "none", padding: "0 2px",
    }}>
      {widget.text}
    </div>
  );
}
