"use client";

import { FONT_SIZE } from "../shared";
import type { VisualProps } from "../shared";

// Angle convention shared with the real in-game render (SpecWidgetRenderer.renderSkillCheck):
// 0deg points straight up, increasing clockwise — matches a clock face.
function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

function normalizeAngle(a: number): number {
  return ((a % 360) + 360) % 360;
}

function angleInRange(angle: number, start: number, end: number): boolean {
  const a = normalizeAngle(angle);
  const s = normalizeAngle(start);
  const e = normalizeAngle(end);
  return s <= e ? a >= s && a <= e : a >= s || a <= e;
}

// Static editor preview — needle frozen at the top (its start-of-sweep position). The real
// widget continuously sweeps the needle 0-360deg over `duration_ticks`; pressing the configured
// `key` checks where the needle is: the white zone grants a small bonus, the gray zone counts as
// a plain pass, and everywhere else (the dim rest of the ring) is a failure — see
// SpecWidgetRenderer.renderSkillCheck / handleSkillCheckKey.
export default function SkillCheckVisual({ widget }: VisualProps) {
  const size = Math.min(widget.w, widget.h);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 3;
  const bonusStart = parseFloat(widget.props.bonus_start ?? "300");
  const bonusEnd = parseFloat(widget.props.bonus_end ?? "330");
  const normalStart = parseFloat(widget.props.normal_start ?? "240");
  const normalEnd = parseFloat(widget.props.normal_end ?? "300");

  const ringPoints = [];
  for (let deg = 0; deg < 360; deg += 4) {
    const inBonus = angleInRange(deg, bonusStart, bonusEnd);
    const inNormal = !inBonus && angleInRange(deg, normalStart, normalEnd);
    const [px, py] = polar(cx, cy, r, deg);
    const fill = inBonus ? "#ffffff" : inNormal ? "#aaaaaa" : "rgba(150,150,150,0.35)";
    ringPoints.push(
      <circle key={deg} cx={px} cy={py} r={inBonus || inNormal ? 1.6 : 0.9} fill={fill} />
    );
  }

  const [needleX, needleY] = polar(cx, cy, r, 0);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", height: "100%", overflow: "visible" }}>
        {ringPoints}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#ff3b30" strokeWidth={1.5} />
      </svg>
      {widget.text && (
        <div style={{
          position: "absolute", inset: 0,
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
