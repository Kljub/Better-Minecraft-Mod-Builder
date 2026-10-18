"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload, FolderPlus, Folder, FolderOpen, Images, Inbox, Search, Pencil, Trash2, Download, Paintbrush, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTextures } from "@/lib/TextureContext";
import { downloadTexture } from "@/lib/textureDownload";
import {
  useResourceFolders, createFolder, renameFolder, deleteFolder, moveToFolder, renameAssignedKey, forgetKey,
} from "@/lib/resourceFolders";

/** Which images the grid shows: everything, the not-yet-filed ones, or one folder. */
type View = { kind: "all" } | { kind: "unsorted" } | { kind: "folder"; name: string };

const DRAG_MIME = "application/x-mc-texture-keys";

const stemOf = (key: string) => key.replace(/^custom\//, "").replace(/\.[^./]+$/, "");

/**
 * MCreator-style Resources tab: upload images (button or drag & drop from the
 * desktop), browse them as a grid, and file them into folders (drag tiles onto
 * a folder, or "Move to"). Works on the custom textures ("custom/…" keys) the
 * Texture Editor and item/block texture pickers already use.
 */
export default function ResourcesPanel({ onEditTexture, onNewTexture }: {
  onEditTexture: (key: string) => void;
  /** opens the Texture Editor on a blank canvas */
  onNewTexture: () => void;
}) {
  const { packTextures, uploadCustomTexture, renameCustomTexture, deleteCustomTexture } = useTextures();
  const { folders, assign } = useResourceFolders();
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ from: string; value: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dims, setDims] = useState<{ key: string; w: number; h: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allKeys = Object.keys(packTextures).filter((k) => k.startsWith("custom/")).sort();
  const folderOf = (k: string): string | null => (assign[k] && folders.includes(assign[k]) ? assign[k] : null);
  const inView = (k: string) =>
    view.kind === "all" ? true : view.kind === "unsorted" ? folderOf(k) === null : folderOf(k) === view.name;
  const q = query.trim().toLowerCase();
  const keys = allKeys.filter((k) => inView(k) && (!q || stemOf(k).toLowerCase().includes(q)));
  const countIn = (folder: string | null) => allKeys.filter((k) => folderOf(k) === folder).length;

  // Drop selections that no longer exist (deleted/renamed elsewhere).
  const liveSelected = selected.filter((k) => packTextures[k]);
  const focusKey = liveSelected.length === 1 ? liveSelected[0] : null;

  useEffect(() => {
    if (!focusKey) return;
    const img = new Image();
    img.onload = () => setDims({ key: focusKey, w: img.naturalWidth, h: img.naturalHeight });
    img.src = packTextures[focusKey];
  }, [focusKey, packTextures]);

  const currentFolder = view.kind === "folder" ? view.name : null;

  const upload = async (files: FileList | File[], folder: string | null) => {
    const list = Array.from(files);
    const images = list.filter((f) => f.type.startsWith("image/"));
    if (images.length < list.length) toast.error(`${list.length - images.length} file(s) skipped — only images can be uploaded.`);
    const added: string[] = [];
    for (const f of images) {
      try { added.push(await uploadCustomTexture(f)); }
      catch (err) { toast.error(`Could not upload ${f.name}: ${err instanceof Error ? err.message : String(err)}`); }
    }
    if (folder && added.length) moveToFolder(added, folder);
    if (added.length) {
      toast.success(`Uploaded ${added.length} image${added.length === 1 ? "" : "s"}${folder ? ` to “${folder}”` : ""}.`);
      setSelected(added);
    }
  };

  const select = (key: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
    } else if (e.shiftKey && liveSelected.length > 0) {
      const a = keys.indexOf(liveSelected[liveSelected.length - 1]);
      const b = keys.indexOf(key);
      if (a >= 0 && b >= 0) setSelected(keys.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else {
      setSelected([key]);
    }
  };

  const renameImage = async (key: string) => {
    const current = stemOf(key);
    const next = window.prompt("Rename image:", current);
    if (!next || !next.trim() || next.trim() === current) return;
    const newKey = await renameCustomTexture(key, next.trim());
    renameAssignedKey(key, newKey);
    setSelected([newKey]);
  };

  const deleteImages = async (targets: string[]) => {
    if (!targets.length) return;
    const label = targets.length === 1 ? `“${stemOf(targets[0])}”` : `${targets.length} images`;
    if (!window.confirm(`Delete ${label}? Items or blocks using ${targets.length === 1 ? "it" : "them"} will lose their texture.`)) return;
    for (const k of targets) { await deleteCustomTexture(k); forgetKey(k); }
    setSelected([]);
  };

  // A folder row (or "Unsorted") as a drop target for dragged tiles and for desktop files.
  const dropProps = (target: string | null, id: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME) && !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDropTarget(id);
    },
    onDragLeave: () => setDropTarget((t) => (t === id ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTarget(null);
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (raw) moveToFolder(JSON.parse(raw) as string[], target);
      else if (e.dataTransfer.files.length) upload(e.dataTransfer.files, target);
    },
  });

  const folderRow = (id: string, label: string, icon: React.ReactNode, count: number, active: boolean, onClick: () => void, target: string | null | undefined, extra?: React.ReactNode) => (
    <div
      key={id}
      role="button"
      tabIndex={0}
      data-folder={id}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      {...(target !== undefined ? dropProps(target, id) : {})}
      className={`group flex h-7 cursor-pointer items-center gap-2 rounded-sm px-2 text-xs ${
        dropTarget === id ? "bg-primary/25 outline outline-1 outline-primary" : active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {extra}
      <span className="tabular-nums opacity-60">{count}</span>
    </div>
  );

  return (
    <div
      className="flex flex-1 overflow-hidden bg-[var(--workspace)]"
      data-testid="resources-panel"
    >
      {/* ── Folder list ── */}
      <aside className="flex w-52 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folders</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 px-0" title="New folder" onClick={() => setNewFolder("")}>
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto p-1.5">
          {folderRow("all", "All images", <Images className="h-3.5 w-3.5 shrink-0" />, allKeys.length, view.kind === "all", () => setView({ kind: "all" }), undefined)}
          {folderRow("unsorted", "Unsorted", <Inbox className="h-3.5 w-3.5 shrink-0" />, countIn(null), view.kind === "unsorted", () => setView({ kind: "unsorted" }), null)}
          {folders.length > 0 && <div className="mx-2 my-1.5 border-t border-input/60" />}
          {folders.map((name) => {
            const active = view.kind === "folder" && view.name === name;
            if (renaming?.from === name) {
              return (
                <Input
                  key={name}
                  autoFocus
                  className="h-7 text-xs"
                  value={renaming.value}
                  onChange={(e) => setRenaming({ from: name, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={() => {
                    if (renaming && renameFolder(name, renaming.value) && active) setView({ kind: "folder", name: renaming.value.trim() });
                    setRenaming(null);
                  }}
                />
              );
            }
            return folderRow(
              `folder:${name}`, name,
              active ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Folder className="h-3.5 w-3.5 shrink-0" />,
              countIn(name), active, () => setView({ kind: "folder", name }), name,
              <span className="hidden items-center gap-0.5 group-hover:flex">
                <button type="button" title="Rename folder" className="rounded-sm p-0.5 hover:bg-accent"
                  onClick={(e) => { e.stopPropagation(); setRenaming({ from: name, value: name }); }}>
                  <Pencil className="h-3 w-3" />
                </button>
                <button type="button" title="Delete folder" className="rounded-sm p-0.5 hover:bg-destructive hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!window.confirm(`Delete folder “${name}”? Its images move to Unsorted.`)) return;
                    deleteFolder(name);
                    if (active) setView({ kind: "all" });
                  }}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>,
            );
          })}
          {newFolder !== null && (
            <Input
              autoFocus
              placeholder="Folder name"
              className="h-7 text-xs"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setNewFolder(null);
              }}
              onBlur={() => {
                const made = newFolder.trim() ? createFolder(newFolder) : null;
                if (newFolder.trim() && !made) toast.error("A folder with that name already exists.");
                if (made) setView({ kind: "folder", name: made });
                setNewFolder(null);
              }}
            />
          )}
        </div>
        <p className="border-t px-3 py-2 text-[10px] leading-snug text-muted-foreground">
          Drag images onto a folder to move them. Folders only organise — texture paths used by items and blocks don&apos;t change.
        </p>
      </aside>

      {/* ── Image grid ── */}
      <div
        className="flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropTarget("grid"); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDropTarget((t) => (t === "grid" ? null : t)); }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDropTarget(null);
          upload(e.dataTransfer.files, currentFolder);
        }}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
          <span className="truncate text-sm font-semibold">
            {view.kind === "all" ? "All images" : view.kind === "unsorted" ? "Unsorted" : view.name}
          </span>
          <span className="text-xs text-muted-foreground">{keys.length}</span>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="h-7 w-44 pl-7 text-xs" />
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onNewTexture} title="Paint a new texture in the Texture Editor">
            <Paintbrush className="h-3.5 w-3.5" /> New texture
          </Button>
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()} title="Upload images">
            <Upload className="h-3.5 w-3.5" /> Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            data-testid="resources-upload-input"
            onChange={(e) => { if (e.target.files) upload(e.target.files, currentFolder); e.target.value = ""; }}
          />
        </div>

        <div
          className={`relative flex-1 overflow-y-auto p-3 ${dropTarget === "grid" ? "outline outline-2 -outline-offset-4 outline-primary" : ""}`}
          onClick={(e) => { if (e.target === e.currentTarget) setSelected([]); }}
        >
          {keys.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
              <Upload className="h-8 w-8 opacity-50" />
              {q ? `No images match “${query}”.` : "No images here yet — drop files here or click Upload."}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2" onClick={(e) => { if (e.target === e.currentTarget) setSelected([]); }}>
              {keys.map((k) => {
                const isSel = liveSelected.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    data-texture-key={k}
                    draggable
                    onDragStart={(e) => {
                      const dragged = isSel ? liveSelected : [k];
                      if (!isSel) setSelected([k]);
                      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragged));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={(e) => select(k, e)}
                    onDoubleClick={() => onEditTexture(k)}
                    title={`${stemOf(k)} — double-click to edit`}
                    className={`flex flex-col items-center gap-1 rounded-sm border bg-card p-1.5 ${isSel ? "border-primary bg-accent" : "border-transparent hover:border-input"}`}
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-sm bg-[var(--rail)] bg-[length:8px_8px] bg-[image:conic-gradient(#3a3a3a_25%,#2e2e2e_0_50%,#3a3a3a_0_75%,#2e2e2e_0)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={packTextures[k]} alt="" draggable={false} className="max-h-14 max-w-14 object-contain" style={{ imageRendering: "pixelated", width: 56, height: 56 }} />
                    </div>
                    <span className="w-full truncate text-[11px]">{stemOf(k)}</span>
                    {view.kind === "all" && folderOf(k) && (
                      <span className="-mt-1 flex w-full items-center justify-center gap-0.5 truncate text-[10px] text-muted-foreground">
                        <Folder className="h-2.5 w-2.5 shrink-0" />{folderOf(k)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Details of the selection ── */}
      {liveSelected.length > 0 && (
        <aside className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-sidebar p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">
              {focusKey ? "Image" : `${liveSelected.length} images`}
            </span>
            <button type="button" title="Clear selection" className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setSelected([])}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {focusKey && (
            <>
              <div className="flex aspect-square items-center justify-center rounded-sm bg-[var(--rail)] bg-[length:12px_12px] bg-[image:conic-gradient(#3a3a3a_25%,#2e2e2e_0_50%,#3a3a3a_0_75%,#2e2e2e_0)] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={packTextures[focusKey]} alt="" className="h-full w-full object-contain" style={{ imageRendering: "pixelated" }} />
              </div>
              <div className="space-y-1">
                <div className="truncate text-sm font-medium text-foreground">{stemOf(focusKey)}</div>
                <div className="truncate font-mono text-[10px] text-muted-foreground" title={focusKey}>{focusKey}</div>
                {dims?.key === focusKey && <div className="text-muted-foreground">{dims.w} × {dims.h} px</div>}
              </div>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Folder</span>
            <select
              className="h-7 rounded-sm border border-input bg-transparent px-1.5 text-xs"
              value={liveSelected.every((k) => folderOf(k) === folderOf(liveSelected[0])) ? (folderOf(liveSelected[0]) ?? "") : "__mixed"}
              onChange={(e) => { if (e.target.value !== "__mixed") moveToFolder(liveSelected, e.target.value || null); }}
              aria-label="Move to folder"
            >
              <option value="__mixed" disabled hidden>— mixed —</option>
              <option value="">Unsorted</option>
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            {focusKey && (
              <>
                <Button variant="secondary" size="sm" className="h-7 justify-start gap-2 text-xs" onClick={() => onEditTexture(focusKey)}>
                  <Paintbrush className="h-3.5 w-3.5" /> Edit in Texture Editor
                </Button>
                <Button variant="secondary" size="sm" className="h-7 justify-start gap-2 text-xs" onClick={() => renameImage(focusKey)}>
                  <Pencil className="h-3.5 w-3.5" /> Rename
                </Button>
                <Button variant="secondary" size="sm" className="h-7 justify-start gap-2 text-xs"
                  onClick={() => downloadTexture({ key: focusKey, url: packTextures[focusKey] })
                    .catch((err) => toast.error(`Could not download: ${err instanceof Error ? err.message : String(err)}`))}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </>
            )}
            <Button variant="destructive" size="sm" className="h-7 justify-start gap-2 text-xs" onClick={() => deleteImages(liveSelected)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete{liveSelected.length > 1 ? ` ${liveSelected.length}` : ""}
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}
