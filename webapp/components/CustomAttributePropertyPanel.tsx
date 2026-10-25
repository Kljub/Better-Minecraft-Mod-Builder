"use client";

import React, { useEffect, useState } from "react";
import type { CustomAttributeSpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, NumInput, Toggle, PropSelect } from "@/components/SchemaFields";

interface Props {
  /** shown before the id: custom attributes live in the mod's namespace */
  modId?: string;
  attribute: CustomAttributeSpec | null;
  onUpdate: (patch: Partial<CustomAttributeSpec>) => void;
  /** Renames the attribute's id itself (not just displayName) — rewrites any item/effect that
   * already references the old id. Committed on blur/Enter, not per keystroke. */
  onRenameId: (id: string) => void;
}

/**
 * Property form for the currently selected custom Attribute — same layout convention as
 * ItemBlockPropertyPanel. Only the display name needs typing: the ID follows it as
 * "{modid}_attribute_{displayname}" (page.tsx updateCustomAttribute) until it's edited by hand;
 * items/effects reference the id, and renaming it rewrites those references too.
 */
export default function CustomAttributePropertyPanel({ attribute, onUpdate, onRenameId, modId }: Props) {
  const [idInput, setIdInput] = useState(attribute?.id ?? "");
  useEffect(() => { setIdInput(attribute?.id ?? ""); }, [attribute?.id]);

  if (!attribute) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select a custom attribute to edit its properties.
      </div>
    );
  }

  const commitId = () => {
    const trimmed = idInput.trim();
    if (!trimmed || trimmed === attribute.id) { setIdInput(attribute.id); return; }
    onRenameId(trimmed);
  };

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Custom Attribute</div>

      <Field label="Display Name">
        <Input
          className="h-6 text-xs px-1.5"
          value={attribute.displayName}
          onChange={(e) => onUpdate({ displayName: e.target.value })}
        />
      </Field>

      <Field label="ID">
        <div className="flex items-center gap-0.5" title="Set automatically from the display name as {modid}_attribute_{name}. Editing it by hand stops that.">
          {modId && <span className="shrink-0 font-mono text-muted-foreground" title="Namespace (your mod id)">{modId}:</span>}
          <Input
            className="h-6 text-xs px-1.5 font-mono"
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
        </div>
      </Field>

      <div className="col-span-2 grid grid-cols-3 gap-1">
        <Field label="Base">
          <NumInput value={attribute.defaultBase} onChange={(v) => onUpdate({ defaultBase: v })} />
        </Field>
        <Field label="Min">
          <NumInput value={attribute.min} onChange={(v) => onUpdate({ min: v })} />
        </Field>
        <Field label="Max">
          <NumInput value={attribute.max} onChange={(v) => onUpdate({ max: v })} />
        </Field>
      </div>

      <Field label="Sentiment">
        <PropSelect
          value={attribute.sentiment}
          options={["positive", "neutral", "negative"]}
          onChange={(v) => onUpdate({ sentiment: v as CustomAttributeSpec["sentiment"] })}
        />
      </Field>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Add to all living things</span>
        <Toggle checked={attribute.addToAllLiving} onChange={(v) => onUpdate({ addToAllLiving: v })} />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Add to players</span>
        <Toggle checked={attribute.addToPlayers} onChange={(v) => onUpdate({ addToPlayers: v })} />
      </div>
    </div>
  );
}
