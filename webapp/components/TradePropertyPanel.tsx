"use client";

import React from "react";
import type { TradeSpec, ItemSpec, TradeItemStack } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, NumInput, PropSelect, Toggle } from "@/components/SchemaFields";
import VisualItemField from "@/components/VisualItemField";
import { VANILLA_ITEM_OPTIONS } from "@/lib/vanillaItems";
import {
  VILLAGER_PROFESSION_OPTIONS, VILLAGER_LEVEL_OPTIONS, WANDERING_TRADER_POOL_OPTIONS, WANDERING_TRADER_POOL_LABELS,
} from "@/lib/tradeRegistry";

interface Props {
  trade: TradeSpec | null;
  items: ItemSpec[];
  modId: string;
  onUpdate: (patch: Partial<TradeSpec>) => void;
}

function StackFields({
  label, stack, itemOptions, items, modId, onChange,
}: {
  label: string; stack: TradeItemStack; itemOptions: string[]; items: ItemSpec[]; modId: string; onChange: (s: TradeItemStack) => void;
}) {
  return (
    <div className="col-span-2 grid grid-cols-[1fr_3rem] gap-1 items-end">
      <Field label={label}>
        <VisualItemField value={stack.item} onChange={(v) => onChange({ ...stack, item: v })} options={itemOptions} modId={modId} kind="item" entries={items} />
      </Field>
      <Field label="Count">
        <NumInput value={stack.count} onChange={(v) => onChange({ ...stack, count: Math.max(1, Math.round(v)) })} />
      </Field>
    </div>
  );
}

/** Property form for the currently selected Trade (villager or wandering-trader) — pure datapack
 * JSON, no Java needed. Joins the existing vanilla trade pool for the chosen profession/level (or
 * wandering-trader pool) via a tag merge at export time, so vanilla's own trades stay intact. */
export default function TradePropertyPanel({ trade, items, modId, onUpdate }: Props) {
  if (!trade) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select a trade to edit its properties.
      </div>
    );
  }

  const itemOptions = [...VANILLA_ITEM_OPTIONS, ...items.map((i) => `${modId}:${i.id}`)];

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Trade</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={trade.id} disabled />
      </Field>
      <Field label="Category">
        <PropSelect
          value={trade.category}
          options={["villager", "wandering_trader"]}
          labels={{ villager: "Villager profession", wandering_trader: "Wandering Trader" }}
          onChange={(v) => onUpdate({ category: v as TradeSpec["category"] })}
        />
      </Field>

      {trade.category === "villager" ? (
        <>
          <Field label="Profession">
            <PropSelect
              value={trade.profession ?? "farmer"}
              options={VILLAGER_PROFESSION_OPTIONS}
              onChange={(v) => onUpdate({ profession: v as TradeSpec["profession"] })}
            />
          </Field>
          <Field label="Level">
            <PropSelect
              value={String(trade.level ?? 1)}
              options={VILLAGER_LEVEL_OPTIONS.map(String)}
              onChange={(v) => onUpdate({ level: parseInt(v, 10) })}
            />
          </Field>
        </>
      ) : (
        <Field label="Pool">
          <PropSelect
            value={trade.wanderingPool ?? "common"}
            options={WANDERING_TRADER_POOL_OPTIONS}
            labels={WANDERING_TRADER_POOL_LABELS}
            onChange={(v) => onUpdate({ wanderingPool: v as TradeSpec["wanderingPool"] })}
          />
        </Field>
      )}

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Costs the player</div>
      <StackFields label="Wants" stack={trade.wants} itemOptions={itemOptions} items={items} modId={modId} onChange={(s) => onUpdate({ wants: s })} />

      <div className="col-span-2 flex items-center justify-between mt-1">
        <span className="text-muted-foreground">Second cost item</span>
        <Toggle
          checked={!!trade.additionalWants}
          onChange={(v) => onUpdate({ additionalWants: v ? { item: "minecraft:emerald", count: 1 } : undefined })}
        />
      </div>
      {trade.additionalWants && (
        <StackFields
          label="Additional wants"
          stack={trade.additionalWants}
          itemOptions={itemOptions}
          items={items}
          modId={modId}
          onChange={(s) => onUpdate({ additionalWants: s })}
        />
      )}

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Gives the player</div>
      <StackFields label="Gives" stack={trade.gives} itemOptions={itemOptions} items={items} modId={modId} onChange={(s) => onUpdate({ gives: s })} />

      <Field label="Max uses">
        <NumInput value={trade.maxUses} onChange={(v) => onUpdate({ maxUses: Math.max(1, Math.round(v)) })} />
      </Field>
      <Field label="XP given">
        <NumInput value={trade.xp} onChange={(v) => onUpdate({ xp: Math.max(0, Math.round(v)) })} />
      </Field>
    </div>
  );
}
