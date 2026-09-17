"use client";

import React, { useState } from "react";
import { useTextures } from "@/lib/TextureContext";
import { ItemIdField } from "@/components/SchemaFields";
import TexturePickerModal from "@/components/TexturePickerModal";

/** "minecraft:dirt" -> "dirt" / "modid:my_block" -> "my_block" */
function bareId(id: string): string {
  return id.split(":").pop() ?? id;
}

/** Best-effort pack-texture key for an item/block id: an exact project entry's own texture if it
 * matches, else the usual vanilla "item|block/<name>.png" convention (right for most simple
 * entries, not guaranteed for oddly-shaped ones — good enough for a visual hint/picker). Same idea
 * as DimensionPropertyPanel's resolveLayerTextureKey, generalized to items too. */
export function resolveEntryTextureKey(id: string, modId: string, kind: "item" | "block", entries: { id: string; texture: string }[]): string {
  const projectEntry = entries.find((e) => id === `${modId}:${e.id}` || id === e.id);
  if (projectEntry) return projectEntry.texture;
  return `${kind}/${bareId(id)}.png`;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  modId: string;
  kind: "item" | "block";
  entries: { id: string; texture: string }[];
  placeholder?: string;
}

/** An item/block id field with a clickable texture swatch next to it — pick visually from the
 * extracted pack instead of typing an id. Same swatch+text combo as Dimension's floor-layer
 * picker, shared here so Recipe/Trade/Loot ingredient fields don't each reimplement it. Picking a
 * texture sets the value to whichever project entry owns that texture, or (for a plain vanilla
 * pack texture with no owning entry) guesses a vanilla id back from its "item|block/<name>.png"
 * path. The text field stays too — still there for a quick paste/edit, the swatch is just the
 * primary "browse visually" path. */
export default function VisualItemField({ value, onChange, options, modId, kind, entries, placeholder }: Props) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [pickerOpen, setPickerOpen] = useState(false);
  const texKey = resolveEntryTextureKey(value, modId, kind, entries);
  const texUrl = packTextures[texKey];

  const pick = (key: string) => {
    const owning = entries.find((e) => e.texture === key);
    onChange(owning ? `${modId}:${owning.id}` : `minecraft:${bareId(key)}`);
    setPickerOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title={`${value || "(none)"} — click to pick visually`}
        onClick={() => setPickerOpen(true)}
        className="h-6 w-6 shrink-0 overflow-hidden rounded border border-input bg-[#8b8b8b]"
        style={{ imageRendering: "pixelated" }}
      >
        {texUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={texUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", imageRendering: "pixelated" }} />
        ) : null}
      </button>
      <ItemIdField value={value} onChange={onChange} options={options} placeholder={placeholder} />
      <TexturePickerModal
        open={pickerOpen}
        packTextures={packTextures}
        current={texKey}
        onSelect={pick}
        onClose={() => setPickerOpen(false)}
        onUpload={uploadCustomTexture}
      />
    </div>
  );
}
