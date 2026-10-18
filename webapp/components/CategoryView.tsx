"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Plus, Upload, Download, Search, Pencil, Copy, Trash2, Folder, FolderOpen, FolderPlus, FolderInput, Inbox, LayoutGrid, Check, X } from "lucide-react";
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

/** Optional folders for organizing a category's elements (stored in the project). */
export interface CategoryFolders {
  list: string[];
  /** folder of entries[i]; null = not in a folder */
  of: (entryIndex: number) => string | null;
  /** false if the name is empty or taken */
  create: (name: string) => boolean;
  rename: (from: string, to: string) => boolean;
  /** the folder's elements move back to "No folder" */
  remove: (name: string) => void;
  moveTo: (entryIndices: number[], folder: string | null) => void;
}

export interface CategoryViewProps {
  title: string;
  icon: LucideIcon;
  entries: CategoryEntry[];
  /** called with the folder currently shown, so a new element lands in it */
  onNew?: (folder?: string | null) => void;
  newLabel?: string;
  onImport?: () => void;
  onExportAll?: () => void;
  /** drag-to-reorder (screens) — called with list indices */
  onMove?: (from: number, to: number) => void;
  emptyHint?: string;
  folders?: CategoryFolders;
}

type FolderView = { kind: "all" } | { kind: "none" } | { kind: "folder"; name: string };

const DRAG_MIME = "application/x-mc-category-index";

/**
 * MCreator-style element browser for one category (opened from the icon rail):
 * header with New / Import / Export all, tile grid with per-tile actions.
 * Click a tile to open it in its editor.
 */
