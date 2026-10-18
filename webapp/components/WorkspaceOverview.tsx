"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Search, SquareArrowOutUpRight, Pencil, Copy, Download, Clipboard, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { copyToClipboard } from "@/lib/utils";

export interface WorkspaceEntry {
  /** stable React key, unique across all sections */
  key: string;
  label: string;
  /** shown under the label when it differs (e.g. the registry id under a display name) */
  sublabel?: string;
  /** image URL for the tile (item/block texture etc.); falls back to the section icon */
  thumb?: string;
  active?: boolean;
  /** opens the element in its editor; tiles without it are display-only */
  onOpen?: () => void;
  /** right-click menu actions — same handlers as the category browser's tile buttons */
  onRename?: () => void;
  onDuplicate?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
}

export interface WorkspaceSection {
  key: string;
  label: string;
  icon: LucideIcon;
  entries: WorkspaceEntry[];
}

/**
 * MCreator-style "workspace" view: every element in the project as a tile grid,
 * filterable by type and searchable by name/id. Opened from the sidebar rail's
 * "All categories" entry.
 */
export default function WorkspaceOverview({ sections }: { sections: WorkspaceSection[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; entry: WorkspaceEntry; section: string } | null>(null);
  const q = query.trim().toLowerCase();
  const total = sections.reduce((n, s) => n + s.entries.length, 0);

  const visible = sections
    .filter((s) => filter === null || s.key === filter)
    .map((s) => ({
      ...s,
      entries: q
        ? s.entries.filter((e) => e.label.toLowerCase().includes(q) || e.sublabel?.toLowerCase().includes(q))
        : s.entries,
    }))
    .filter((s) => s.entries.length > 0);

  const chip = (key: string | null, label: string, count: number) => {
    const active = filter === key;
    return (
      <button
        key={key ?? "all"}
        type="button"
        onClick={() => setFilter(key)}
        className={`flex h-6 items-center gap-1.5 rounded-sm border px-2 text-xs transition-colors ${
          active ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        {label}
        <span className={active ? "opacity-70" : "opacity-60"}>{count}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[var(--workspace)]" data-testid="workspace-overview">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-sidebar px-3 py-2">
        <div className="relative mr-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search elements…"
            className="h-7 w-52 pl-7 text-xs"
          />
        </div>
        {chip(null, "All", total)}
        {sections.filter((s) => s.entries.length > 0).map((s) => chip(s.key, s.label, s.entries.length))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {total === 0 ? (
          <div className="mt-16 text-center text-sm text-muted-foreground">
            This project is empty — add screens, items, blocks … from the sidebar.
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-16 text-center text-sm text-muted-foreground">No elements match “{query}”.</div>
        ) : (
          visible.map(({ key, label, icon: Icon, entries }) => (
            <section key={key} className="mb-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {label}
                <span className="font-normal opacity-70">({entries.length})</span>
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
                {entries.map((e) => (
                  <button
                    key={e.key}
                    type="button"
                    disabled={!e.onOpen}
                    onClick={e.onOpen}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      setMenu({ x: ev.clientX, y: ev.clientY, entry: e, section: label });
                    }}
                    title={e.sublabel ? `${e.label} (${e.sublabel})` : e.label}
                    className={`group flex flex-col items-center gap-1.5 rounded-sm border bg-card p-2 text-center transition-colors disabled:cursor-default ${
                      e.active ? "border-primary" : "border-transparent enabled:hover:border-input enabled:hover:bg-accent"
                    }`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-[var(--rail)]">
                      {e.thumb
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={e.thumb} alt="" className="h-10 w-10 object-contain" style={{ imageRendering: "pixelated" }} />
                        : <Icon className="h-6 w-6 text-muted-foreground group-enabled:group-hover:text-primary" />}
                    </div>
                    <span className="w-full truncate text-xs text-foreground">{e.label}</span>
                    {e.sublabel && <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground">{e.sublabel}</span>}
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      {menu && <EntryContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** Right-click menu for a workspace tile — header with the element's name, icon rows, separators,
 * the destructive action last in red; actions the element doesn't support are shown disabled. */
function EntryContextMenu({ x, y, entry, section, onClose }: {
  x: number; y: number; entry: WorkspaceEntry; section: string; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the menu on screen (flip left/up near the window edges).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, y + height > window.innerHeight - 4 ? y - height : y),
    });
  }, [x, y]);

  useEffect(() => {
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("contextmenu", close, true);
    window.addEventListener("wheel", onClose, { passive: true });
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("contextmenu", close, true);
      window.removeEventListener("wheel", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const id = entry.sublabel ?? entry.label;
  const item = (label: string, Icon: LucideIcon, action: (() => void) | undefined, danger = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={!action}
      onClick={() => { onClose(); action?.(); }}
      className={`flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[13px] disabled:cursor-default disabled:opacity-40 ${
        danger ? "text-destructive enabled:hover:bg-destructive/15" : "text-foreground enabled:hover:bg-accent"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      {label}
    </button>
  );
  const sep = <div className="my-1 h-px bg-border" />;

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="workspace-context-menu"
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="truncate px-2 pb-1 pt-1 text-xs text-muted-foreground" title={`${section} · ${entry.label}`}>
        {section} · {entry.label}
      </div>
      {item("Open", SquareArrowOutUpRight, entry.onOpen)}
      {item("Rename", Pencil, entry.onRename)}
      {item("Duplicate", Copy, entry.onDuplicate)}
      {sep}
      {item("Export", Download, entry.onExport)}
      {item("Copy ID", Clipboard, () => { copyToClipboard(id).catch(() => {}); })}
      {sep}
      {item("Delete", Trash2, entry.onDelete, true)}
    </div>
  );
}
