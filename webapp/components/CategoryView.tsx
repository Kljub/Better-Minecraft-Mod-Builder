"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Plus, Upload, Download, Search, Pencil, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CategoryEntry {
  key: string;
  label: string;
  sublabel?: string;
  thumb?: string;
  active?: boolean;
  /** opens the element's editor; entries without it can't be opened (e.g. creative tabs) */
  onOpen?: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
}

export interface CategoryViewProps {
  title: string;
  icon: LucideIcon;
  entries: CategoryEntry[];
  onNew?: () => void;
  newLabel?: string;
  onImport?: () => void;
  onExportAll?: () => void;
  /** drag-to-reorder (screens) — called with list indices */
  onMove?: (from: number, to: number) => void;
  emptyHint?: string;
}

const DRAG_MIME = "application/x-mc-category-index";

/**
 * MCreator-style element browser for one category (opened from the icon rail):
 * header with New / Import / Export all, tile grid with per-tile actions.
 * Click a tile to open it in its editor.
 */
export default function CategoryView({ title, icon: Icon, entries, onNew, newLabel = "New", onImport, onExportAll, onMove, emptyHint }: CategoryViewProps) {
  const [query, setQuery] = useState("");
  const [dropAt, setDropAt] = useState<number | null>(null);
  const q = query.trim().toLowerCase();
  const shown = entries
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => !q || e.label.toLowerCase().includes(q) || e.sublabel?.toLowerCase().includes(q));
  const canReorder = !!onMove && !q;

  const action = (title: string, icon: React.ReactNode, fn: (() => void) | undefined, danger = false) =>
    fn && (
      <button
        type="button"
        title={title}
        onClick={(ev) => { ev.stopPropagation(); fn(); }}
        className={`flex h-5 w-5 items-center justify-center rounded-sm bg-black/60 text-white ${danger ? "hover:bg-destructive" : "hover:bg-black"}`}
      >
        {icon}
      </button>
    );

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--workspace)]" data-testid="category-view">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{entries.length}</span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="h-7 w-44 pl-7 text-xs" />
        </div>
        {onImport && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onImport} title={`Import ${title}`}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
        )}
        {onExportAll && entries.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onExportAll} title={`Export all ${title}`}>
            <Download className="h-3.5 w-3.5" /> Export all
          </Button>
        )}
        {onNew && (
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onNew} title={`${newLabel} (${title})`}>
            <Plus className="h-3.5 w-3.5" /> {newLabel}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            <Icon className="h-8 w-8 opacity-50" />
            {emptyHint ?? `No ${title.toLowerCase()} yet.`}
            {onNew && (
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={onNew}>
                <Plus className="h-3.5 w-3.5" /> {newLabel}
              </Button>
            )}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-16 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
            {shown.map(({ e, index }) => (
              <div
                key={e.key}
                role={e.onOpen ? "button" : undefined}
                tabIndex={e.onOpen ? 0 : undefined}
                data-entry={e.key}
                title={e.sublabel ? `${e.label} (${e.sublabel})` : e.label}
                onClick={e.onOpen}
                onKeyDown={(ev) => { if (ev.key === "Enter") e.onOpen?.(); }}
                draggable={canReorder}
                onDragStart={(ev) => { ev.dataTransfer.setData(DRAG_MIME, String(index)); ev.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(ev) => { if (canReorder && ev.dataTransfer.types.includes(DRAG_MIME)) { ev.preventDefault(); setDropAt(index); } }}
                onDragLeave={() => setDropAt((d) => (d === index ? null : d))}
                onDrop={(ev) => {
                  const from = Number(ev.dataTransfer.getData(DRAG_MIME));
                  setDropAt(null);
                  if (canReorder && !Number.isNaN(from) && from !== index) { ev.preventDefault(); onMove!(from, index); }
                }}
                className={`group relative flex flex-col items-center gap-1.5 rounded-sm border bg-card p-2 text-center transition-colors ${
                  e.onOpen ? "cursor-pointer" : ""
                } ${dropAt === index ? "border-primary border-dashed" : e.active ? "border-primary" : "border-transparent hover:border-input hover:bg-accent"}`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-[var(--rail)]">
                  {e.thumb
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={e.thumb} alt="" className="h-10 w-10 object-contain" style={{ imageRendering: "pixelated" }} />
                    : <Icon className="h-6 w-6 text-muted-foreground group-hover:text-primary" />}
                </div>
                <span className="w-full truncate text-xs text-foreground">{e.label}</span>
                {e.sublabel && <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground">{e.sublabel}</span>}
                <div className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
                  {action("Rename", <Pencil className="h-3 w-3" />, e.onRename)}
                  {action("Duplicate", <Copy className="h-3 w-3" />, e.onDuplicate)}
                  {action("Export", <Download className="h-3 w-3" />, e.onExport)}
                  {action("Delete", <Trash2 className="h-3 w-3" />, e.onDelete, true)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
