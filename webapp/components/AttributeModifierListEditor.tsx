"use client";

import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { AttributeModifierSpec, CustomAttributeSpec } from "@/lib/types";
import { aiGenerate, aiClientLabel, enabledAiClients, setAiPreferred, useAiSettings, type AiClientId } from "@/lib/aiSettings";
import { Field, NumInput, PropSelect } from "@/components/SchemaFields";
import { ATTRIBUTE_OPTIONS, ATTRIBUTE_OPERATION_OPTIONS, EQUIPMENT_SLOT_OPTIONS } from "@/lib/itemRegistry";

interface Props {
  attributes: AttributeModifierSpec[];
  attributeOptions: string[];
  attributeLabels?: Record<string, string>;
  onChange: (next: AttributeModifierSpec[]) => void;
  addLabel?: string;
  /** opens a custom attribute (one of `attributeOptions` that isn't vanilla) in its own editor */
  onEditCustomAttribute?: (id: string) => void;
  /** what's being edited — enables the "✨ AI" prompt row when an AI provider is set in Settings → AI */
  aiContext?: {
    target: "item" | "effect";
    name?: string;
    category?: string;
    rarity?: string;
    customAttributes?: CustomAttributeSpec[];
  };
}

/** Declarative stat-modifier list editor — shared by ItemBlockPropertyPanel (an item's own
 * Attributes list) and EffectPropertyPanel (an effect's attribute modifiers, scaled per
 * amplifier level by vanilla). Matches vanilla's data-driven AttributeModifiers, not a scripted
 * power system. */
export default function AttributeModifierListEditor({
  attributes, attributeOptions, attributeLabels, onChange, addLabel = "+ Add attribute", aiContext, onEditCustomAttribute,
}: Props) {
  const isCustom = (id: string) => !(ATTRIBUTE_OPTIONS as readonly string[]).includes(id);
  return (
    <>
      {aiContext && <AiAttributesRow context={aiContext} onResult={onChange} />}
      {attributes.length === 0 && (
        <div className="text-[10px] text-muted-foreground italic">No stat modifiers yet.</div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1.5">
        {attributes.map((attr, i) => (
          <div key={i} className="flex flex-col gap-1 rounded border border-input p-1.5">
            <div className="flex items-center gap-1">
              <PropSelect
                value={attr.attribute}
                options={attributeOptions}
                labels={attributeLabels}
                onChange={(v) => onChange(attributes.map((a, j) => j === i ? { ...a, attribute: v } : a))}
              />
              {onEditCustomAttribute && isCustom(attr.attribute) && (
                <button
                  title={`Edit the custom attribute ${attributeLabels?.[attr.attribute] ?? attr.attribute}`}
                  aria-label="Edit custom attribute"
                  onClick={() => onEditCustomAttribute(attr.attribute)}
                  className="shrink-0 text-muted-foreground hover:text-primary px-1"
                >
                  ✎
                </button>
              )}
              <button
                title="Remove"
                onClick={() => onChange(attributes.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-destructive px-1"
              >
                ✕
              </button>
            </div>
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
            <Field label="Operation">
              <PropSelect
                value={attr.operation}
                options={ATTRIBUTE_OPERATION_OPTIONS}
                onChange={(v) => onChange(attributes.map((a, j) => j === i ? { ...a, operation: v as typeof a.operation } : a))}
              />
            </Field>
          </div>
        ))}
      </div>
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

/** Free-text request ("attributes for a hell sword") answered by the client(s) enabled in
 * Settings → AI. One client: the result replaces the current list. "All": every enabled client
 * is asked in parallel and each answer gets an Apply button. The server validates ids/ops/slots
 * before anything gets here. */
type AiAnswer =
  | { client: AiClientId; state: "pending" }
  | { client: AiClientId; state: "done"; attributes: AttributeModifierSpec[] }
  | { client: AiClientId; state: "error"; error: string };

function AiAttributesRow({ context, onResult }: {
  context: NonNullable<Props["aiContext"]>;
  onResult: (next: AttributeModifierSpec[]) => void;
}) {
  const settings = useAiSettings();
  const enabled = enabledAiClients(settings);
  const [prompt, setPrompt] = useState("");
  const [answers, setAnswers] = useState<AiAnswer[]>([]);
  if (enabled.length === 0) return null;

  const target: AiClientId | "all" =
    settings.preferred === "all" && enabled.length > 1 ? "all"
      : settings.preferred !== "all" && enabled.includes(settings.preferred) ? settings.preferred
        : enabled[0];
  const busy = answers.some((a) => a.state === "pending");

  const ask = (client: AiClientId, text: string) =>
    aiGenerate<{ attributes: AttributeModifierSpec[] }>(client, "attributes", text, {
      ...context,
      customAttributes: context.customAttributes?.map(({ id, displayName, min, max, defaultBase }) => ({ id, displayName, min, max, defaultBase })),
    });

  const submit = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    const clients = target === "all" ? enabled : [target];
    setAnswers(clients.map((client) => ({ client, state: "pending" })));
    await Promise.all(clients.map(async (client) => {
      let answer: AiAnswer;
      try {
        const { attributes } = await ask(client, text);
        answer = { client, state: "done", attributes };
        if (target !== "all") onResult(attributes);
      } catch (e) {
        answer = { client, state: "error", error: e instanceof Error ? e.message : String(e) };
      }
      setAnswers((prev) => prev.map((a) => (a.client === client ? answer : a)));
    }));
  };

  // Single-client successes are applied directly — only errors, or the "all" comparison, stay listed.
  const shown = target === "all" ? answers : answers.filter((a) => a.state === "error");

  return (
    <div className="flex flex-col gap-1 mb-1.5">
      <div className="flex items-center gap-1">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {enabled.length > 1 && (
          <select
            aria-label="AI client"
            className="h-6 shrink-0 rounded border border-input bg-background px-1 text-xs"
            value={target}
            disabled={busy}
            onChange={(e) => setAiPreferred(e.target.value as AiClientId | "all")}
          >
            {enabled.map((id) => <option key={id} value={id}>{aiClientLabel(id)}</option>)}
            <option value="all">All</option>
          </select>
        )}
        <input
          className="h-6 min-w-0 flex-1 rounded border border-input bg-transparent px-1.5 text-xs"
          placeholder={`Ask ${target === "all" ? "all clients" : aiClientLabel(target)}, e.g. "attributes for a hell sword"`}
          value={prompt}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <button
          className="h-6 shrink-0 rounded border border-input px-2 text-xs hover:border-foreground/40 disabled:opacity-50"
          onClick={submit}
          disabled={busy || !prompt.trim()}
          title={target === "all" ? "Ask every enabled client and compare" : "Generate and replace the current modifiers"}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Generate"}
        </button>
      </div>
      {shown.map((a) => (
        <div key={a.client} className="flex items-start gap-1.5 rounded border border-input px-1.5 py-1 text-[10px]">
          <span className="shrink-0 font-semibold">{aiClientLabel(a.client)}</span>
          {a.state === "pending" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {a.state === "error" && <span className="min-w-0 flex-1 break-words text-destructive">{a.error}</span>}
          {a.state === "done" && (
            <>
              <span className="min-w-0 flex-1 break-words text-muted-foreground">
                {a.attributes.map((m) => `${m.attribute.replace(/^generic\./, "")} ${m.amount >= 0 ? "+" : ""}${m.amount}${m.operation === "add_value" ? "" : " ×"} (${m.slot})`).join(" · ")}
              </span>
              <button
                className="shrink-0 rounded border border-input px-1.5 hover:border-foreground/40"
                onClick={() => onResult(a.attributes)}
              >
                Apply
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
