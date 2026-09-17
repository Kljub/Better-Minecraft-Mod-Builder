"use client";

import React, { useState } from "react";
import type { EntitySpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, NumInput, PropSelect, TextureField, HexColorField, Toggle } from "@/components/SchemaFields";
import { BODY_TEMPLATE_OPTIONS, BODY_TEMPLATE_LABELS, MOB_CATEGORY_OPTIONS, GEOMETRY_DEFAULT } from "@/lib/entityRegistry";
import { CREATIVE_TAB_OPTIONS, CREATIVE_TAB_LABELS } from "@/lib/itemRegistry";
import type { CreativeTabSpec, EntityGeometry } from "@/lib/types";
import { useTextures } from "@/lib/TextureContext";
import TexturePickerModal from "@/components/TexturePickerModal";
import EntityGeometryEditor from "@/components/EntityGeometryEditor";

interface Props {
  entity: EntitySpec | null;
  creativeTabs: CreativeTabSpec[];
  onUpdate: (patch: Partial<EntitySpec>) => void;
  onOpenTextureEditor: () => void;
}

/** Property form for the currently selected Entity (custom mob). One shared Java entity/renderer
 * class pair per bodyTemplate backs every spec that picks it — see EntitySpec's doc comment in
 * lib/types.ts for why this isn't a bespoke Java class per mob. */
export default function EntityPropertyPanel({ entity, creativeTabs, onUpdate, onOpenTextureEditor }: Props) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [texPickerOpen, setTexPickerOpen] = useState(false);

  if (!entity) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select an entity to edit its properties.
      </div>
    );
  }

  const creativeTabOptions = [...CREATIVE_TAB_OPTIONS, ...creativeTabs.map((t) => t.id)];
  const creativeTabLabels = { ...CREATIVE_TAB_LABELS, ...Object.fromEntries(creativeTabs.map((t) => [t.id, t.displayName])) };

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Entity</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={entity.id} disabled />
      </Field>
      <Field label="Display Name">
        <Input className="h-6 text-xs px-1.5" value={entity.displayName} onChange={(e) => onUpdate({ displayName: e.target.value })} />
      </Field>

      <div className="col-span-2">
        <Field label="Body Template">
          <PropSelect
            value={entity.bodyTemplate}
            options={BODY_TEMPLATE_OPTIONS}
            labels={BODY_TEMPLATE_LABELS}
            onChange={(v) => onUpdate({ bodyTemplate: v as EntitySpec["bodyTemplate"] })}
          />
        </Field>
        <p className="text-[10px] text-muted-foreground mt-1">
          Decides AI/physics only. Rendering below can either reuse that vanilla mob&apos;s model or a custom one.
        </p>
      </div>

      <div className="col-span-2 flex items-center justify-between">
        <span className="text-muted-foreground">Custom Model (cuboid editor)</span>
        <Toggle
          checked={entity.useCustomModel}
          onChange={(v) => onUpdate({ useCustomModel: v, geometry: entity.geometry ?? GEOMETRY_DEFAULT })}
        />
      </div>

      {entity.useCustomModel && (
        <div className="col-span-2 rounded border border-input p-2" style={{ minHeight: 420 }}>
          <EntityGeometryEditor
            geometry={entity.geometry}
            textureUrl={entity.texture ? packTextures[entity.texture] : undefined}
            onChange={(next: EntityGeometry) => onUpdate({ geometry: next })}
          />
        </div>
      )}

      <div className="col-span-2">
        <Field label="Texture (skin)">
          <div className="flex flex-col gap-1">
            <TextureField value={entity.texture} packTextures={packTextures} onPick={() => setTexPickerOpen(true)} />
            <button
              type="button"
              onClick={onOpenTextureEditor}
              className="text-[10px] text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              or paint a new texture…
            </button>
          </div>
        </Field>
      </div>
      <TexturePickerModal
        open={texPickerOpen}
        packTextures={packTextures}
        current={entity.texture}
        onSelect={(k) => { onUpdate({ texture: k }); setTexPickerOpen(false); }}
        onClose={() => setTexPickerOpen(false)}
        onUpload={uploadCustomTexture}
      />

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Attributes</div>
      <Field label="Max Health">
        <NumInput value={entity.maxHealth} onChange={(v) => onUpdate({ maxHealth: Math.max(1, v) })} />
      </Field>
      <Field label="Movement Speed">
        <NumInput value={entity.movementSpeed} onChange={(v) => onUpdate({ movementSpeed: Math.max(0, v) })} />
      </Field>
      <Field label="Attack Damage">
        <NumInput value={entity.attackDamage} onChange={(v) => onUpdate({ attackDamage: Math.max(0, v) })} />
      </Field>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Hitbox</div>
      <Field label="Width">
        <NumInput value={entity.hitboxWidth} onChange={(v) => onUpdate({ hitboxWidth: Math.max(0.1, v) })} />
      </Field>
      <Field label="Height">
        <NumInput value={entity.hitboxHeight} onChange={(v) => onUpdate({ hitboxHeight: Math.max(0.1, v) })} />
      </Field>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Fire Immune</span>
        <Toggle checked={entity.fireImmune} onChange={(v) => onUpdate({ fireImmune: v })} />
      </div>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Spawn Egg</div>
      <Field label="Primary Color">
        <HexColorField value={entity.spawnEggPrimaryColor} onChange={(v) => onUpdate({ spawnEggPrimaryColor: v })} />
      </Field>
      <Field label="Secondary Color">
        <HexColorField value={entity.spawnEggSecondaryColor} onChange={(v) => onUpdate({ spawnEggSecondaryColor: v })} />
      </Field>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Entity Props</div>
      <Field label="Mob Category">
        <PropSelect value={entity.mobCategory} options={MOB_CATEGORY_OPTIONS} onChange={(v) => onUpdate({ mobCategory: v as EntitySpec["mobCategory"] })} />
      </Field>
      <Field label="Creative Tab">
        <PropSelect value={entity.creativeTab} options={creativeTabOptions} labels={creativeTabLabels} onChange={(v) => onUpdate({ creativeTab: v })} />
      </Field>

      <div className="col-span-2 mt-1 rounded border border-input p-1.5 text-[10px] text-muted-foreground">
        Spawn-egg / <code>/summon</code> only in this version — natural biome spawning isn&apos;t wired yet.
        AI goals inherit the vanilla {BODY_TEMPLATE_LABELS[entity.bodyTemplate]}&apos;s behavior — a custom AI system
        is being developed separately and hooks in later via <code>Template{entity.bodyTemplate[0].toUpperCase() + entity.bodyTemplate.slice(1)}Entity.java</code>.
      </div>
    </div>
  );
}
