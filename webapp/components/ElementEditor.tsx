"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FileJson, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TexturePickerModal from "@/components/TexturePickerModal";
import StructureField from "@/components/StructureField";
import { Field, NumInput, Toggle, ItemIdField, TextureField, HexColorField } from "@/components/SchemaFields";
import { useTextures } from "@/lib/TextureContext";
import type { ElementKindDef, ElementSpec, FieldContext, FieldDef } from "@/lib/elements/types";
import type { McVersion } from "@/lib/mcVersion";

/**
 * Schema-driven editor for a generic element (lib/elements): renders the
 * kind's `fields` as a form, shows its validation problems, and — in the side
 * panel — the exact files it will export.
 */
export default function ElementEditor({ def, spec, ctx, onChange }: {
  def: ElementKindDef;
  spec: ElementSpec;
  ctx: FieldContext;
  onChange: (patch: Partial<ElementSpec>) => void;
}) {
  const problems = def.validate?.(spec, { modId: ctx.modId, mcVersion: ctx.mcVersion }) ?? [];
  const Icon = def.icon;
  return (
    <div className="flex flex-col gap-3 p-4 text-xs" data-testid="element-editor">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">{def.label}</h2>
        <span className="font-mono text-muted-foreground">{ctx.modId}:{spec.id}</span>
      </div>
      <p className="max-w-2xl leading-relaxed text-muted-foreground">{def.description}</p>
      {problems.length > 0 && (
        <div className="flex flex-col gap-1 rounded-sm border border-amber-500/40 bg-amber-500/10 p-2 text-amber-200" role="alert">
          {problems.map((p) => (
            <div key={p} className="flex items-start gap-1.5"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{p}</div>
          ))}
        </div>
      )}
      <FieldGrid fields={def.fields} value={spec} ctx={ctx} onChange={onChange} />
    </div>
  );
}

export function FieldGrid({ fields, value, ctx, onChange }: {
  fields: FieldDef[];
  value: ElementSpec | Record<string, unknown>;
  ctx: FieldContext;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="grid grid-cols-2 items-start gap-x-3 gap-y-2.5">
      {fields.filter((f) => !f.when || f.when(value as ElementSpec)).map((f) => (
        <div key={f.key} className={f.half ? "col-span-1" : "col-span-2"} data-field={f.key}>
          {f.type === "boolean" ? (
            <label className="flex cursor-pointer items-center gap-2 py-1">
              <Toggle checked={value[f.key] === true} onChange={(v) => onChange({ [f.key]: v })} />
              <span>{f.label}</span>
            </label>
          ) : (
            <Field label={f.label}>
              <FieldInput field={f} value={value[f.key]} ctx={ctx} onChange={(v) => onChange({ [f.key]: v })} />
            </Field>
          )}
          {f.help && <p className="mt-0.5 text-[10px] text-muted-foreground">{f.help}</p>}
        </div>
      ))}
    </div>
  );
}

