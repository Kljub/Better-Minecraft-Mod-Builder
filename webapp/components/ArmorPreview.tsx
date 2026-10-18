"use client";

import React from "react";
import type { ArmorSpec } from "@/lib/types";
import { useTextures } from "@/lib/TextureContext";
import PlayerSkinViewer3D from "@/components/PlayerSkinViewer3D";

/** Centerpiece for the currently selected Armor Set — the full set worn on a 3D player with the
 * real vanilla armor UV layout (layer 1 for helmet/chestplate/boots, layer 2 for leggings). */
export default function ArmorPreview({ armor }: { armor: ArmorSpec | null }) {
  const { packTextures } = useTextures();

  if (!armor) {
    return <div className="text-sm text-muted-foreground italic">Select or add an armor set.</div>;
  }

  const layer1 = packTextures[armor.equipmentTexture];
  const layer2 = (armor.equipmentLeggingsTexture && packTextures[armor.equipmentLeggingsTexture]) || layer1;

  return (
    <div className="flex flex-col items-center gap-1">
      <PlayerSkinViewer3D armor={{ layer1, layer2 }} className="h-[320px] w-[240px]" />
      <span className="text-sm font-medium">{armor.displayName || armor.id}</span>
      <span className="text-[10px] text-muted-foreground">Drag to rotate — fixed model, not editable</span>
    </div>
  );
}
