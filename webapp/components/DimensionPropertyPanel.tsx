"use client";

import React, { useState } from "react";
import type { DimensionSpec, FlatLayerSpec, BiomeSpec, BlockSpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, NumInput, Toggle, PropSelect, ItemIdField } from "@/components/SchemaFields";
import { VANILLA_BLOCK_OPTIONS } from "@/lib/vanillaItems";
import { VANILLA_BIOME_OPTIONS } from "@/lib/biomeRegistry";
import { DIMENSION_TYPE_TEMPLATE_LABELS } from "@/lib/dimensionTemplates";
import { CAN_SET_SPAWN_OPTIONS, CAN_SLEEP_OPTIONS } from "@/lib/dimensionRegistry";
import { useTextures } from "@/lib/TextureContext";
import TexturePickerModal from "@/components/TexturePickerModal";

interface Props {
  dimension: DimensionSpec | null;
  biomes: BiomeSpec[];
  blocks: BlockSpec[];
  modId: string;
  onUpdate: (patch: Partial<DimensionSpec>) => void;
}

const BASE_TYPE_OPTIONS = Object.keys(DIMENSION_TYPE_TEMPLATE_LABELS);

/** Label + Toggle on one compact row — for pairing toggles up side by side in a grid instead of
 * each eating a full-width row. */
function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

/** "minecraft:dirt" -> "dirt" / "modid:my_block" -> "my_block" */
function bareId(id: string): string {
  return id.split(":").pop() ?? id;
}

/** Best-effort pack-texture key for a layer's block id: an exact project block's own texture if
 * it matches, else the usual vanilla "block/<name>.png" convention (right for most simple blocks,
 * not guaranteed for multi-face ones like grass_block — good enough for a visual hint). */
function resolveLayerTextureKey(blockId: string, modId: string, blocks: BlockSpec[]): string {
  const projectBlock = blocks.find((b) => blockId === `${modId}:${b.id}` || blockId === b.id);
  if (projectBlock) return projectBlock.texture;
  return `block/${bareId(blockId)}.png`;
}

/** Property form for the currently selected Dimension — pairs a cloned vanilla dimension_type
 * (physics/sky/light) with a `minecraft:flat` chunk generator (fixed layer stack + one biome).
 * No noise/biome-source worldgen exposed — that system is far more complex and easy to misconfigure
 * into an unloadable world; a flat generator is always valid. */
