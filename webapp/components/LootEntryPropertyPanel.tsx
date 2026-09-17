"use client";

import React from "react";
import type { LootEntrySpec, ItemSpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, NumInput, PropSelect } from "@/components/SchemaFields";
import VisualItemField from "@/components/VisualItemField";
import { VANILLA_ITEM_OPTIONS } from "@/lib/vanillaItems";
import { LOOT_TARGET_OPTIONS, LOOT_TARGET_LABELS } from "@/lib/lootRegistry";

interface Props {
  entry: LootEntrySpec | null;
  items: ItemSpec[];
  modId: string;
  onUpdate: (patch: Partial<LootEntrySpec>) => void;
}

/** Property form for the currently selected Loot Entry — extra loot injected into an existing
 * vanilla chest loot table (structure/village/dungeon — which is also what correlates loot to a
 * biome, since e.g. desert_pyramid only spawns in desert biomes) without touching its existing
 * drops. Pure datapack JSON (a neoforge:add_table global loot modifier), no Java needed. */
export default function LootEntryPropertyPanel({ entry, items, modId, onUpdate }: Props) {
  if (!entry) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select a loot entry to edit its properties.
      </div>
    );
  }

  const itemOptions = [...VANILLA_ITEM_OPTIONS, ...items.map((i) => `${modId}:${i.id}`)];

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Loot Entry</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={entry.id} disabled />
      </Field>
      <Field label="Target chest/loot table">
        <PropSelect
          value={entry.targetLootTable}
          options={LOOT_TARGET_OPTIONS}
          labels={LOOT_TARGET_LABELS}
          onChange={(v) => onUpdate({ targetLootTable: v as LootEntrySpec["targetLootTable"] })}
        />
      </Field>
      <div className="col-span-2">
        <Field label="Item">
          <VisualItemField value={entry.item} onChange={(v) => onUpdate({ item: v })} options={itemOptions} modId={modId} kind="item" entries={items} />
        </Field>
      </div>
      <div className="col-span-2 grid grid-cols-3 gap-1">
        <Field label="Weight">
          <NumInput value={entry.weight} onChange={(v) => onUpdate({ weight: Math.max(1, Math.round(v)) })} />
        </Field>
        <Field label="Min count">
          <NumInput value={entry.minCount} onChange={(v) => onUpdate({ minCount: Math.max(1, Math.round(v)) })} />
        </Field>
        <Field label="Max count">
          <NumInput value={entry.maxCount} onChange={(v) => onUpdate({ maxCount: Math.max(1, Math.round(v)) })} />
        </Field>
      </div>
      <p className="col-span-2 text-[10px] text-muted-foreground mt-1">
        Weight is relative to other loot entries added to the same table by this project — higher means more common.
      </p>
    </div>
  );
}
