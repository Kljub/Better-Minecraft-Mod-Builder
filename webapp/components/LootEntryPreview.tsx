"use client";

import React from "react";
import type { LootEntrySpec } from "@/lib/types";
import { LOOT_TARGET_LABELS } from "@/lib/lootRegistry";

/** Simple centerpiece for the currently selected Loot Entry. */
export default function LootEntryPreview({ entry }: { entry: LootEntrySpec | null }) {
  if (!entry) {
    return <div className="text-sm text-muted-foreground italic">Select or add a loot entry.</div>;
  }

  const countLabel = entry.minCount === entry.maxCount ? `×${entry.minCount}` : `×${entry.minCount}-${entry.maxCount}`;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div
        className="flex items-center justify-center rounded border border-input bg-[#8b8b8b] text-[9px] text-white/90"
        style={{ width: 48, height: 48 }}
        title={entry.item}
      >
        {(entry.item.split(":").pop() ?? entry.item).slice(0, 6)}
      </div>
      <div className="text-sm font-medium">{entry.item.split(":").pop()} {countLabel}</div>
      <div className="text-[10px] text-muted-foreground">weight {entry.weight}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{LOOT_TARGET_LABELS[entry.targetLootTable]}</div>
    </div>
  );
}