export default function DimensionPropertyPanel({ dimension, biomes, blocks, modId, onUpdate }: Props) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [texPickerForLayer, setTexPickerForLayer] = useState<number | null>(null);

  if (!dimension) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select a dimension to edit its properties.
      </div>
    );
  }

  const biomeOptions = [...VANILLA_BIOME_OPTIONS, ...biomes.map((b) => `${modId}:${b.id}`)];
  const blockOptions = [...VANILLA_BLOCK_OPTIONS, ...blocks.map((b) => `${modId}:${b.id}`)];
  const layers = dimension.layers;
  const setLayers = (next: FlatLayerSpec[]) => onUpdate({ layers: next });

  // Picking a texture visually sets the layer's block to whichever project block owns that
  // texture, or (for a plain pack texture with no owning block, e.g. a vanilla block/dirt.png)
  // guesses a vanilla block id back from its "block/<name>.png" path.
  const pickTextureForLayer = (idx: number, key: string) => {
    const owningBlock = blocks.find((b) => b.texture === key);
    const block = owningBlock ? `${modId}:${owningBlock.id}` : `minecraft:${bareId(key)}`;
    setLayers(layers.map((l, j) => j === idx ? { ...l, block } : l));
    setTexPickerForLayer(null);
  };

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Dimension</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={dimension.id} disabled />
      </Field>
      <Field label="Base Type">
        <PropSelect
          value={dimension.baseType}
          options={BASE_TYPE_OPTIONS}
          labels={DIMENSION_TYPE_TEMPLATE_LABELS}
          onChange={(v) => onUpdate({ baseType: v as DimensionSpec["baseType"] })}
        />
      </Field>

      <ToggleField label="Has skylight" checked={dimension.hasSkylight} onChange={(v) => onUpdate({ hasSkylight: v })} />
      <ToggleField label="Has ceiling (like the Nether)" checked={dimension.hasCeiling} onChange={(v) => onUpdate({ hasCeiling: v })} />

      <div className="col-span-2 grid grid-cols-3 gap-2 mt-1 items-end">
        <Field label="Ambient Light (0-1)">
          <NumInput value={dimension.ambientLight} onChange={(v) => onUpdate({ ambientLight: v })} />
        </Field>
        <Field label="Coordinate Scale">
          <NumInput value={dimension.coordinateScale} onChange={(v) => onUpdate({ coordinateScale: Math.max(0.00001, v) })} />
        </Field>
        <ToggleField label="Fixed time" checked={dimension.hasFixedTime} onChange={(v) => onUpdate({ hasFixedTime: v })} />
      </div>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Player Rules</div>
      <Field label="Can set spawn (sleep)">
        <PropSelect value={dimension.canSetSpawn} options={CAN_SET_SPAWN_OPTIONS} onChange={(v) => onUpdate({ canSetSpawn: v as DimensionSpec["canSetSpawn"] })} />
      </Field>
      <Field label="Can sleep">
        <PropSelect value={dimension.canSleep} options={CAN_SLEEP_OPTIONS} onChange={(v) => onUpdate({ canSleep: v as DimensionSpec["canSleep"] })} />
      </Field>
      <ToggleField label="Beds explode instead of working" checked={dimension.bedsExplode} onChange={(v) => onUpdate({ bedsExplode: v })} />
      <ToggleField label="Respawn anchors work here" checked={dimension.respawnAnchorWorks} onChange={(v) => onUpdate({ respawnAnchorWorks: v })} />
      <ToggleField label="Monsters can spawn" checked={dimension.monstersCanSpawn} onChange={(v) => onUpdate({ monstersCanSpawn: v })} />
      <ToggleField label="Mobs can spawn" checked={dimension.mobsCanSpawn} onChange={(v) => onUpdate({ mobsCanSpawn: v })} />
      <p className="col-span-2 text-[10px] text-muted-foreground">
        &quot;Monsters&quot; = hostile (zombies, skeletons, ...) — this pins the dimension&apos;s own spawn-light
        thresholds to darkness-only when off. &quot;Mobs&quot; = passive/neutral (cows, villagers, ...) — this
        only takes effect when Biome below is one of this project&apos;s own Biomes (patches its spawn
        density for this dimension specifically); it&apos;s a no-op for a vanilla biome id, since that
        biome&apos;s file isn&apos;t ours to rewrite. Anchors explode automatically when used somewhere
        that&apos;s off — same as vanilla&apos;s own Overworld/End behavior, no separate toggle needed.
        &quot;Keep inventory&quot; isn&apos;t a per-dimension setting in Minecraft (it&apos;s a world-wide gamerule) so
        it can&apos;t be set here.
      </p>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">World (flat generator)</div>
      <div className="col-span-2">
        <Field label="Biome">
          <ItemIdField value={dimension.biome} onChange={(v) => onUpdate({ biome: v })} options={biomeOptions} placeholder="minecraft:plains" />
        </Field>
      </div>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Floor Layers (top to bottom)</div>
      <button
        className="col-span-2 w-full rounded border border-dashed border-input py-0.5 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        onClick={() => setLayers([...layers, { block: "minecraft:stone", height: 1 }])}
      >
        + Add layer
      </button>
      {layers.length === 0 && <div className="col-span-2 text-[10px] text-muted-foreground italic">No layers yet — the world will be empty air.</div>}
      {[...layers].map((layer, displayIdx) => {
        const i = layers.length - 1 - displayIdx; // top layer shown first
        const texKey = resolveLayerTextureKey(layer.block, modId, blocks);
        const texUrl = packTextures[texKey];
        return (
          <div key={i} className="col-span-2 grid grid-cols-[1.25rem_1fr_3rem_auto] gap-1 items-center">
            <button
              type="button"
              title={`${layer.block} — click to pick visually`}
              onClick={() => setTexPickerForLayer(i)}
              className="h-5 w-5 shrink-0 overflow-hidden rounded border border-input bg-[#8b8b8b]"
              style={{ imageRendering: "pixelated" }}
            >
              {texUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={texUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", imageRendering: "pixelated" }} />
              ) : null}
            </button>
            <ItemIdField value={layer.block} onChange={(v) => setLayers(layers.map((l, j) => j === i ? { ...l, block: v } : l))} options={blockOptions} />
            <NumInput value={layer.height} onChange={(v) => setLayers(layers.map((l, j) => j === i ? { ...l, height: Math.max(1, Math.round(v)) } : l))} />
            <button
              title="Remove layer"
              onClick={() => setLayers(layers.filter((_, j) => j !== i))}
              className="shrink-0 text-muted-foreground hover:text-destructive px-1"
            >
              ✕
            </button>
          </div>
        );
      })}
      <TexturePickerModal
        open={texPickerForLayer !== null}
        packTextures={packTextures}
        current={texPickerForLayer !== null ? resolveLayerTextureKey(layers[texPickerForLayer].block, modId, blocks) : ""}
        onSelect={(key) => { if (texPickerForLayer !== null) pickTextureForLayer(texPickerForLayer, key); }}
        onClose={() => setTexPickerForLayer(null)}
        onUpload={uploadCustomTexture}
      />

      <ToggleField label="Generate decorations (trees, grass, ...)" checked={dimension.generateDecorations} onChange={(v) => onUpdate({ generateDecorations: v })} />
      <ToggleField label="Generate lakes" checked={dimension.generateLakes} onChange={(v) => onUpdate({ generateLakes: v })} />
      <ToggleField label="Generate structures (villages, strongholds)" checked={dimension.generateStructures} onChange={(v) => onUpdate({ generateStructures: v })} />
    </div>
  );
}
