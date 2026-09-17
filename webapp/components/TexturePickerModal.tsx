"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  packTextures: Record<string, string>;
  current: string;
  onSelect: (key: string) => void;
  onClose: () => void;
  /** Uploads a single custom image (not from a resource pack) and returns its new pack key. */
  onUpload?: (file: File) => Promise<string>;
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

type FolderNode = { [name: string]: FolderNode };

function buildTree(keys: string[]): FolderNode {
  const root: FolderNode = {};
  for (const key of keys) {
    const parts = key.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] ??= {};
      node = node[parts[i]];
    }
  }
  return root;
}

function filesUnder(prefix: string, keys: string[]): string[] {
  const p = prefix ? prefix + "/" : "";
  return keys.filter((k) => k.startsWith(p));
}

// ── FolderTree ────────────────────────────────────────────────────────────────

function FolderTree({
  node,
  prefix,
  selected,
  onSelect,
}: {
  node: FolderNode;
  prefix: string;
  selected: string;
  onSelect: (path: string) => void;
}) {
  const names = Object.keys(node).sort();
  return (
    <ul className="pl-3 border-l border-gray-200 dark:border-gray-700">
      {names.map((name) => {
        const path = prefix ? `${prefix}/${name}` : name;
        const hasChildren = Object.keys(node[name]).length > 0;
        return (
          <FolderItem
            key={name}
            name={name}
            path={path}
            node={node[name]}
            selected={selected}
            hasChildren={hasChildren}
            onSelect={onSelect}
          />
        );
      })}
    </ul>
  );
}

