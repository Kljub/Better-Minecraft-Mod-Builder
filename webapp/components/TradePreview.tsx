"use client";

import React from "react";
import type { TradeSpec } from "@/lib/types";

function shortLabel(id: string): string {
  return (id.split(":").pop() ?? id).slice(0, 5);
}

function Stack({ item, count }: { item: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="flex items-center justify-center rounded border border-input bg-[#8b8b8b] text-[8px] text-white/90"
        style={{ width: 32, height: 32 }}
        title={item}
      >
        {shortLabel(item)}
      </div>
      <span className="text-[9px] text-muted-foreground">×{count}</span>
    </div>
  );
}

/** Simple centerpiece for the currently selected Trade — wants (+ optional second cost) → gives. */
export default function TradePreview({ trade }: { trade: TradeSpec | null }) {
  if (!trade) {
    return <div className="text-sm text-muted-foreground italic">Select or add a trade.</div>;
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex items-center gap-2">
        <Stack item={trade.wants.item} count={trade.wants.count} />
        {trade.additionalWants && (
          <>
            <span className="text-muted-foreground">+</span>
            <Stack item={trade.additionalWants.item} count={trade.additionalWants.count} />
          </>
        )}
        <span className="text-lg text-muted-foreground">→</span>
        <Stack item={trade.gives.item} count={trade.gives.count} />
      </div>
      <div className="text-sm font-medium">
        {trade.category === "villager" ? `${trade.profession} · level ${trade.level}` : `Wandering Trader · ${trade.wanderingPool}`}
      </div>
      <div className="text-[10px] text-muted-foreground">{trade.maxUses} uses · {trade.xp} XP</div>
    </div>
  );
}
