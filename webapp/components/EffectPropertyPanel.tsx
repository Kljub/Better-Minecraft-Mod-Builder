"use client";

import React, { useState } from "react";
import type { EffectSpec, AttributeModifierSpec, CustomAttributeSpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, PropSelect, Toggle, HexColorField, TextureField, ItemIdField } from "@/components/SchemaFields";
import AttributeModifierListEditor from "@/components/AttributeModifierListEditor";
import { ATTRIBUTE_OPTIONS } from "@/lib/itemRegistry";
import { EFFECT_PARTICLE_OPTIONS, EFFECT_PARTICLE_LABELS, EFFECT_ADD_SOUND_OPTIONS } from "@/lib/effectRegistry";
import { useTextures } from "@/lib/TextureContext";
import TexturePickerModal from "@/components/TexturePickerModal";

interface Props {
  effect: EffectSpec | null;
  customAttributes: CustomAttributeSpec[];
  onUpdate: (patch: Partial<EffectSpec>) => void;
  onOpenTextureEditor: () => void;
}

/** Property form for the currently selected custom Effect (MobEffect) — same layout convention
 * as ItemBlockPropertyPanel/CustomAttributePropertyPanel. Fields beyond displayName/category/color
 * (icon, isInstant, particle, soundOnAdded) all map to real MobEffect API — verified via javap
 * against the actual game jar, not guessed (see plan file). Two MCreator-style fields were
 * deliberately left out: "render in inventory/HUD" and "cured by honey" are not properties of the
 * effect *type* in this MC version — they live on MobEffectInstance (set per-application, e.g. by
 * a command's hideParticles flag) or aren't backed by any field at all, respectively. */
export default function EffectPropertyPanel({ effect, customAttributes, onUpdate, onOpenTextureEditor }: Props) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [texPickerOpen, setTexPickerOpen] = useState(false);

  if (!effect) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select an effect to edit its properties.
      </div>
    );
  }

  const attributes = effect.attributes ?? [];
  const setAttributes = (next: AttributeModifierSpec[]) => onUpdate({ attributes: next });
  const attributeOptions = [...ATTRIBUTE_OPTIONS, ...customAttributes.map((a) => a.id)];
  const attributeLabels = Object.fromEntries(customAttributes.map((a) => [a.id, a.displayName]));

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Effect</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={effect.id} disabled />
      </Field>

      <Field label="Display Name">
        <Input
          className="h-6 text-xs px-1.5"
          value={effect.displayName}
          onChange={(e) => onUpdate({ displayName: e.target.value })}
        />
      </Field>

      <div className="col-span-2">
        <Field label="Icon (inventory/HUD status icon)">
          <div className="flex flex-col gap-1">
            <TextureField value={effect.icon} packTextures={packTextures} onPick={() => setTexPickerOpen(true)} />
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
        current={effect.icon}
        onSelect={(k) => { onUpdate({ icon: k }); setTexPickerOpen(false); }}
        onClose={() => setTexPickerOpen(false)}
        onUpload={uploadCustomTexture}
      />

      <Field label="Category">
        <PropSelect
          value={effect.category}
          options={["beneficial", "harmful", "neutral"]}
          onChange={(v) => onUpdate({ category: v as EffectSpec["category"] })}
        />
      </Field>
      <Field label="Color">
        <HexColorField value={effect.color} onChange={(v) => onUpdate({ color: v })} />
      </Field>

      <label className="col-span-2 flex items-center gap-1.5 mt-1">
        <Toggle checked={effect.isInstant} onChange={(v) => onUpdate({ isInstant: v })} />
        <span>Instantly applied (like Instant Health) — no per-tick duration</span>
      </label>

      <Field label="Particle while active">
        <PropSelect
          value={effect.particle}
          options={EFFECT_PARTICLE_OPTIONS}
          labels={EFFECT_PARTICLE_LABELS}
          onChange={(v) => onUpdate({ particle: v })}
        />
      </Field>

      <Field label="Sound when added (optional)">
        <ItemIdField
          value={effect.soundOnAdded}
          onChange={(v) => onUpdate({ soundOnAdded: v })}
          options={EFFECT_ADD_SOUND_OPTIONS}
          placeholder="(none)"
        />
      </Field>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Attribute Modifiers (per level)</div>
      <div className="col-span-2">
        <AttributeModifierListEditor
          attributes={attributes}
          attributeOptions={attributeOptions}
          attributeLabels={attributeLabels}
          onChange={setAttributes}
          addLabel="+ Add attribute modifier"
        />
      </div>
    </div>
  );
}