function FolderItem({
  name, path, node, selected, hasChildren, onSelect,
}: {
  name: string; path: string; node: FolderNode;
  selected: string; hasChildren: boolean;
  onSelect: (path: string) => void;
}) {
  const isSelected = selected === path;
  const isAncestor = selected.startsWith(path + "/");
  const [open, setOpen] = useState(isAncestor || isSelected);

  return (
    <li className="my-0.5">
      <div className="flex items-center gap-1">
        <button
          className="w-4 shrink-0 text-gray-400 hover:text-gray-600"
          onClick={() => setOpen((v) => !v)}
        >
          {hasChildren ? (open ? "▾" : "▸") : " "}
        </button>
        <button
          onClick={() => { onSelect(path); setOpen(true); }}
          className={[
            "flex-1 text-left text-xs px-1.5 py-0.5 rounded truncate",
            isSelected
              ? "bg-blue-500 text-white"
              : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200",
          ].join(" ")}
        >
          {name}
        </button>
      </div>
      {hasChildren && open && (
        <FolderTree node={node} prefix={path} selected={selected} onSelect={onSelect} />
      )}
    </li>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function TexturePickerModal({ open, packTextures, current, onSelect, onClose, onUpload }: Props) {
  const [filter, setFilter] = useState("");
  const [folder, setFolder] = useState("");
  const [selected, setSelected] = useState(current);
  const searchRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(current);
      setFilter("");
      // Pre-select the folder of the current texture
      const parts = current.split("/");
      setFolder(parts.length > 1 ? parts.slice(0, -1).join("/") : "");
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, current]);

  const allKeys = useMemo(() => Object.keys(packTextures).sort(), [packTextures]);
  const tree = useMemo(() => buildTree(allKeys), [allKeys]);

  const searching = filter.length > 0;
  const visibleKeys = searching
    ? allKeys.filter((k) => k.toLowerCase().includes(filter.toLowerCase()))
    : folder
      ? filesUnder(folder, allKeys)
      : allKeys;

  const preview = selected;

  // ── Resizable columns ──
  const [treeW, setTreeW] = useState(256);
  const [previewW, setPreviewW] = useState(256);

  const makeDividerHandler = useCallback((
    setter: (w: number) => void,
    side: "left" | "right",
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === "left" ? treeW : previewW;
    const onMove = (mv: MouseEvent) => {
      const delta = side === "left" ? mv.clientX - startX : startX - mv.clientX;
      setter(Math.max(160, Math.min(520, startW + delta)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [treeW, previewW]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[90vw] max-w-7xl h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 shrink-0 border-b">
          <DialogTitle>Pick texture</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 select-none">

          {/* ── Left: folder tree ── */}
          <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: treeW }}>
            <div className="p-2 border-b shrink-0 flex flex-col gap-1.5">
              <Input
                ref={searchRef}
                placeholder="Search…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-7 text-xs"
              />
              {onUpload && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={uploading}
                    onClick={() => uploadRef.current?.click()}
                  >
                    {uploading ? "Uploading…" : "Upload image…"}
                  </Button>
                  <input
                    ref={uploadRef}
                    type="file"
                    accept=".png,image/png"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setUploading(true);
                      try {
                        const key = await onUpload(file);
                        setSelected(key);
                        setFilter("");
                        const parts = key.split("/");
                        setFolder(parts.length > 1 ? parts.slice(0, -1).join("/") : "");
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </>
              )}
            </div>
            {!searching && (
              <div className="flex-1 overflow-y-auto p-2 text-xs">
                <button
                  onClick={() => setFolder("")}
                  className={[
                    "w-full text-left px-2 py-1 rounded mb-1",
                    folder === "" ? "bg-blue-500 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-800",
                  ].join(" ")}
                >
                  All textures
                </button>
                <FolderTree node={tree} prefix="" selected={folder} onSelect={setFolder} />
              </div>
            )}
            {searching && (
              <div className="p-2 text-xs text-muted-foreground">{visibleKeys.length} results</div>
            )}
          </div>

          {/* ── Divider 1 ── */}
          <div
            className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-blue-400 transition-colors"
            onMouseDown={makeDividerHandler(setTreeW, "left")}
          />

          {/* ── Middle: texture grid ── */}
          <div className="flex-1 min-w-0 overflow-y-auto p-3">
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
            >
              {visibleKeys.map((key) => {
                const isSelected = key === selected;
                return (
                  <button
                    key={key}
                    title={key}
                    onClick={() => setSelected(key)}
                    className={[
                      "flex flex-col items-center gap-1 rounded-lg p-1.5 border-2 transition-colors",
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                        : "border-transparent hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800",
                    ].join(" ")}
                  >
                    <div className="w-20 h-20 flex items-center justify-center bg-[#555] rounded overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={packTextures[key]}
                        alt=""
                        className="max-w-full max-h-full"
                        style={{ imageRendering: "pixelated" }}
                      />
                    </div>
                    <span className="text-[9px] leading-tight text-muted-foreground truncate w-full text-center">
                      {key.split("/").pop()}
                    </span>
                  </button>
                );
              })}
              {visibleKeys.length === 0 && (
                <p className="col-span-full text-xs text-muted-foreground text-center py-12">
                  {searching ? "No textures match" : "Empty folder"}
                </p>
              )}
            </div>
          </div>

          {/* ── Divider 2 ── */}
          <div
            className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-blue-400 transition-colors"
            onMouseDown={makeDividerHandler(setPreviewW, "right")}
          />

          {/* ── Right: preview + confirm ── */}
          <div className="shrink-0 flex flex-col gap-3 p-4" style={{ width: previewW }}>
            <div
              className="flex-1 flex items-center justify-center bg-[#555] rounded min-h-0"
              style={{ minHeight: 120 }}
            >
              {preview && packTextures[preview] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={packTextures[preview]}
                  alt=""
                  style={{ width: "90%", height: "90%", objectFit: "contain", imageRendering: "pixelated" }}
                />
              ) : (
                <span className="text-xs text-gray-400 text-center px-2">select a texture to preview</span>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground break-all leading-tight shrink-0">
              {preview || "—"}
            </p>

            <div className="flex flex-col gap-2 shrink-0">
              <Button
                size="sm"
                disabled={!selected}
                onClick={() => { onSelect(selected); onClose(); }}
              >
                Select
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
