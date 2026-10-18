"use client";

import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import CreativeItemPicker, { ItemIconView, type ModItem } from "@/components/CreativeItemPicker";
import { ITEM_ICONS } from "@/lib/creativeInventory";

/**
 * Small generic form primitives shared by PropertyPanel (WidgetSpec.props, always
 * string-valued) and ItemBlockPropertyPanel (ItemSpec/BlockSpec, typed fields adapted to
 * string in/out at this layer). Kept dumb and string-based on purpose — callers own any
 * type coercion for their own spec shape.
 */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Debounced hex color input — native <input type=color> fires onChange continuously while
 * dragged, same fix as TextureEditorPanel's color picker / PropertyPanel's ColorField. */
export function HexColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = (v: string) => {
    setLocal(v);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onChange(v), 100);
  };
  return (
    <input
      type="color"
      value={local}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => onChange(local)}
      className="h-6 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
    />
  );
}

// Free-typed text, decoupled from the committed numeric value — a controlled number input that
// re-parses (and clamps invalid input back) on every keystroke makes it impossible to type
// things like "-1" (the intermediate "-" parses to NaN and gets rejected) or "32" starting from a
// small number. Parse only on blur/Enter, like a normal number field.
export function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const commit = () => {
    const n = parseFloat(text);
    if (!isNaN(n)) { onChange(n); setText(String(n)); }
    else setText(String(value));
  };

  return (
    <Input
      className="h-6 text-xs px-1.5"
      type="number"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked ? "bg-primary" : "bg-input"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-3" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function PropSelect({
  value,
  options,
  labels = {},
  onChange,
  extraOptions = [],
}: {
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
  extraOptions?: string[];
}) {
  const allOptions = [...new Set([...options, ...extraOptions])];
  // Native select: the closed control shows the option's label (e.g. "minecraft:max_health"),
  // where the styled popup select showed the raw value.
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-6 w-full min-w-0 rounded-md border border-input bg-background px-1.5 text-xs"
    >
      {allOptions.map((opt) => (
        <option key={opt} value={opt}>{(labels[opt] ?? opt) || "(none)"}</option>
      ))}
    </select>
  );
}

let itemIdFieldSeq = 0;

/** Free-typed item id field (vanilla like "minecraft:diamond" or a project item's own id) with a
 * native <datalist> of suggestions — this app has no vanilla item catalog to validate against, so
 * unlike PropSelect this never restricts input to the given options, only offers them. Decoupled
 * from the committed value like NumInput (commit on blur/Enter), so mid-typing text isn't fought. */
export function ItemIdField({
  value,
  onChange,
  options,
  placeholder = "minecraft:diamond",
  picker = true,
  blocksOnly = false,
  modItems,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  /** slot button that opens the creative-inventory picker (off where a caller has its own) */
  picker?: boolean;
  /** only block items in the picker (e.g. block-state fields) */
  blocksOnly?: boolean;
  /** the project's own items for the picker's "This Mod" tab; default: non-vanilla ids from `options` */
  modItems?: ModItem[];
}) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  const [listId] = useState(() => `item-id-options-${++itemIdFieldSeq}`);
  const [open, setOpen] = useState(false);
  const mods = modItems ?? options.filter((o) => o.includes(":") && !o.startsWith("minecraft:") && !o.startsWith("#")).map((id) => ({ id }));
  const vanilla = value.startsWith("minecraft:") ? ITEM_ICONS[value.slice(10)] : !value.includes(":") ? ITEM_ICONS[value] : undefined;
  return (
    <div className="flex min-w-0 items-center gap-1">
      {picker && (
        <>
          <button type="button" onClick={() => setOpen(true)} title={`${value || "(none)"} — pick from the creative inventory`} aria-label="Pick item"
            className="mc-slot flex h-6 w-6 shrink-0 items-center justify-center">
            {vanilla ? <ItemIconView icon={vanilla} size={18} /> : null}
          </button>
          <CreativeItemPicker open={open} onClose={() => setOpen(false)} modItems={mods} blocksOnly={blocksOnly}
            onSelect={(id) => { setText(id); onChange(id); setOpen(false); }} />
        </>
      )}
      <Input
        className="h-6 text-xs px-1.5 font-mono"
        list={listId}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.trim())}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
      <datalist id={listId}>
        {options.map((opt) => <option key={opt} value={opt} />)}
      </datalist>
    </div>
  );
}

/** Texture-picker trigger button + filename caption, shared by sprite/icon-style fields. */
export function TextureField({
  value,
  packTextures,
  onPick,
}: {
  value: string;
  packTextures: Record<string, string>;
  onPick: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        title="Change texture"
        onClick={onPick}
        className="w-full rounded border border-input hover:border-ring overflow-hidden transition-colors cursor-pointer"
        style={{ background: "#555", aspectRatio: value && packTextures[value] ? undefined : "16/9" }}
      >
        {value && packTextures[value] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={packTextures[value]}
            alt=""
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated", display: "block" }}
          />
        ) : (
          <span className="flex items-center justify-center py-4 text-xs text-muted-foreground">Pick texture…</span>
        )}
      </button>
      {value && <p className="text-[10px] text-muted-foreground truncate">{value}</p>}
    </div>
  );
}
