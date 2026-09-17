"use client";

import React, { useState } from "react";
import type { ItemSpec, BlockSpec, AttributeModifierSpec, CreativeTabSpec, CustomAttributeSpec } from "@/lib/types";
import type { PropField } from "@/lib/widgetRegistry";
import { useTextures } from "@/lib/TextureContext";
import TexturePickerModal from "@/components/TexturePickerModal";
import { Input } from "@/components/ui/input";
import { Field, NumInput, Toggle, PropSelect, TextureField } from "@/components/SchemaFields";
import AttributeModifierListEditor from "@/components/AttributeModifierListEditor";
import {
  ITEM_PROPERTY_SCHEMA, ITEM_FOOD_SCHEMA, ITEM_ARMOR_SCHEMA, CREATIVE_TAB_OPTIONS, CREATIVE_TAB_LABELS,
  ATTRIBUTE_OPTIONS, defaultArmorAttributes,
} from "@/lib/itemRegistry";
import { BLOCK_PROPERTY_SCHEMA, TOOL_TIER_SPEEDS, approxBreakTime, HARDNESS_REFERENCE, RESISTANCE_REFERENCE } from "@/lib/blockRegistry";

export type ItemBlockDoc =
  | { kind: "item"; spec: ItemSpec }
  | { kind: "block"; spec: BlockSpec };

interface Props {
  doc: ItemBlockDoc | null;
  onUpdate: (spec: ItemSpec | BlockSpec) => void;
  /** Project-defined creative tabs (beyond the vanilla ones + shared "custom" bucket) — merged
   * into the Creative Tab field's options. */
  creativeTabs: CreativeTabSpec[];
  /** Project-defined custom attributes (beyond the curated vanilla set) — merged into an item's
   * Attributes list's attribute picker. */
  customAttributes: CustomAttributeSpec[];
  /** Opens the inline texture editor workspace ("paint a new texture") for this item/block. */
  onOpenTextureEditor: () => void;
}

/**
 * Property form for the currently selected Item or Block document. No canvas/x-y-w-h/bindings
 * section here (those are screen-widget concepts) — just ID, texture, and the propSchema-driven
 * field loop, reusing the same generic form primitives as PropertyPanel (see SchemaFields.tsx).
 */
