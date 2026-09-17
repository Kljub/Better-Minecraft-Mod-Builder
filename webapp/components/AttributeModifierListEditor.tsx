"use client";

import React from "react";
import type { AttributeModifierSpec } from "@/lib/types";
import { Field, NumInput, PropSelect } from "@/components/SchemaFields";
import { ATTRIBUTE_OPTIONS, ATTRIBUTE_OPERATION_OPTIONS, EQUIPMENT_SLOT_OPTIONS } from "@/lib/itemRegistry";

interface Props {
  attributes: AttributeModifierSpec[];
  attributeOptions: string[];
  attributeLabels?: Record<string, string>;
  onChange: (next: AttributeModifierSpec[]) => void;
  addLabel?: string;
}

/** Declarative stat-modifier list editor — shared by ItemBlockPropertyPanel (an item's own
 * Attributes list) and EffectPropertyPanel (an effect's attribute modifiers, scaled per
 * amplifier level by vanilla). Matches vanilla's data-driven AttributeModifiers, not a scripted
 * power system. */
export default function AttributeModifierListEditor({
  attributes, attributeOptions, attributeLabels, onChange, addLabel = "+ Add attribute",
}: Props) {
  return (
    <>
      {attributes.length === 0 && (
        <div className="text-[10px] text-muted-foreground italic">No stat modifiers yet.</div>
      )}
      {attributes.map((attr, i) => (
        <div key={i} className="flex flex-col gap-1 rounded border border-input p-1.5">
          <div className="flex items-center gap-1">
            <PropSelect
              value={attr.attribute}
              options={attributeOptions}
              labels={attributeLabels}
              onChange={(v) => onChange(attributes.map((a, j) => j === i ? { ...a, attribute: v } : a))}
            />
            <button
              title="Remove"
              onClick={() => onChange(attributes.filter((_, j) => j !== i))}
              className="shrink-0 text-muted-foreground hover:text-destructive px-1"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Field label="Amount">
              <NumInput value={attr.amount} onChange={(v) => onChange(attributes.map((a, j) => j === i ? { ...a, amount: v } : a))} />
            </Field>
            <Field label="Slot">
              <PropSelect
                value={attr.slot}
                options={EQUIPMENT_SLOT_OPTIONS}
                onChange={(v) => onChange(attributes.map((a, j) => j === i ? { ...a, slot: v as typeof a.slot } : a))}
              />
            </Field>
          </div>
          <Field label="Operation">
            <PropSelect
              value={attr.operation}
              options={ATTRIBUTE_OPERATION_OPTIONS}
              onChange={(v) => onChange(attributes.map((a, j) => j === i ? { ...a, operation: v as typeof a.operation } : a))}
            />
          </Field>
        </div>
      ))}
      <button
        className="w-full rounded border border-dashed border-input py-0.5 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        onClick={() => onChange([
          ...attributes,
          { attribute: attributeOptions[0] ?? ATTRIBUTE_OPTIONS[0], amount: 1, operation: "add_value", slot: "any" },
        ])}
      >
        {addLabel}
      </button>
    </>
  );
}