function FieldInput({ field, value, ctx, onChange }: {
  field: FieldDef;
  value: unknown;
  ctx: FieldContext;
  onChange: (v: unknown) => void;
}) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [pickerOpen, setPickerOpen] = useState(false);
  const text = typeof value === "string" ? value : "";
  switch (field.type) {
    case "text":
      return (
        <Input className={`h-7 px-1.5 text-xs ${field.mono ? "font-mono" : ""}`} value={text} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)} />
      );
    case "textarea":
      return (
        <textarea
          className={`w-full resize-y rounded-sm border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring ${field.mono ? "font-mono leading-relaxed" : ""}`}
          rows={field.rows ?? 4}
          value={text}
          placeholder={field.placeholder}
          spellCheck={!field.mono}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number": {
      const n = typeof value === "number" ? value : 0;
      return (
        <NumInput value={n} onChange={(v) => {
          let next = field.integer ? Math.round(v) : v;
          if (field.min !== undefined) next = Math.max(field.min, next);
          if (field.max !== undefined) next = Math.min(field.max, next);
          onChange(next);
        }} />
      );
    }
    case "select":
      // Native select: shows the option's label (the shared PropSelect trigger shows the raw value).
      return (
        <select
          className="h-7 w-full rounded-sm border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring [&>option]:bg-popover"
          value={text}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "color":
      return <HexColorField value={text || "#ffffff"} onChange={onChange} />;
    case "registry":
      return <ItemIdField value={text} options={field.suggestions(ctx)} placeholder={field.placeholder} onChange={onChange} />;
    case "texture":
      return (
        <>
          <TextureField value={text} packTextures={packTextures} onPick={() => setPickerOpen(true)} />
          <TexturePickerModal
            open={pickerOpen}
            packTextures={packTextures}
            current={text}
            onSelect={(k) => { onChange(k); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
            onUpload={uploadCustomTexture}
          />
        </>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {field.options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button key={o.value} type="button" aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                className={`h-6 rounded-sm border px-2 text-[11px] transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case "structure":
      return <StructureField value={text} onChange={onChange} />;
    case "list": {
      const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      const set = (i: number, patch: Record<string, unknown>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
      return (
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={i} className="rounded-sm border border-input/70 bg-card p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-medium text-muted-foreground">{field.itemLabel} {i + 1}</span>
                <button type="button" title={`Remove ${field.itemLabel.toLowerCase()}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive hover:text-white">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <FieldGrid fields={field.fields} value={row} ctx={ctx} onChange={(patch) => set(i, patch)} />
            </div>
          ))}
          <Button variant="secondary" size="sm" className="h-7 w-fit gap-1.5 text-xs" onClick={() => onChange([...rows, field.newItem()])}>
            <Plus className="h-3.5 w-3.5" /> Add {field.itemLabel.toLowerCase()}
          </Button>
        </div>
      );
    }
  }
}

/** Side panel: the files this element exports, each expandable to its exact content. */
export function ElementFilesPreview({ def, spec, modId, mcVersion }: { def: ElementKindDef; spec: ElementSpec; modId: string; mcVersion: McVersion }) {
  const [open, setOpen] = useState<string | null>(null);
  const { packTextures } = useTextures();
  // Preview only needs paths — any stored binary (structure .nbt) counts as present.
  const files = def.files(spec, { modId, mcVersion, texture: (k) => (packTextures[k] ? new Blob() : undefined), file: (k) => (k ? new Blob() : undefined) });
  const shared = def.shared?.(spec, { modId, mcVersion });
  const sharedPaths = [
    ...(shared?.lang && Object.keys(shared.lang).length ? [`assets/${modId}/lang/en_us.json`] : []),
    ...Object.keys(shared?.tags ?? {}),
    ...Object.keys(shared?.manifest ?? {}).map((name) => `assets/${modId}/screenspec/elements/${name}.json`),
    ...Object.keys(shared?.atlases ?? {}).map((a) => (a.includes(":") ? `assets/${a.replace(":", "/atlases/")}.json` : `assets/minecraft/atlases/${a}.json`)),
  ];
  const thumb = def.thumb?.(spec);
  return (
    <div className="flex flex-col gap-3 p-3 text-xs">
      {thumb && packTextures[thumb] && (
        <div className="flex aspect-square items-center justify-center rounded-sm bg-[var(--rail)] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={packTextures[thumb]} alt="" className="h-full w-full object-contain" style={{ imageRendering: "pixelated" }} />
        </div>
      )}
      <div className="font-semibold uppercase tracking-wide text-muted-foreground">Exported files</div>
      <ul className="flex flex-col gap-1">
        {files.map((f) => (
          <li key={f.path}>
            <button type="button" onClick={() => setOpen(open === f.path ? null : f.path)}
              className="flex w-full items-start gap-1 text-left font-mono text-[10px] leading-snug text-foreground/90 hover:text-foreground">
              {typeof f.content === "string"
                ? (open === f.path ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />)
                : <FileJson className="h-3 w-3 shrink-0 opacity-50" />}
              <span className="break-all">{f.path}</span>
            </button>
            {open === f.path && typeof f.content === "string" && (
              <pre className="mt-1 max-h-72 overflow-auto rounded-sm bg-[var(--rail)] p-2 font-mono text-[10px] leading-snug">{f.content}</pre>
            )}
          </li>
        ))}
      </ul>
      {sharedPaths.length > 0 && (
        <>
          <div className="font-semibold uppercase tracking-wide text-muted-foreground">Also adds to</div>
          <ul className="flex flex-col gap-0.5 font-mono text-[10px] text-muted-foreground">
            {sharedPaths.map((p) => <li key={p} className="break-all">{p}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