export default function ItemBlockPropertyPanel({ doc, onUpdate, creativeTabs, customAttributes, onOpenTextureEditor }: Props) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [texPickerOpen, setTexPickerOpen] = useState(false);
  const [stagePickerFor, setStagePickerFor] = useState<number | null>(null);

  if (!doc) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select an item or block to edit its properties.
      </div>
    );
  }

  const { spec, kind } = doc;
  const record = spec as unknown as Record<string, unknown>;
  const set = (patch: Record<string, unknown>) =>
    onUpdate({ ...spec, ...patch } as unknown as ItemSpec | BlockSpec);

  const item = kind === "item" ? (spec as ItemSpec) : null;
  const attributes = item?.attributes ?? [];
  const setAttributes = (next: AttributeModifierSpec[]) => set({ attributes: next });
  const damageStages = item?.damageStages ?? [];
  const setDamageStages = (next: { threshold: number; texture: string }[]) => set({ damageStages: next });

  const creativeTabOptions = [...CREATIVE_TAB_OPTIONS, ...creativeTabs.map((t) => t.id)];
  const creativeTabLabels = {
    ...CREATIVE_TAB_LABELS,
    ...Object.fromEntries(creativeTabs.map((t) => [t.id, t.displayName])),
  };

  const attributeOptions = [...ATTRIBUTE_OPTIONS, ...customAttributes.map((a) => a.id)];
  const attributeLabels = Object.fromEntries(customAttributes.map((a) => [a.id, a.displayName]));

  const schema: PropField[] =
    kind === "item"
      ? [
          ...ITEM_PROPERTY_SCHEMA,
          ...(item?.category === "food" ? ITEM_FOOD_SCHEMA : []),
          ...(item?.category === "armor" ? ITEM_ARMOR_SCHEMA : []),
        ]
      : BLOCK_PROPERTY_SCHEMA;

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">
        {kind === "item" ? "Item" : "Block"}
      </div>

      <Field label="ID">
        <Input
          className="h-6 text-xs px-1.5"
          value={spec.id}
          onChange={(e) => set({ id: e.target.value })}
        />
      </Field>

      <div className="col-span-2">
        <Field label="Texture">
          <div className="flex flex-col gap-1">
            <TextureField
              value={spec.texture}
              packTextures={packTextures}
              onPick={() => setTexPickerOpen(true)}
            />
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
        current={spec.texture}
        onSelect={(k) => {
          set({ texture: k });
          setTexPickerOpen(false);
        }}
        onClose={() => setTexPickerOpen(false)}
        onUpload={uploadCustomTexture}
      />

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">{kind === "item" ? "Item Props" : "Block Props"}</div>
      {schema.map((field) => {
        const raw = record[field.key];

        if (field.type === "boolean") {
          const checked = typeof raw === "boolean" ? raw : field.defaultValue === "true";
          return (
            <div key={field.key} className="flex items-center justify-between">
              <span className="text-muted-foreground">{field.label}</span>
              <Toggle checked={checked} onChange={(v) => set({ [field.key]: v })} />
            </div>
          );
        }

        if (field.type === "select") {
          const value = typeof raw === "string" ? raw : (field.defaultValue ?? "");
          return (
            <Field key={field.key} label={field.label}>
              <PropSelect
                value={value}
                options={field.key === "creativeTab" ? creativeTabOptions : (field.options ?? [])}
                labels={field.key === "creativeTab" ? creativeTabLabels : undefined}
                onChange={(v) => {
                  // Switching an item to "armor" seeds a default armor-points attribute (once)
                  // so the piece is immediately wearable with sensible stats, editable below.
                  if (field.key === "category" && v === "armor" && item && attributes.length === 0) {
                    set({ category: v, attributes: defaultArmorAttributes(item.armorSlot ?? "chestplate") });
                    return;
                  }
                  set({ [field.key]: v });
                }}
              />
            </Field>
          );
        }

        if (field.type === "number" && kind === "block" && (field.key === "hardness" || field.key === "resistance")) {
          const value = typeof raw === "number" ? raw : Number(field.defaultValue ?? 0);
          const block = spec as BlockSpec;
          return (
            <div key={field.key} className="col-span-2">
              <Field label={field.label}>
                <NumInput value={value} onChange={(v) => set({ [field.key]: v })} />
                {field.key === "hardness" ? (
                  <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 rounded border border-input p-1.5 text-[10px] text-muted-foreground">
                    {TOOL_TIER_SPEEDS.map(({ label, speed }) => (
                      <div key={label} className="flex justify-between">
                        <span>{label}</span>
                        <span>{approxBreakTime(value, speed, label === "Hand", block.requiresTool)}</span>
                      </div>
                    ))}
                    <div className="col-span-2 pt-0.5 text-muted-foreground/70">Ref: {HARDNESS_REFERENCE}</div>
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-muted-foreground/70">Ref: {RESISTANCE_REFERENCE}</div>
                )}
              </Field>
            </div>
          );
        }

        if (field.type === "number") {
          const value = typeof raw === "number" ? raw : Number(field.defaultValue ?? 0);
          return (
            <Field key={field.key} label={field.label}>
              <NumInput value={value} onChange={(v) => set({ [field.key]: v })} />
            </Field>
          );
        }

        const value = typeof raw === "string" ? raw : (field.defaultValue ?? "");
        return (
          <Field key={field.key} label={field.label}>
            <Input
              className="h-6 text-xs px-1.5"
              value={value}
              onChange={(e) => set({ [field.key]: e.target.value })}
            />
          </Field>
        );
      })}

      {item && (
        <div className="col-span-2">
          <div className="font-semibold text-muted-foreground mt-1">Attributes</div>
          <AttributeModifierListEditor
            attributes={attributes}
            attributeOptions={attributeOptions}
            attributeLabels={attributeLabels}
            onChange={setAttributes}
          />
        </div>
      )}

      {item && (item.durability ?? 0) > 0 && (
        <div className="col-span-2">
          <div className="font-semibold text-muted-foreground mt-1">Damage Stages (durability-based texture swap)</div>
          <p className="text-[10px] text-muted-foreground mb-1">
            Swaps to a different icon once the item&apos;s taken damage past each threshold (0 = undamaged, 1 = about to
            break). Real item-model mechanism (range_dispatch on the damage fraction), not a fake overlay.
          </p>
          {damageStages.length === 0 && (
            <div className="text-[10px] text-muted-foreground italic mb-1">No damage stages yet — icon stays the same regardless of wear.</div>
          )}
          {damageStages.map((stage, i) => {
            const texUrl = stage.texture ? packTextures[stage.texture] : undefined;
            return (
              <div key={i} className="flex items-center gap-1 mb-1">
                <button
                  type="button"
                  title={stage.texture ? `${stage.texture} — click to change` : "Click to pick a texture"}
                  onClick={() => setStagePickerFor(i)}
                  className="h-6 w-6 shrink-0 overflow-hidden rounded border border-input bg-[#8b8b8b]"
                  style={{ imageRendering: "pixelated" }}
                >
                  {texUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={texUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", imageRendering: "pixelated" }} />
                  )}
                </button>
                <div className="w-20 shrink-0">
                  <NumInput
                    value={stage.threshold}
                    onChange={(v) => setDamageStages(damageStages.map((s, j) => j === i ? { ...s, threshold: Math.min(1, Math.max(0, v)) } : s))}
                  />
                </div>
                <button
                  title="Remove"
                  onClick={() => setDamageStages(damageStages.filter((_, j) => j !== i))}
                  className="shrink-0 text-muted-foreground hover:text-destructive px-1"
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button
            className="w-full rounded border border-dashed border-input py-0.5 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            onClick={() => setDamageStages([...damageStages, { threshold: 0.5, texture: "" }])}
          >
            + Add damage stage
          </button>
          <TexturePickerModal
            open={stagePickerFor !== null}
            packTextures={packTextures}
            current={stagePickerFor !== null ? (damageStages[stagePickerFor]?.texture ?? "") : ""}
            onSelect={(k) => { if (stagePickerFor !== null) setDamageStages(damageStages.map((s, j) => j === stagePickerFor ? { ...s, texture: k } : s)); setStagePickerFor(null); }}
            onClose={() => setStagePickerFor(null)}
            onUpload={uploadCustomTexture}
          />
        </div>
      )}
    </div>
  );
}
