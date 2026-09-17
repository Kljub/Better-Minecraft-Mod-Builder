"use client";

import React from "react";
import type { ArmorSpec } from "@/lib/types";
import { useTextures } from "@/lib/TextureContext";
import SteveViewer3D from "@/components/SteveViewer3D";

/** Simple centerpiece for the currently selected Armor Set — the full set worn simultaneously on
 * the fixed-topology 3D Steve viewer (all 4 pieces share the one body texture). */
export default function ArmorPreview({ armor }: { armor: ArmorSpec | null }) {
  const { packTextures } = useTextures();

  if (!armor) {
    return <div className="text-sm text-muted-foreground italic">Select or add an armor set.</div>;
  }

  const url = packTextures[armor.equipmentTexture];

  return (
    <div className="flex flex-col items-center gap-1">
      <SteveViewer3D textures={{ helmet: url, chestplate: url, leggings: url, boots: url }} />
      <span className="text-sm font-medium">{armor.displayName || armor.id}</span>
      <span className="text-[10px] text-muted-foreground">Drag to rotate — fixed model, not editable</span>
    </div>
  );
}
