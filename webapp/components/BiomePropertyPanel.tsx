"use client";

import React from "react";
import type { BiomeSpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, NumInput, Toggle, PropSelect, HexColorField } from "@/components/SchemaFields";
import { BIOME_TEMPLATE_LABELS } from "@/lib/biomeTemplates";
import { SPAWN_DIMENSION_OPTIONS, SPAWN_DIMENSION_LABELS } from "@/lib/biomeRegistry";

interface Props {
  biome: BiomeSpec | null;
  onUpdate: (patch: Partial<BiomeSpec>) => void;
}

const TEMPLATE_OPTIONS = Object.keys(BIOME_TEMPLATE_LABELS);

/** Property form for the currently selected Biome — clones a full vanilla biome template (see
 * lib/biomeTemplates.ts) and only overrides these few fields at export time; everything else
 * (carvers/features/spawners) stays exactly as vanilla defines it for the chosen template. */
export default function BiomePropertyPanel({ biome, onUpdate }: Props) {
  if (!biome) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select a biome to edit its properties.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Biome</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={biome.id} disabled />
      </Field>
      <Field label="Base Template">
        <PropSelect
          value={biome.baseTemplate}
          options={TEMPLATE_OPTIONS}
          labels={BIOME_TEMPLATE_LABELS}
          onChange={(v) => onUpdate({ baseTemplate: v as BiomeSpec["baseTemplate"] })}
        />
      </Field>
      <p className="col-span-2 text-[10px] text-muted-foreground">
        Everything except the fields below (terrain features, mob spawns, ore generation...) is copied
        as-is from the base template.
      </p>

      <div className="col-span-2">
        <Field label="Spawns in dimension">
          <PropSelect
            value={biome.spawnDimension}
            options={SPAWN_DIMENSION_OPTIONS}
            labels={SPAWN_DIMENSION_LABELS}
            onChange={(v) => onUpdate({ spawnDimension: v as BiomeSpec["spawnDimension"] })}
          />
        </Field>
      </div>
      <p className="col-span-2 text-[10px] text-muted-foreground">
        Organizational only — this game version hardcodes where the real Overworld/Nether place
        biomes, so this can&apos;t inject the biome into vanilla&apos;s own generation. Pick this biome as
        the &quot;Biome&quot; on a matching custom Dimension to make it explorable.
      </p>

      <Field label="Temperature">
        <NumInput value={biome.temperature} onChange={(v) => onUpdate({ temperature: v })} />
      </Field>
      <Field label="Downfall">
        <NumInput value={biome.downfall} onChange={(v) => onUpdate({ downfall: v })} />
      </Field>
      <div className="col-span-2 flex items-center justify-between mt-1">
        <span className="text-muted-foreground">Has precipitation (rain/snow)</span>
        <Toggle checked={biome.hasPrecipitation} onChange={(v) => onUpdate({ hasPrecipitation: v })} />
      </div>

      <Field label="Sky Color">
        <HexColorField value={biome.skyColor} onChange={(v) => onUpdate({ skyColor: v })} />
      </Field>
      <Field label="Water Color">
        <HexColorField value={biome.waterColor} onChange={(v) => onUpdate({ waterColor: v })} />
      </Field>
    </div>
  );
}
