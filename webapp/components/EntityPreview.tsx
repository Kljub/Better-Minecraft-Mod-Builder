"use client";

import React from "react";
import { useTextures } from "@/lib/TextureContext";
import type { EntitySpec } from "@/lib/types";
import { BODY_TEMPLATE_LABELS } from "@/lib/entityRegistry";
import EntityModelViewer3D from "@/components/EntityModelViewer3D";

interface Props {
  entity: EntitySpec | null;
}

/** Flat texture-swatch preview by default (same idiom as ItemBlockPreview's fallback path) — or,
 * once a spec has `useCustomModel` with at least one cuboid, a live orbit-rotatable 3D render of
 * that geometry via `EntityModelViewer3D`. Vanilla-template mobs (no custom model) still have no
 * per-body-shape 3D preview — SteveViewer3D's fixed humanoid rig doesn't generalize to
 * spider/creeper and isn't real skin-UV mapped even for zombie/skeleton. */
export default function EntityPreview({ entity }: Props) {
  const { packTextures } = useTextures();

  if (!entity) {
    return <div className="text-sm text-muted-foreground italic">Select or add an entity.</div>;
  }

  const url = entity.texture ? packTextures[entity.texture] : undefined;
  const hasCustomModel = entity.useCustomModel && entity.geometry.cuboids.length > 0;

  return (
    <div className="flex flex-col items-center gap-3">
      {hasCustomModel ? (
        <EntityModelViewer3D geometry={entity.geometry} textureUrl={url} />
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
              style={{ width: "90%", height: "90%", objectFit: "contain", imageRendering: "pixelated" }}
            />
          ) : (
            <span className="text-xs text-muted-foreground">No texture</span>
          )}
        </div>
      )}
      <div className="text-sm font-medium">{entity.displayName || entity.id}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">ENTITY</div>
      <div className="text-[10px] text-muted-foreground">{BODY_TEMPLATE_LABELS[entity.bodyTemplate]}</div>
      {!hasCustomModel && <div className="text-[10px] text-muted-foreground italic">Enable Custom Model for a 3D preview</div>}
    </div>
  );
}