export default function CategoryView({ title, icon: Icon, entries, onNew, newLabel = "New", onImport, onExportAll, onMove, emptyHint, folders }: CategoryViewProps) {
  const [query, setQuery] = useState("");
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [view, setView] = useState<FolderView>({ kind: "all" });
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null);
  /** open "Move to" menu: entry index + viewport position under its button */
  const [moveMenuAt, setMoveMenuAt] = useState<{ index: number; left: number; top: number } | null>(null);
  const moveMenu = moveMenuAt?.index ?? null;
  const setMoveMenu = (v: null) => setMoveMenuAt(v);
  useEffect(() => {
    if (moveMenu === null) return;
    const close = (ev: Event) => { if (!(ev.target as Element).closest?.('[data-testid="move-to-folder-menu"]')) setMoveMenu(null); };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") setMoveMenu(null); };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", close, true); window.removeEventListener("keydown", key); };
  }, [moveMenu]);
  const q = query.trim().toLowerCase();
  // A deleted/renamed folder that's still selected falls back to "All".
  const activeView: FolderView = view.kind === "folder" && !folders?.list.includes(view.name) ? { kind: "all" } : view;
  const inView = (index: number) =>
    !folders || activeView.kind === "all" ? true
      : activeView.kind === "none" ? folders.of(index) === null : folders.of(index) === activeView.name;
  const shown = entries
    .map((e, index) => ({ e, index }))
    .filter(({ index }) => inView(index))
    .filter(({ e }) => !q || e.label.toLowerCase().includes(q) || e.sublabel?.toLowerCase().includes(q));
  const canReorder = !!onMove && !q;
  const currentFolder = activeView.kind === "folder" ? activeView.name : activeView.kind === "none" ? null : undefined;
  const countIn = (folder: string | null) => entries.filter((_, i) => folders?.of(i) === folder).length;

  // Folder rows are drop targets for dragged tiles (key "" = No folder).
  const folderRow = (key: string, label: string, icon: React.ReactNode, count: number, active: boolean, onClick: () => void,
    target: string | null | undefined, extra?: React.ReactNode) => (
    <div
      key={key}
      data-folder={key}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(ev) => { if (ev.key === "Enter") onClick(); }}
      onDragOver={(ev) => { if (target !== undefined && ev.dataTransfer.types.includes(DRAG_MIME)) { ev.preventDefault(); setDropFolder(key); } }}
      onDragLeave={() => setDropFolder((d) => (d === key ? null : d))}
      onDrop={(ev) => {
        setDropFolder(null);
        const from = Number(ev.dataTransfer.getData(DRAG_MIME));
        if (target !== undefined && folders && !Number.isNaN(from)) { ev.preventDefault(); folders.moveTo([from], target); }
      }}
      className={`group/folder flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-2 text-xs ${
        dropFolder === key ? "bg-primary/20 ring-1 ring-primary" : active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {extra}
      <span className="text-[10px] opacity-70">{count}</span>
    </div>
  );

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
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onNew(currentFolder)} title={`${newLabel} (${title})${currentFolder ? ` in “${currentFolder}”` : ""}`}>
            <Plus className="h-3.5 w-3.5" /> {newLabel}
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
      {folders && (
        <div className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-sidebar p-1.5" data-testid="category-folders">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Folders</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 px-0" title="New folder" onClick={() => setNewFolder("")}>
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {folderRow("all", `All ${title.toLowerCase()}`, <LayoutGrid className="h-3.5 w-3.5 shrink-0" />, entries.length, activeView.kind === "all", () => setView({ kind: "all" }), undefined)}
          {folderRow("", "No folder", <Inbox className="h-3.5 w-3.5 shrink-0" />, countIn(null), activeView.kind === "none", () => setView({ kind: "none" }), null)}
          {folders.list.length > 0 && <div className="mx-2 my-1 border-t border-input/60" />}
          {folders.list.map((name) => {
            const active = activeView.kind === "folder" && activeView.name === name;
            if (renaming?.from === name) {
              return (
                <form
                  key={`f:${name}`}
                  className="flex items-center gap-1 px-1"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    const to = renaming.value.trim();
                    if (to && folders.rename(name, to) && active) setView({ kind: "folder", name: to });
                    setRenaming(null);
                  }}
                >
                  <Input autoFocus value={renaming.value} onChange={(ev) => setRenaming({ from: name, value: ev.target.value })}
                    onKeyDown={(ev) => { if (ev.key === "Escape") setRenaming(null); }} className="h-6 px-1 text-xs" aria-label="Folder name" />
                  <button type="submit" title="Save" className="rounded-sm p-0.5 hover:bg-accent"><Check className="h-3 w-3" /></button>
                </form>
              );
            }
            return folderRow(
              `f:${name}`, name,
              active ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Folder className="h-3.5 w-3.5 shrink-0" />,
              countIn(name), active, () => setView({ kind: "folder", name }), name,
              <span className="hidden items-center gap-0.5 group-hover/folder:flex">
                <button type="button" title="Rename folder" className="rounded-sm p-0.5 hover:bg-background"
                  onClick={(ev) => { ev.stopPropagation(); setRenaming({ from: name, value: name }); }}>
                  <Pencil className="h-3 w-3" />
                </button>
                <button type="button" title="Delete folder" className="rounded-sm p-0.5 hover:bg-destructive hover:text-white"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (window.confirm(`Delete folder “${name}”? Its ${title.toLowerCase()} move to “No folder” — nothing is deleted.`)) folders.remove(name);
                  }}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>,
            );
          })}
          {newFolder !== null && (
            <form
              className="flex items-center gap-1 px-1 pt-1"
              onSubmit={(ev) => {
                ev.preventDefault();
                const name = newFolder.trim();
                if (name && folders.create(name)) setView({ kind: "folder", name });
                setNewFolder(null);
              }}
            >
              <Input autoFocus value={newFolder} onChange={(ev) => setNewFolder(ev.target.value)} placeholder="Folder name"
                onKeyDown={(ev) => { if (ev.key === "Escape") setNewFolder(null); }} className="h-6 px-1 text-xs" aria-label="New folder name" />
              <button type="submit" title="Create" className="rounded-sm p-0.5 hover:bg-accent"><Check className="h-3 w-3" /></button>
              <button type="button" title="Cancel" className="rounded-sm p-0.5 hover:bg-accent" onClick={() => setNewFolder(null)}><X className="h-3 w-3" /></button>
            </form>
          )}
          <p className="mt-auto px-1 pt-2 text-[10px] leading-snug text-muted-foreground">Drag tiles onto a folder, or use the folder button on a tile.</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
            <Icon className="h-8 w-8 opacity-50" />
            {emptyHint ?? `No ${title.toLowerCase()} yet.`}
            {onNew && (
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onNew(currentFolder)}>
                <Plus className="h-3.5 w-3.5" /> {newLabel}
              </Button>
            )}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-16 text-center text-sm text-muted-foreground">
            {q ? <>Nothing matches “{query}”.</> : activeView.kind === "folder" ? <>“{activeView.name}” is empty — drag {title.toLowerCase()} here.</> : "Everything is in a folder."}
          </div>
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
                draggable={canReorder || !!folders}
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
                  {folders && (
                    <button
                      type="button"
                      title="Move to folder"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (moveMenu === index) { setMoveMenu(null); return; }
                        const r = ev.currentTarget.getBoundingClientRect();
                        // fixed position so the scrolling grid can't clip it; kept inside the window
                        setMoveMenuAt({ index, left: Math.min(r.left, window.innerWidth - 168), top: r.bottom + 4 });
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-sm bg-black/60 text-white hover:bg-black"
                    >
                      <FolderInput className="h-3 w-3" />
                    </button>
                  )}
                  {action("Delete", <Trash2 className="h-3 w-3" />, e.onDelete, true)}
                </div>
                {folders && moveMenuAt?.index === index && (
                  <div
                    role="menu"
                    data-testid="move-to-folder-menu"
                    onClick={(ev) => ev.stopPropagation()}
                    style={{ left: moveMenuAt.left, top: moveMenuAt.top }}
                    className="fixed z-50 w-40 rounded-md border bg-popover p-1 text-left shadow-lg"
                  >
                    <div className="px-2 pb-1 pt-0.5 text-[10px] text-muted-foreground">Move to</div>
                    {[null, ...folders.list].map((f) => {
                      const current = folders.of(index) === f;
                      return (
                        <button
                          key={f ?? ""}
                          type="button"
                          role="menuitem"
                          disabled={current}
                          onClick={() => { folders.moveTo([index], f); setMoveMenu(null); }}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-xs enabled:hover:bg-accent disabled:opacity-50"
                        >
                          {f === null ? <Inbox className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                          <span className="truncate">{f ?? "No folder"}</span>
                          {current && <Check className="ml-auto h-3 w-3" />}
                        </button>
                      );
                    })}
                    {folders.list.length === 0 && <div className="px-2 py-1 text-[11px] text-muted-foreground">No folders yet — create one on the left.</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
