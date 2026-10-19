"use client";

import { Plus, X } from "lucide-react";
import { PropSelect } from "@/components/SchemaFields";
import { CREATIVE_TAB_LABELS, CREATIVE_TAB_OPTIONS } from "@/lib/itemRegistry";
import type { CreativeTabSpec } from "@/lib/types";

/**
 * Where an item/block/armor shows up in the creative inventory: a main tab ("none" = nowhere,
 * only /give) plus any number of further tabs.
 */
export default function CreativeTabsField({ value, extra, creativeTabs, onChange }: {
  value: string;
  extra: string[] | undefined;
  creativeTabs: CreativeTabSpec[];
  onChange: (patch: { creativeTab?: string; extraCreativeTabs?: string[] }) => void;
}) {
  const options = [...CREATIVE_TAB_OPTIONS, ...creativeTabs.map((t) => t.id)];
  const labels: Record<string, string> = { ...CREATIVE_TAB_LABELS, ...Object.fromEntries(creativeTabs.map((t) => [t.id, t.displayName])) };
  const more = (extra ?? []).filter((t) => t && t !== value && t !== "none");
  const addable = options.filter((t) => t !== "none" && t !== value && !more.includes(t));
  return (
    <div className="flex flex-col gap-1" data-testid="creative-tabs-field">
      <PropSelect value={value || "custom"} options={options} labels={labels}
        onChange={(v) => onChange(v === "none" ? { creativeTab: v, extraCreativeTabs: [] } : { creativeTab: v, extraCreativeTabs: more.filter((t) => t !== v) })} />
      {value !== "none" && (
        <div className="flex flex-wrap items-center gap-1">
          {more.map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 rounded-sm border border-input bg-accent/40 px-1 text-[10px]">
              {labels[t] ?? t}
              <button type="button" title={`Remove from ${labels[t] ?? t}`} className="rounded-sm hover:text-destructive"
                onClick={() => onChange({ extraCreativeTabs: more.filter((x) => x !== t) })}>
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {addable.length > 0 && (
            <label className="relative inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
              <Plus className="h-3 w-3" /> also in tab…
              <select aria-label="Also show in tab" className="absolute inset-0 cursor-pointer opacity-0" value=""
                onChange={(e) => { if (e.target.value) onChange({ extraCreativeTabs: [...more, e.target.value] }); }}>
                <option value="" disabled>Add tab…</option>
                {addable.map((t) => <option key={t} value={t}>{labels[t] ?? t}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
