"use client";

import React from "react";
import type { BiomeSpec } from "@/lib/types";
import { BIOME_TEMPLATE_LABELS } from "@/lib/biomeTemplates";
import { SPAWN_DIMENSION_LABELS } from "@/lib/biomeRegistry";

/** Simple centerpiece for the currently selected Biome — a sky/water color swatch, no real
 * terrain rendering (out of scope). */
export default function BiomePreview({ biome }: { biome: BiomeSpec | null }) {
  if (!biome) {
    return <div className="text-sm text-muted-foreground italic">Select or add a biome.</div>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex flex-col overflow-hidden rounded border border-input shadow-inner"
        style={{ width: 96, height: 64 }}
      >
        <div style={{ flex: 2, background: biome.skyColor }} />
        <div style={{ flex: 1, background: biome.waterColor }} />
      </div>
      <div className="text-sm font-medium">{biome.id}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {BIOME_TEMPLATE_LABELS[biome.baseTemplate]}
      </div>
      <div className="text-[10px] text-muted-foreground">
        temp {biome.temperature} · downfall {biome.downfall}
      </div>
      <div className="text-[10px] text-muted-foreground">
        spawns in: {SPAWN_DIMENSION_LABELS[biome.spawnDimension]}
      </div>
    </div>
  );
}
