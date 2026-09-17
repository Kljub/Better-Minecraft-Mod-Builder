"use client";

import React from "react";
import type { PotionSpec, PotionEffectEntry, EffectSpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, NumInput, PropSelect } from "@/components/SchemaFields";
import { VANILLA_EFFECT_OPTIONS } from "@/lib/effectRegistry";

interface Props {
  potion: PotionSpec | null;
  effects: EffectSpec[];
  onUpdate: (patch: Partial<PotionSpec>) => void;
}

/** Property form for the currently selected Potion — a named bundle of effect instances
 * (effect + duration + amplifier). Registers the Potion definition itself; wiring an actual
 * brewing-stand recipe is out of scope for now (part of the later Crafting Recipes phase). */
export default function PotionPropertyPanel({ potion, effects, onUpdate }: Props) {
  if (!potion) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select a potion to edit its properties.
      </div>
    );
  }

  const effectOptions = [...VANILLA_EFFECT_OPTIONS, ...effects.map((e) => e.id)];
  const effectLabels = Object.fromEntries(effects.map((e) => [e.id, e.displayName]));
  const entries = potion.effects;
  const setEntries = (next: PotionEffectEntry[]) => onUpdate({ effects: next });

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Potion</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={potion.id} disabled />
      </Field>

      <Field label="Display Name">
        <Input
          className="h-6 text-xs px-1.5"
          value={potion.displayName}
          onChange={(e) => onUpdate({ displayName: e.target.value })}
        />
      </Field>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Effects</div>
      {entries.length === 0 && (
        <div className="col-span-2 text-[10px] text-muted-foreground italic">No effects yet.</div>
      )}
      {entries.map((entry, i) => (
        <div key={i} className="col-span-2 flex flex-col gap-1 rounded border border-input p-1.5">
          <div className="flex items-center gap-1">
            <PropSelect
              value={entry.effectId}
              options={effectOptions}
              labels={effectLabels}
              onChange={(v) => setEntries(entries.map((e, j) => j === i ? { ...e, effectId: v } : e))}
            />
            <button
              title="Remove"
              onClick={() => setEntries(entries.filter((_, j) => j !== i))}
              className="shrink-0 text-muted-foreground hover:text-destructive px-1"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Field label="Duration (s)">
              <NumInput value={entry.durationSeconds} onChange={(v) => setEntries(entries.map((e, j) => j === i ? { ...e, durationSeconds: v } : e))} />
            </Field>
            <Field label="Amplifier">
              <NumInput value={entry.amplifier} onChange={(v) => setEntries(entries.map((e, j) => j === i ? { ...e, amplifier: Math.round(v) } : e))} />
            </Field>
          </div>
        </div>
      ))}
      <button
        className="col-span-2 w-full rounded border border-dashed border-input py-0.5 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        onClick={() => setEntries([...entries, { effectId: effectOptions[0] ?? "minecraft:speed", durationSeconds: 30, amplifier: 0 }])}
      >
        + Add effect
      </button>
    </div>
  );
}
