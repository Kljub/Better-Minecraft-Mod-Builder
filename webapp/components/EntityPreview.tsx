"use client";

import React from "react";
import { useTextures } from "@/lib/TextureContext";
import type { EntitySpec } from "@/lib/types";
import { BODY_TEMPLATE_LABELS } from "@/lib/entityRegistry";

interface Props {
  entity: EntitySpec | null;
}

/** Flat texture-swatch preview, same idiom as ItemBlockPreview's fallback path — no live 3D rig
 * per body shape yet (SteveViewer3D is a fixed humanoid armor-layer rig, wrong topology for
 * spider/creeper and not real skin-UV mapped even for zombie/skeleton). A per-template 3D
 * preview is a natural follow-up, not required for the mob to work in-game. */
export default function EntityPreview({ entity }: Props) {
  const { packTextures } = useTextures();

  if (!entity) {
    return <div className="text-sm text-muted-foreground italic">Select or add an entity.</div>;
  }

  const url = entity.texture ? packTextures[entity.texture] : undefined;

  return (
    <div className="flex flex-col items-center gap-3">
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
            style={{ width: "90%", height: "90%", objectFit: "contain", imageRendering: "pixelated" }}
          />
        ) : (
          <span className="text-xs text-muted-foreground">No texture</span>
        )}
      </div>
      <div className="text-sm font-medium">{entity.displayName || entity.id}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">ENTITY</div>
      <div className="text-[10px] text-muted-foreground">{BODY_TEMPLATE_LABELS[entity.bodyTemplate]}</div>
      <div className="text-[10px] text-muted-foreground italic">3D preview per body shape — coming later</div>
    </div>
  );
}
