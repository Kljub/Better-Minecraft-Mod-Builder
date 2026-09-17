"use client";

import React from "react";
import { useTextures } from "@/lib/TextureContext";
import type { ItemBlockDoc } from "@/components/ItemBlockPropertyPanel";
import SteveViewer3D from "@/components/SteveViewer3D";

interface Props {
  doc: ItemBlockDoc | null;
}

/** Simple, non-interactive centerpiece shown instead of the widget canvas while an Item or
 * Block document is active — just the chosen texture and name, no 3D block rendering (out of scope). */
export default function ItemBlockPreview({ doc }: Props) {
  const { packTextures } = useTextures();

  if (!doc) {
    return <div className="text-sm text-muted-foreground italic">Select or add an item/block.</div>;
  }

  const { spec, kind } = doc;
  const url = spec.texture ? packTextures[spec.texture] : undefined;
  const isArmor = kind === "item" && spec.category === "armor";

  return (
    <div className="flex flex-col items-center gap-3">
      {isArmor ? (
        <div className="flex flex-col items-center gap-1">
          <SteveViewer3D armorSlot={spec.armorSlot ?? "chestplate"} textureUrl={url} />
          <span className="text-[10px] text-muted-foreground">Drag to rotate — fixed model, not editable</span>
        </div>
      ) : (
        <div
          className="flex items-center justify-center rounded border border-input bg-[#8b8b8b] shadow-inner"
          style={{ width: 128, height: 128 }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              draggable={false}
              style={{ width: "80%", height: "80%", objectFit: "contain", imageRendering: "pixelated" }}
            />
          ) : (
            <span className="text-xs text-muted-foreground">No texture</span>
          )}
        </div>
      )}
      <div className="text-sm font-medium">{spec.displayName || spec.id}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{kind}</div>
    </div>
  );
}
