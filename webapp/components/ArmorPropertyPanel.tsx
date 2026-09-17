"use client";

import React, { useState } from "react";
import type { ArmorSpec, CreativeTabSpec, ItemSpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, NumInput, PropSelect, TextureField, ItemIdField } from "@/components/SchemaFields";
import { VANILLA_ITEM_OPTIONS } from "@/lib/vanillaItems";
import { ARMOR_MATERIAL_PRESETS, ARMOR_MATERIAL_PRESET_OPTIONS } from "@/lib/armorRegistry";
import { CREATIVE_TAB_OPTIONS, CREATIVE_TAB_LABELS } from "@/lib/itemRegistry";
import { useTextures } from "@/lib/TextureContext";
import TexturePickerModal from "@/components/TexturePickerModal";

interface Props {
  armor: ArmorSpec | null;
  items: ItemSpec[];
  creativeTabs: CreativeTabSpec[];
  modId: string;
  onUpdate: (patch: Partial<ArmorSpec>) => void;
  onOpenTextureEditor: (target: TexTarget) => void;
}

export type TexTarget = "iconHelmet" | "iconChestplate" | "iconLeggings" | "iconBoots" | "equipmentTexture";

const TEX_LABELS: Record<TexTarget, string> = {
  iconHelmet: "Helmet icon", iconChestplate: "Chestplate icon", iconLeggings: "Leggings icon", iconBoots: "Boots icon",
  equipmentTexture: "Body texture (3D)",
};

/** Property form for the currently selected Armor Set — 4 pieces (helmet/chestplate/leggings/
 * boots) sharing one custom material, matching vanilla's own armor material concept. */
export default function ArmorPropertyPanel({ armor, items, creativeTabs, modId, onUpdate, onOpenTextureEditor }: Props) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [texPickerFor, setTexPickerFor] = useState<TexTarget | null>(null);

  if (!armor) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select an armor set to edit its properties.
      </div>
    );
  }

  const itemOptions = [...VANILLA_ITEM_OPTIONS, ...items.map((i) => `${modId}:${i.id}`)];
  const creativeTabOptions = [...CREATIVE_TAB_OPTIONS, ...creativeTabs.map((t) => t.id)];
  const creativeTabLabels = { ...CREATIVE_TAB_LABELS, ...Object.fromEntries(creativeTabs.map((t) => [t.id, t.displayName])) };

  const texField = (target: TexTarget) => (
    <Field label={TEX_LABELS[target]}>
      <div className="flex flex-col gap-1">
        <TextureField value={armor[target]} packTextures={packTextures} onPick={() => setTexPickerFor(target)} />
        <button
          type="button"
          onClick={() => onOpenTextureEditor(target)}
          className="text-[10px] text-muted-foreground underline decoration-dotted hover:text-foreground"
        >
          or paint a new texture…
        </button>
      </div>
    </Field>
  );

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Armor Set</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={armor.id} disabled />
      </Field>
      <Field label="Display Name">
        <Input className="h-6 text-xs px-1.5" value={armor.displayName} onChange={(e) => onUpdate({ displayName: e.target.value })} />
      </Field>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Icons (inventory, one per piece)</div>
      {texField("iconHelmet")}
      {texField("iconChestplate")}
      {texField("iconLeggings")}
      {texField("iconBoots")}

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Body Texture (worn, 3D)</div>
      <div className="col-span-2">{texField("equipmentTexture")}</div>

      <TexturePickerModal
        open={texPickerFor !== null}
        packTextures={packTextures}
        current={texPickerFor ? armor[texPickerFor] : ""}
        onSelect={(k) => { if (texPickerFor) onUpdate({ [texPickerFor]: k }); setTexPickerFor(null); }}
        onClose={() => setTexPickerFor(null)}
        onUpload={uploadCustomTexture}
      />

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Material</div>
      <div className="col-span-2">
        <Field label="Start from preset">
          <PropSelect
            value=""
            options={["", ...ARMOR_MATERIAL_PRESET_OPTIONS]}
            labels={{ "": "(pick a preset to apply)" }}
            onChange={(v) => { if (v && ARMOR_MATERIAL_PRESETS[v]) onUpdate(ARMOR_MATERIAL_PRESETS[v]); }}
          />
        </Field>
      </div>
      <Field label="Durability (unit)">
        <NumInput value={armor.durability} onChange={(v) => onUpdate({ durability: Math.max(1, Math.round(v)) })} />
      </Field>
      <Field label="Enchantment Value">
        <NumInput value={armor.enchantmentValue} onChange={(v) => onUpdate({ enchantmentValue: Math.max(1, Math.round(v)) })} />
      </Field>
      <Field label="Toughness">
        <NumInput value={armor.toughness} onChange={(v) => onUpdate({ toughness: v })} />
      </Field>
      <Field label="Knockback Resistance">
        <NumInput value={armor.knockbackResistance} onChange={(v) => onUpdate({ knockbackResistance: v })} />
      </Field>
      <div className="col-span-2">
        <Field label="Repair Item">
          <ItemIdField value={armor.repairItem} onChange={(v) => onUpdate({ repairItem: v })} options={itemOptions} />
        </Field>
      </div>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Defense (per piece)</div>
      <div className="col-span-2 grid grid-cols-4 gap-1">
        <Field label="Helmet">
          <NumInput value={armor.defenseHelmet} onChange={(v) => onUpdate({ defenseHelmet: Math.max(0, Math.round(v)) })} />
        </Field>
        <Field label="Chest">
          <NumInput value={armor.defenseChestplate} onChange={(v) => onUpdate({ defenseChestplate: Math.max(0, Math.round(v)) })} />
        </Field>
        <Field label="Legs">
          <NumInput value={armor.defenseLeggings} onChange={(v) => onUpdate({ defenseLeggings: Math.max(0, Math.round(v)) })} />
        </Field>
        <Field label="Boots">
          <NumInput value={armor.defenseBoots} onChange={(v) => onUpdate({ defenseBoots: Math.max(0, Math.round(v)) })} />
        </Field>
      </div>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Item Props</div>
      <Field label="Creative Tab">
        <PropSelect value={armor.creativeTab} options={creativeTabOptions} labels={creativeTabLabels} onChange={(v) => onUpdate({ creativeTab: v })} />
      </Field>
      <Field label="Rarity">
        <PropSelect value={armor.rarity} options={["common", "uncommon", "rare", "epic"]} onChange={(v) => onUpdate({ rarity: v as ArmorSpec["rarity"] })} />
      </Field>
    </div>
  );
}
