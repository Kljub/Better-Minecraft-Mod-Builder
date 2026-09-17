"use client";

import React from "react";
import type { PotionSpec } from "@/lib/types";

/** Simple centerpiece for the currently selected Potion — a bottle-ish swatch plus its name and
 * effect list, no in-game bottle rendering (out of scope). */
export default function PotionPreview({ potion }: { potion: PotionSpec | null }) {
  if (!potion) {
    return <div className="text-sm text-muted-foreground italic">Select or add a potion.</div>;
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded border border-input bg-background p-6" style={{ minWidth: 220 }}>
      <div className="text-base font-semibold">{potion.displayName || potion.id}</div>
      <div className="text-xs text-muted-foreground">{potion.id}</div>
      <div className="mt-2 flex flex-col items-start gap-1 text-xs">
        {potion.effects.length === 0 ? (
          <span className="text-muted-foreground italic">No effects yet</span>
        ) : (
          potion.effects.map((e, i) => (
            <div key={i} className="text-foreground">
              {e.effectId} <span className="text-muted-foreground">· {e.durationSeconds}s · amp {e.amplifier}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
