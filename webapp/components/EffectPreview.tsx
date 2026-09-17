"use client";

import React from "react";
import type { EffectSpec } from "@/lib/types";
import { useTextures } from "@/lib/TextureContext";

const CATEGORY_COLOR: Record<EffectSpec["category"], string> = {
  beneficial: "#5fd35f",
  neutral: "#c9c9c9",
  harmful: "#e06060",
};

/** Simple centerpiece for the currently selected Effect — its icon (if painted/chosen) on a
 * color-tinted swatch, plus category/name. No in-game particle rendering (out of scope). */
export default function EffectPreview({ effect }: { effect: EffectSpec | null }) {
  const { packTextures } = useTextures();

  if (!effect) {
    return <div className="text-sm text-muted-foreground italic">Select or add an effect.</div>;
  }

  const iconUrl = effect.icon ? packTextures[effect.icon] : undefined;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex items-center justify-center rounded-full border border-input shadow-inner"
        style={{ width: 64, height: 64, background: effect.color }}
      >
        {iconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconUrl}
            alt=""
            draggable={false}
            style={{ width: "70%", height: "70%", objectFit: "contain", imageRendering: "pixelated" }}
          />
        )}
      </div>
      <div className="text-sm font-medium">{effect.displayName || effect.id}</div>
      <div className="text-xs uppercase tracking-wide" style={{ color: CATEGORY_COLOR[effect.category] }}>
        {effect.category}
      </div>
    </div>
  );
}
