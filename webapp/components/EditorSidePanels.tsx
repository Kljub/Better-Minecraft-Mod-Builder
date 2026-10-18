"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, ChevronRight, LayoutTemplate, Pencil, Trash2, SlidersHorizontal, SavePlus } from "lucide-react";
import LayersTree from "@/components/LayersTree";
import type { AttributePreset } from "@/lib/attributePresets";

/**
 * Collapsible sections for the editor's right-hand column — what used to live
 * in the (now removed) text sidebar: the screen's Layers tree, templates for
 * the open document, and item attribute presets. All act on the document
 * that's currently open in the editor.
 */
function Section({ title, defaultOpen = true, action, children, className = "" }: {
  title: string;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    // `relative` + a 40px header: LayersTree's top-level "Add widget" button is absolutely
    // positioned (sidebar group-action style) to sit in this header row.
    <section className={`relative flex min-h-0 flex-col border-b ${className}`}>
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {title}
        </button>
        {action}
      </div>
      {open && <div className="min-h-0 overflow-y-auto px-1 pb-2">{children}</div>}
    </section>
  );
}

export function LayersSection(props: ComponentProps<typeof LayersTree>) {
  return (
    <Section title="Layers" className="max-h-[45%]">
      <LayersTree {...props} />
    </Section>
  );
}

const rowActionCls = "flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground";

function NamedRows<T extends { id: string; name: string }>({ rows, icon, onPick, pickTitle, onRename, onDelete, empty }: {
  rows: T[];
  icon: ReactNode;
  onPick: (id: string) => void;
  pickTitle: string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  empty: string;
}) {
  if (rows.length === 0) return <div className="px-2 py-1 text-xs text-muted-foreground">{empty}</div>;
  return (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <li key={r.id} className="group flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs hover:bg-sidebar-accent">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title={pickTitle} onClick={() => onPick(r.id)}>
            {icon}
            <span className="truncate">{r.name}</span>
          </button>
          <span className="hidden items-center gap-0.5 group-hover:flex">
            <button type="button" title="Rename" className={rowActionCls}
              onClick={() => { const next = window.prompt("Rename:", r.name); if (next && next.trim() && next.trim() !== r.name) onRename(r.id, next.trim()); }}>
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" title="Delete" className={rowActionCls} onClick={() => onDelete(r.id)}>
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TemplatesSection({ docLabel, templates, onSave, onInsert, onRename, onDelete }: {
  docLabel: string;
  templates: { id: string; name: string }[];
  onSave: () => void;
  onInsert: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Section
      title="Templates"
      defaultOpen={false}
      action={
        <button type="button" title={`Save current ${docLabel} as template`} className={rowActionCls} onClick={onSave}>
          <SavePlus className="h-3.5 w-3.5" />
        </button>
      }
    >
      <NamedRows
        rows={templates}
        icon={<LayoutTemplate className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        onPick={onInsert}
        pickTitle={`Insert as new ${docLabel}`}
        onRename={onRename}
        onDelete={onDelete}
        empty={`No templates yet — save the current ${docLabel} to start one.`}
      />
    </Section>
  );
}

export function AttributePresetsSection({ presets, onSave, onApply, onRename, onDelete }: {
  presets: AttributePreset[];
  onSave: () => void;
  onApply: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Section
      title="Attribute Presets"
      defaultOpen={false}
      action={
        <button type="button" title="Save this item's attributes as a preset" className={rowActionCls} onClick={onSave}>
          <SavePlus className="h-3.5 w-3.5" />
        </button>
      }
    >
      <NamedRows
        rows={presets}
        icon={<SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        onPick={onApply}
        pickTitle="Add these attributes to the current item"
        onRename={onRename}
        onDelete={onDelete}
        empty="No presets yet — save this item's attributes to start one."
      />
    </Section>
  );
}
