"use client";

import React from "react";
import type { CustomAttributeSpec } from "@/lib/types";

const SENTIMENT_COLOR: Record<CustomAttributeSpec["sentiment"], string> = {
  positive: "#5fd35f",
  neutral: "#c9c9c9",
  negative: "#e06060",
};

/** Simple, non-visual centerpiece for the currently selected custom Attribute — no texture/icon
 * concept here, just its current values, colored by sentiment (matches the in-game tooltip color). */
export default function CustomAttributePreview({ attribute }: { attribute: CustomAttributeSpec | null }) {
  if (!attribute) {
    return <div className="text-sm text-muted-foreground italic">Select or add a custom attribute.</div>;
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded border border-input bg-background p-6" style={{ minWidth: 220 }}>
      <div className="text-base font-semibold" style={{ color: SENTIMENT_COLOR[attribute.sentiment] }}>
        {attribute.displayName || attribute.id}
      </div>
      <div className="text-xs text-muted-foreground">{attribute.id}</div>
      <div className="mt-2 grid grid-cols-3 gap-4 text-center text-xs">
        <div>
          <div className="text-muted-foreground">Base</div>
          <div className="font-medium text-foreground">{attribute.defaultBase}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Min</div>
          <div className="font-medium text-foreground">{attribute.min}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Max</div>
          <div className="font-medium text-foreground">{attribute.max}</div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        {attribute.addToAllLiving && "All living things"}
        {attribute.addToAllLiving && attribute.addToPlayers && " · "}
        {attribute.addToPlayers && "Players"}
        {!attribute.addToAllLiving && !attribute.addToPlayers && "Not attached to any entity by default"}
      </div>
    </div>
  );
}
