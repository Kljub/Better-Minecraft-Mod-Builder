"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TexturePickerModal from "@/components/TexturePickerModal";
import { useTextures } from "@/lib/TextureContext";
import { Field, NumInput } from "@/components/SchemaFields";
import {
  Eraser, Paintbrush, Trash2, ImageDown, Droplet, ArrowLeft,
  Slash, Square, Circle, PaintBucket, Plus, Eye, EyeOff, ChevronUp, ChevronDown, Undo2, Redo2, Upload,
  MousePointer2, Check, Wand2,
} from "lucide-react";

const MIN_SIZE = 16;
const MAX_SIZE = 256;

function clampSize(n: number): number {
  if (!Number.isFinite(n)) return MIN_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));
}

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16) || 0, parseInt(clean.slice(2, 4), 16) || 0, parseInt(clean.slice(4, 6), 16) || 0, 255];
}

type Tool = "paint" | "erase" | "line" | "rect" | "ellipse" | "fill" | "bgremove" | "select";
type Cell = [number, number];
interface SelRect { x: number; y: number; w: number; h: number; }
type SelHandle = "nw" | "ne" | "sw" | "se";
interface SelDrag { mode: "create" | "move" | "resize"; handle?: SelHandle; startCell: Cell; startSel: SelRect; }

function lineCells(x0: number, y0: number, x1: number, y1: number): Cell[] {
  const cells: Cell[] = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (let guard = 0; guard < 100000; guard++) {
    cells.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return cells;
}

function rectCells(x0: number, y0: number, x1: number, y1: number, filled: boolean): Cell[] {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  const cells: Cell[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (filled || x === minX || x === maxX || y === minY || y === maxY) cells.push([x, y]);
    }
  }
  return cells;
}

function ellipseCells(x0: number, y0: number, x1: number, y1: number, filled: boolean): Cell[] {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const rx = Math.max(0.5, (maxX - minX) / 2), ry = Math.max(0.5, (maxY - minY) / 2);
  const innerRx = rx - 1, innerRy = ry - 1;
  const cells: Cell[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      if (filled) { cells.push([x, y]); continue; }
      const insideInner = innerRx > 0.4 && innerRy > 0.4 &&
        ((x + 0.5 - cx) / innerRx) ** 2 + ((y + 0.5 - cy) / innerRy) ** 2 <= 1;
      if (!insideInner) cells.push([x, y]);
    }
  }
  return cells;
}

function floodFillLayer(canvas: HTMLCanvasElement, startX: number, startY: number, hex: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const si = idx(startX, startY);
  const target: [number, number, number, number] = [data[si], data[si + 1], data[si + 2], data[si + 3]];
  // Transparent pixels can carry arbitrary leftover RGB (imported PNGs, undo/redo restores, etc)
  // that's invisible but would otherwise fracture "the same transparent area" into non-matching
  // islands — so when the clicked pixel is transparent, match on alpha alone (ignore RGB) instead
  // of the usual exact 4-channel match.
  const targetTransparent = target[3] === 0;
  const [fr, fg, fb, fa] = hexToRgba(hex);
  if (!targetTransparent && target[0] === fr && target[1] === fg && target[2] === fb && target[3] === fa) return;
  const stack: Cell[] = [[startX, startY]];
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = idx(x, y);
    const matches = targetTransparent
      ? data[i + 3] === 0
      : data[i] === target[0] && data[i + 1] === target[1] && data[i + 2] === target[2] && data[i + 3] === target[3];
    if (!matches) continue;
    data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = fa;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  ctx.putImageData(img, 0, 0);
}

/** "Remove background" tool — click a pixel and every pixel *anywhere* on this layer within
 * `tolerancePct` of that color (not just the contiguous blob flood-fill would take) turns
 * transparent. Unlike flood fill this is a global color-key, so it also clears the same background
 * color behind separate design elements (e.g. between a character's legs) in one click. Tolerance
 * is a plain per-channel distance so near-identical anti-aliased edge pixels go too, at 0% it's an
 * exact-color match. */
function removeBackgroundColor(canvas: HTMLCanvasElement, startX: number, startY: number, tolerancePct: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const si = (startY * w + startX) * 4;
  const tr = data[si], tg = data[si + 1], tb = data[si + 2], ta = data[si + 3];
  if (ta === 0) return; // clicked an already-transparent pixel — nothing to key off of
  const thresh = Math.round((tolerancePct / 100) * 255);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (Math.abs(data[i] - tr) <= thresh && Math.abs(data[i + 1] - tg) <= thresh && Math.abs(data[i + 2] - tb) <= thresh) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}

let layerSeq = 0;
interface LayerMeta { id: string; name: string; visible: boolean; }
function newLayerMeta(name: string): LayerMeta {
  return { id: `layer_${++layerSeq}`, name, visible: true };
}

interface Snapshot {
  width: number; height: number; layers: LayerMeta[]; activeLayerIdx: number;
  images: Record<string, ImageData>;
}

interface Props {
  /** Suggested filename stem, e.g. the item/block id — sanitized and suffixed with .png. */
  suggestedName: string;
  /** Uploads the finished PNG (same pipeline as TexturePickerModal's file upload) and returns its pack key. */
  onUpload: (file: File) => Promise<string>;
  onSave: (key: string) => void;
  /** Present only when opened from an item/block's texture field ("paint a new texture") — shows
   * a Back button and labels Save as "Save & use here". Absent when opened as its own workspace
   * from the Sidebar, where it just keeps painting after each save. */
  onBack?: () => void;
  /** Present when reopened from the "My Textures" sidebar gallery for further editing — that
   * existing pack texture is loaded onto the canvas on mount (same as "Use existing as template"). */
  initialTextureKey?: string;
}

/**
 * Inline pixel-art / shape editor for painting a texture from scratch — a full workspace view
 * (like the Screen designer's canvas), not a popup. The canvas area fills whatever space is
 * available (measured via ResizeObserver) rather than a fixed size. Supports multiple stacked
 * layers (a flat list, index 0 = bottom) and shape tools (paint, erase, line, rectangle, ellipse,
 * bucket fill) beyond single-pixel painting — MCreator's texture maker has the same basic tool
 * set. Exports a plain flattened PNG at exactly the chosen width x height — pixel (0,0) is the
 * top-left corner, rows run left-to-right then top-to-bottom (standard raster/canvas order),
 * exactly how Minecraft itself reads texture PNGs — no conversion needed. Saved through the same
 * uploadCustomTexture path as a manually uploaded file, so it slots into the existing
 * pack-texture picker/export pipeline unchanged.
 */
export default function TextureEditorPanel({ suggestedName, onUpload, onSave, onBack, initialTextureKey }: Props) {
  const { packTextures } = useTextures();
  // Editable filename — defaults to the suggested name but the user can override it; there was no
  // way to type a name at all before (Save always used the fixed suggestion verbatim).
  const [nameInput, setNameInput] = useState(suggestedName);
  useEffect(() => { setNameInput(suggestedName); }, [suggestedName]);
  const [width, setWidth] = useState(16);
  const [height, setHeight] = useState(16);
  const [widthInput, setWidthInput] = useState("16");
  const [heightInput, setHeightInput] = useState("16");
  const applySize = (w: number, h: number) => {
    setWidth(w); setWidthInput(String(w));
    setHeight(h); setHeightInput(String(h));
  };
  // Resizing the canvas keeps existing pixel content in place (top-left anchored) instead of
  // wiping it — shrinking crops, growing pads with transparency. Changing a <canvas> element's
  // width/height attribute clears it per the HTML spec, so the pre-resize pixels are captured into
  // pendingRestoreRef first and painted back once the size-change effect below has (re)created the
  // now-differently-sized canvases — same two-step dance undo/redo already uses.
  const commitWidth = () => {
    const n = clampSize(parseInt(widthInput, 10));
    setWidthInput(String(n));
    if (n !== width) { pushUndoSnapshot(); schedulePendingRestore(captureSnapshot().images); setWidth(n); }
  };
  const commitHeight = () => {
    const n = clampSize(parseInt(heightInput, 10));
    setHeightInput(String(n));
    if (n !== height) { pushUndoSnapshot(); schedulePendingRestore(captureSnapshot().images); setHeight(n); }
  };

  // The native color <input> fires onChange continuously while the picker is dragged (dozens of
  // events/drag). Earlier this was still bound as a *controlled* input (value={colorInput}) with
  // its own React state kept in sync on every tick — that forced a full re-render of this whole
  // panel (canvas, layers list, toolbar) on every single tick, which is what actually made the
  // picker itself feel sluggish while dragging (React fighting the browser's own native-picker
  // rendering on the same thread), not just the debounce. Now it's uncontrolled (defaultValue,
  // native element owns its own rendering entirely) — only the debounced commit to `color` (what
  // tools actually paint with) touches React state, same idea as PropertyPanel.tsx's ColorField.
  const [color, setColor] = useState("#000000");
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const colorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitColor = (v: string) => {
    if (colorTimeoutRef.current) clearTimeout(colorTimeoutRef.current);
    colorTimeoutRef.current = setTimeout(() => setColor(v), 100);
  };
  const flushColor = () => {
    if (colorTimeoutRef.current) { clearTimeout(colorTimeoutRef.current); colorTimeoutRef.current = null; }
    if (colorInputRef.current) setColor(colorInputRef.current.value);
  };
  useEffect(() => () => { if (colorTimeoutRef.current) clearTimeout(colorTimeoutRef.current); }, []);

  const [tool, setTool] = useState<Tool>("paint");
  const [filled, setFilled] = useState(true);
  const [bgTolerance, setBgTolerance] = useState(20);
  const [saving, setSaving] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);

  const [layers, setLayers] = useState<LayerMeta[]>(() => [newLayerMeta("Layer 1")]);
  const [activeLayerIdx, setActiveLayerIdx] = useState(0);
  const layerCanvasesRef = useRef<(HTMLCanvasElement | null)[]>([]);

  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintingRef = useRef(false);
  const shapeStartRef = useRef<Cell | null>(null);
  /** Set by loadFromTexture when the source image's size differs from the current canvas — drawn
   * onto the active layer once the size-change effect below has resized (and cleared) all layers. */
  const pendingImageRef = useRef<HTMLImageElement | null>(null);
  /** Set by restoreSnapshot (undo/redo) and by commitWidth/commitHeight (canvas resize, to keep
   * existing pixels instead of wiping them) — per-layer-id pixel data to paint back once the
   * layers array/size change below has (re)created the canvas elements. Same two-step dance as
   * pendingImageRef, since a removed-then-restored (or resized) layer gets a brand new <canvas>
   * DOM node. Always go through schedulePendingRestore rather than assigning .current directly —
   * one mutation site keeps this safe to read from the effect below. */
  const pendingRestoreRef = useRef<Record<string, ImageData> | null>(null);
  function schedulePendingRestore(images: Record<string, ImageData>) {
    pendingRestoreRef.current = images;
  }

  // --- Selection tool (select a region, then move or resize just that region) --------------
  // A rectangular marquee (canvas-pixel coords). Dragging *inside* it or grabbing a corner handle
  // "lifts" its pixels into an offscreen buffer (cutting a transparent hole at the original spot)
  // so it can be moved/rescaled freely; the buffer is stamped back onto the active layer once the
  // tool switches away or a new selection starts elsewhere. Not committed on every drag tick —
  // only once per lift, same "one undo step per edit session" idea as the other tools.
  const [selection, setSelection] = useState<SelRect | null>(null);
  const selectionLiftedRef = useRef(false);
  const selectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectionLayerIdxRef = useRef<number | null>(null);
  const selectionDragRef = useRef<SelDrag | null>(null);
  /** Ctrl+C/Ctrl+V clipboard — a standalone copy of the selection's current pixels (at its current
   * size, whatever's actually visible right now) plus where it was copied from, so a bare Ctrl+V
   * pastes back in the same spot (a no-op until you drag it) instead of jumping somewhere odd. */
  const selectionClipboardRef = useRef<{ canvas: HTMLCanvasElement; x: number; y: number } | null>(null);

  // Canvas area fills whatever space is available instead of a fixed max size.
  const canvasAreaRef = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState({ w: 480, h: 480 });
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setAvail({ w: Math.max(64, entry.contentRect.width - 16), h: Math.max(64, entry.contentRect.height - 16) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mouse-wheel zoom over the canvas area — 1 = auto-fit (the base size that fills `avail`).
  // React's synthetic onWheel is attached passively by default (can't preventDefault reliably),
  // so this is a real DOM listener via the ref, same pattern as the ResizeObserver above.
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(0.25, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const baseCellSize = Math.max(1, Math.floor(Math.min(avail.w / width, avail.h / height)));
  const cellSize = Math.max(1, Math.round(baseCellSize * zoom));
  const displayW = width * cellSize;
  const displayH = height * cellSize;

  function getActiveCtx(): CanvasRenderingContext2D | null {
    const canvas = layerCanvasesRef.current[activeLayerIdx];
    return canvas ? canvas.getContext("2d") : null;
  }

  /** Cuts `selection`'s pixels out of the layer they belong to into an offscreen buffer (leaving a
   * transparent hole behind) so they can be moved/resized freely. No-op if already lifted — a
   * second grab within the same selection session keeps using the same buffer. */
  function liftSelection() {
    if (!selection || selectionLiftedRef.current) return;
    const ctx = getActiveCtx();
    if (!ctx) return;
    pushUndoSnapshot();
    const data = ctx.getImageData(selection.x, selection.y, selection.w, selection.h);
    let buf = selectionCanvasRef.current;
    if (!buf) { buf = document.createElement("canvas"); selectionCanvasRef.current = buf; }
    buf.width = selection.w;
    buf.height = selection.h;
    const bctx = buf.getContext("2d");
    if (bctx) bctx.putImageData(data, 0, 0);
    ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
    selectionLiftedRef.current = true;
    selectionLayerIdxRef.current = activeLayerIdx;
  }

  /** Stamps a lifted selection's buffer back onto the layer it was cut from, at its current
   * position/size (nearest-neighbor scaled if resized), and clears the selection entirely. No-op
   * (just clears the marquee) if nothing was ever lifted. Called when the select tool loses focus
   * (tool switch, new selection started elsewhere) so nothing stays silently "floating". */
  function commitSelection() {
    if (selection && selectionLiftedRef.current && selectionCanvasRef.current) {
      const layerIdx = selectionLayerIdxRef.current ?? activeLayerIdx;
      const canvas = layerCanvasesRef.current[layerIdx];
      const ctx = canvas?.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          selectionCanvasRef.current, 0, 0, selectionCanvasRef.current.width, selectionCanvasRef.current.height,
          selection.x, selection.y, selection.w, selection.h,
        );
      }
    }
    selectionLiftedRef.current = false;
    selectionLayerIdxRef.current = null;
    setSelection(null);
  }

  /** Deletes the selected pixels (Delete/Backspace) — clears them to transparent instead of
   * stamping them back, unlike commitSelection. If already lifted, the original spot is already
   * transparent from the cut at lift time, so this just discards the floating buffer. */
  function deleteSelection() {
    if (!selection) return;
    if (!selectionLiftedRef.current) {
      const ctx = getActiveCtx();
      if (ctx) {
        pushUndoSnapshot();
        ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
      }
    }
    selectionLiftedRef.current = false;
    selectionLayerIdxRef.current = null;
    setSelection(null);
  }

  /** Ctrl+C — copies the selection's current visual pixels (whether still on the layer or already
   * floating) into selectionClipboardRef, at its current on-screen size. Doesn't touch the canvas
   * or the selection itself, so copying doesn't interrupt an in-progress move/resize. */
  function copySelection() {
    if (!selection) return;
    const buf = document.createElement("canvas");
    buf.width = selection.w;
    buf.height = selection.h;
    const bctx = buf.getContext("2d");
    if (!bctx) return;
    bctx.imageSmoothingEnabled = false;
    if (selectionLiftedRef.current && selectionCanvasRef.current) {
      const src = selectionCanvasRef.current;
      bctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, selection.w, selection.h);
    } else {
      const layerIdx = selectionLayerIdxRef.current ?? activeLayerIdx;
      const canvas = layerCanvasesRef.current[layerIdx];
      if (canvas) bctx.drawImage(canvas, selection.x, selection.y, selection.w, selection.h, 0, 0, selection.w, selection.h);
    }
    selectionClipboardRef.current = { canvas: buf, x: selection.x, y: selection.y };
  }

  /** Ctrl+V — pastes the clipboard as a new floating selection at the position it was copied from
   * (so a bare copy+paste is a visual no-op until you drag it away). Commits whatever selection
   * was already floating first, so it isn't silently lost. */
  function pasteSelection() {
    const clip = selectionClipboardRef.current;
    if (!clip) return;
    commitSelection();
    pushUndoSnapshot();
    const w = clip.canvas.width, h = clip.canvas.height;
    const x = Math.max(0, Math.min(width - w, clip.x));
    const y = Math.max(0, Math.min(height - h, clip.y));
    const buf = document.createElement("canvas");
    buf.width = w; buf.height = h;
    const bctx = buf.getContext("2d");
    if (bctx) bctx.drawImage(clip.canvas, 0, 0);
    selectionCanvasRef.current = buf;
    selectionLiftedRef.current = true;
    selectionLayerIdxRef.current = activeLayerIdx;
    setSelection({ x, y, w, h });
  }

  /** "r" — rotates the floating selection 90° clockwise in place (center-anchored, width/height
   * swap). Lifts first if needed. Normalizes the buffer to the selection's *current* displayed
   * size before rotating (it may have been scaled by an earlier resize), so this always rotates
   * exactly what's visible, not stale pre-resize pixels. */
  function rotateSelection90() {
    if (!selection) return;
    if (!selectionLiftedRef.current) liftSelection();
    const src = selectionCanvasRef.current;
    if (!src) return;
    const normalized = document.createElement("canvas");
    normalized.width = selection.w;
    normalized.height = selection.h;
    const nctx = normalized.getContext("2d");
    if (nctx) {
      nctx.imageSmoothingEnabled = false;
      nctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, selection.w, selection.h);
    }
    const rotated = document.createElement("canvas");
    rotated.width = normalized.height;
    rotated.height = normalized.width;
    const rctx = rotated.getContext("2d");
    if (rctx) {
      rctx.imageSmoothingEnabled = false;
      rctx.translate(rotated.width, 0);
      rctx.rotate(Math.PI / 2);
      rctx.drawImage(normalized, 0, 0);
    }
    selectionCanvasRef.current = rotated;
    const newW = selection.h, newH = selection.w;
    let nx = selection.x + Math.round((selection.w - newW) / 2);
    let ny = selection.y + Math.round((selection.h - newH) / 2);
    nx = Math.max(0, Math.min(width - newW, nx));
    ny = Math.max(0, Math.min(height - newH, ny));
    setSelection({ x: nx, y: ny, w: newW, h: newH });
  }

  /** Numeric width/height entry for the current selection (right sidebar), as an alternative to
   * dragging a corner handle — grows/shrinks from the top-left corner, same as the "se" handle.
   * Lifts the selection first if it hasn't been already, same as a handle-drag would. */
  function setSelectionSize(w: number, h: number) {
    if (!selection) return;
    if (!selectionLiftedRef.current) liftSelection();
    const nw = Math.max(1, Math.min(Math.round(w), width - selection.x));
    const nh = Math.max(1, Math.min(Math.round(h), height - selection.y));
    setSelection({ ...selection, w: nw, h: nh });
  }

  /** Which resize handle (if any) the event is over, in display-pixel space with a fixed grab
   * tolerance (so it stays easy to grab regardless of zoom/cellSize). */
  function selectionHandleAt(e: React.MouseEvent<HTMLCanvasElement>, sel: SelRect): SelHandle | null {
    const px = e.nativeEvent.offsetX, py = e.nativeEvent.offsetY;
    const TOL = 6;
    const corners: [SelHandle, number, number][] = [
      ["nw", sel.x, sel.y], ["ne", sel.x + sel.w, sel.y],
      ["sw", sel.x, sel.y + sel.h], ["se", sel.x + sel.w, sel.y + sel.h],
    ];
    for (const [name, cx, cy] of corners) {
      if (Math.abs(px - cx * cellSize) <= TOL && Math.abs(py - cy * cellSize) <= TOL) return name;
    }
    return null;
  }

  function insideSelection(e: React.MouseEvent<HTMLCanvasElement>, sel: SelRect): boolean {
    const [cx, cy] = cellFromEvent(e);
    return cx >= sel.x && cx < sel.x + sel.w && cy >= sel.y && cy < sel.y + sel.h;
  }

  /** Shift-resize: locks the raw dragged w/h back to the original selection's aspect ratio,
   * driven by whichever axis moved more (so dragging mostly sideways/downward both feel natural). */
  function lockAspect(rawW: number, rawH: number, aspectW: number, aspectH: number): [number, number] {
    const ratio = aspectW / aspectH;
    if (Math.abs(rawW / aspectW) >= Math.abs(rawH / aspectH)) {
      return [rawW, Math.max(1, Math.round(rawW / ratio))];
    }
    return [Math.max(1, Math.round(rawH * ratio)), rawH];
  }

  function redraw(previewCells?: Cell[]) {
    const disp = displayCanvasRef.current;
    if (!disp) return;
    const ctx = disp.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, disp.width, disp.height);
    const cb = 8;
    for (let y = 0; y < disp.height; y += cb) {
      for (let x = 0; x < disp.width; x += cb) {
        ctx.fillStyle = ((x / cb + y / cb) % 2 === 0) ? "#3a3a3a" : "#2a2a2a";
        ctx.fillRect(x, y, cb, cb);
      }
    }
    for (let i = 0; i < layers.length; i++) {
      if (!layers[i].visible) continue;
      const canvas = layerCanvasesRef.current[i];
      if (canvas) ctx.drawImage(canvas, 0, 0, width, height, 0, 0, disp.width, disp.height);
    }
    if (previewCells && previewCells.length > 0) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.65;
      for (const [x, y] of previewCells) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
      ctx.globalAlpha = 1;
    }
    if (cellSize >= 6) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x++) {
        ctx.beginPath(); ctx.moveTo(x * cellSize + 0.5, 0); ctx.lineTo(x * cellSize + 0.5, disp.height); ctx.stroke();
      }
      for (let y = 0; y <= height; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * cellSize + 0.5); ctx.lineTo(disp.width, y * cellSize + 0.5); ctx.stroke();
      }
    }

    if (selection) {
      const sx = selection.x * cellSize, sy = selection.y * cellSize;
      const sw = selection.w * cellSize, sh = selection.h * cellSize;
      if (selectionLiftedRef.current && selectionCanvasRef.current) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          selectionCanvasRef.current, 0, 0, selectionCanvasRef.current.width, selectionCanvasRef.current.height,
          sx, sy, sw, sh,
        );
      }
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, Math.max(0, sw - 1), Math.max(0, sh - 1));
      ctx.restore();
      if (tool === "select") {
        const HS = 6;
        ctx.fillStyle = "#4da3ff";
        for (const [hx, hy] of [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]]) {
          ctx.fillRect(hx - HS / 2, hy - HS / 2, HS, HS);
        }
      }
    }

    // Same presentation as ItemBlockPreview.tsx's icon box (grey slot background, pixelated, no
    // grid) — so this is exactly what the item/block will look like once saved & selected.
    const prev = previewCanvasRef.current;
    const pctx = prev?.getContext("2d");
    if (prev && pctx) {
      pctx.imageSmoothingEnabled = false;
      pctx.clearRect(0, 0, prev.width, prev.height);
      for (let i = 0; i < layers.length; i++) {
        if (!layers[i].visible) continue;
        const canvas = layerCanvasesRef.current[i];
        if (canvas) pctx.drawImage(canvas, 0, 0, width, height, 0, 0, prev.width, prev.height);
      }
    }
  }

  // Redraw whenever size, layers (add/remove/reorder/visibility), the active layer, or the
  // rendered cell size changes — the last one matters because the display <canvas>'s width/height
  // attributes derive from `avail` (ResizeObserver), and changing a canvas's width/height clears
  // it per the HTML spec; without cellSize here the workspace stayed blank until the first paint
  // stroke happened to call redraw() itself. Also draws a pending template image onto the active
  // layer right after a resize clears it.
  useEffect(() => {
    if (pendingImageRef.current) {
      const ctx = getActiveCtx();
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pendingImageRef.current, 0, 0, width, height);
      }
      pendingImageRef.current = null;
    }
    if (pendingRestoreRef.current) {
      const restore = pendingRestoreRef.current;
      for (let i = 0; i < layers.length; i++) {
        const canvas = layerCanvasesRef.current[i];
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) continue;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const data = restore[layers[i].id];
        if (data) ctx.putImageData(data, 0, 0);
      }
      pendingRestoreRef.current = null;
    }
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, layers, activeLayerIdx, cellSize]);

  // Redraws whenever the selection marquee/floating buffer moves, resizes, or clears.
  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // Switching away from the select tool stamps any still-floating selection back onto its layer
  // rather than leaving it silently unsaved.
  useEffect(() => {
    if (tool !== "select" && selection) commitSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // --- Undo/Redo -----------------------------------------------------------
  // Snapshot-based: each entry captures full canvas pixel data per layer plus size/layer metadata.
  // Pushed once per discrete action (stroke start, shape commit, fill, tint, clear, template load,
  // layer add/remove/reorder, resize) — not per pixel/mousemove.
  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  function captureSnapshot(): Snapshot {
    const images: Record<string, ImageData> = {};
    layers.forEach((layer, i) => {
      const canvas = layerCanvasesRef.current[i];
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) images[layer.id] = ctx.getImageData(0, 0, canvas.width, canvas.height);
    });
    return { width, height, layers: layers.map((l) => ({ ...l })), activeLayerIdx, images };
  }

  function pushUndoSnapshot() {
    undoStackRef.current.push(captureSnapshot());
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
    redoStackRef.current = [];
    setRedoCount(0);
  }

  function restoreSnapshot(snap: Snapshot) {
    schedulePendingRestore(snap.images);
    setWidth(snap.width); setWidthInput(String(snap.width));
    setHeight(snap.height); setHeightInput(String(snap.height));
    setLayers(snap.layers.map((l) => ({ ...l })));
    setActiveLayerIdx(snap.activeLayerIdx);
  }

  function undo() {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    setUndoCount(undoStackRef.current.length);
    redoStackRef.current.push(captureSnapshot());
    setRedoCount(redoStackRef.current.length);
    restoreSnapshot(prev);
  }

  function redo() {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    setRedoCount(redoStackRef.current.length);
    undoStackRef.current.push(captureSnapshot());
    setUndoCount(undoStackRef.current.length);
    restoreSnapshot(next);
  }

  // Local Ctrl+Z / Ctrl+Y — the parent editor page skips its own project-undo shortcuts while the
  // texture editor is active so this is the only handler that sees them. Ignored while focus is in
  // a text input (Name/Width/Height/layer rename) so native text-field undo keeps working there.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (tool === "select" && selection && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        deleteSelection();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (tool === "select" && mod && (e.key === "c" || e.key === "C")) {
        if (selection) { e.preventDefault(); copySelection(); }
        return;
      }
      if (tool === "select" && mod && (e.key === "v" || e.key === "V")) {
        if (selectionClipboardRef.current) { e.preventDefault(); pasteSelection(); }
        return;
      }
      if (tool === "select" && !mod && (e.key === "r" || e.key === "R")) {
        if (selection) { e.preventDefault(); rotateSelection90(); }
        return;
      }
      if (!mod || e.key.toLowerCase() !== "z" && e.key.toLowerCase() !== "y") return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function cellFromEvent(e: React.MouseEvent<HTMLCanvasElement>): Cell {
    const x = Math.floor(e.nativeEvent.offsetX / cellSize);
    const y = Math.floor(e.nativeEvent.offsetY / cellSize);
    return [x, y];
  }

  function setPixel(ctx: CanvasRenderingContext2D, x: number, y: number, erase: boolean) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    if (erase) ctx.clearRect(x, y, 1, 1);
    else { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
  }

  function paintAt(x: number, y: number) {
    const ctx = getActiveCtx();
    if (!ctx) return;
    setPixel(ctx, x, y, tool === "erase");
    redraw();
  }

  function commitShapeCells(cells: Cell[]) {
    const ctx = getActiveCtx();
    if (!ctx) return;
    for (const [x, y] of cells) setPixel(ctx, x, y, false);
    redraw();
  }

  function cellsFor(tool: "line" | "rect" | "ellipse", start: Cell, end: Cell): Cell[] {
    if (tool === "line") return lineCells(start[0], start[1], end[0], end[1]);
    if (tool === "rect") return rectCells(start[0], start[1], end[0], end[1], filled);
    return ellipseCells(start[0], start[1], end[0], end[1], filled);
  }

  useEffect(() => {
    const onUp = () => { paintingRef.current = false; };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  function loadFromTexture(key: string) {
    const url = packTextures[key];
    setSourcePickerOpen(false);
    if (!url) return;
    pushUndoSnapshot();
    const img = new Image();
    img.onload = () => {
      const w = clampSize(img.naturalWidth || width);
      const h = clampSize(img.naturalHeight || height);
      if (w === width && h === height) {
        const ctx = getActiveCtx();
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, width, height);
        }
        redraw();
      } else {
        pendingImageRef.current = img;
        applySize(w, h);
      }
    };
    img.src = url;
  }

  // Reopened from the "My Textures" gallery for further editing — load it onto the canvas once,
  // on mount (this component remounts fresh each time activeDocType switches back to "texture").
  useEffect(() => {
    if (initialTextureKey) loadFromTexture(initialTextureKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Imports a local PNG file (from disk, not the extracted pack) onto the active layer — same
   * size-matching dance as loadFromTexture, just sourced from a File instead of a pack texture. */
  function loadFromFile(file: File) {
    const url = URL.createObjectURL(file);
    pushUndoSnapshot();
    const img = new Image();
    img.onload = () => {
      // Unlike "Use existing as template" (which adopts the source's own size), an imported file
      // keeps the current canvas size and gets scaled to fit within it instead — down for a big
      // photo, up for a tiny icon — preserving aspect ratio and centered (not just stuck at 0,0),
      // since that's what "centered" scaling means when the fitted size doesn't fill an axis.
      const ctx = getActiveCtx();
      if (ctx) {
        const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
        const dw = Math.max(1, Math.round(img.naturalWidth * scale));
        const dh = Math.max(1, Math.round(img.naturalHeight * scale));
        const dx = Math.round((width - dw) / 2);
        const dy = Math.round((height - dh) / 2);
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, dw, dh);
      }
      redraw();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  const importFileRef = useRef<HTMLInputElement | null>(null);
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFromFile(file);
    e.target.value = "";
  };

  const handleTint = () => {
    const ctx = getActiveCtx();
    if (!ctx) return;
    pushUndoSnapshot();
    ctx.save();
    ctx.globalCompositeOperation = "color";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    redraw();
  };

  const handleClearLayer = () => {
    const ctx = getActiveCtx();
    if (!ctx) return;
    pushUndoSnapshot();
    ctx.clearRect(0, 0, width, height);
    redraw();
  };

  const addLayer = () => {
    pushUndoSnapshot();
    setLayers((prev) => [...prev, newLayerMeta(`Layer ${prev.length + 1}`)]);
    setActiveLayerIdx(layers.length);
  };
  const removeLayer = (idx: number) => {
    if (layers.length <= 1) return;
    pushUndoSnapshot();
    setLayers((prev) => prev.filter((_, i) => i !== idx));
    setActiveLayerIdx((prev) => Math.min(prev, layers.length - 2));
  };
  const toggleLayerVisible = (idx: number) => {
    pushUndoSnapshot();
    setLayers((prev) => prev.map((l, i) => i === idx ? { ...l, visible: !l.visible } : l));
  };
  const renameLayer = (idx: number, name: string) => {
    setLayers((prev) => prev.map((l, i) => i === idx ? { ...l, name } : l));
  };
  const moveLayer = (idx: number, dir: 1 | -1) => {
    const target = idx + dir;
    if (target < 0 || target >= layers.length) return;
    pushUndoSnapshot();
    setLayers((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setActiveLayerIdx((prev) => prev === idx ? target : prev === target ? idx : prev);
  };

  /** Starts a brand-new blank texture — fresh single 16x16 layer, name reset. Pushes an undo
   * snapshot first so the previous work isn't lost, just an undo away. */
  const handleNewTexture = () => {
    pushUndoSnapshot();
    setNameInput("texture");
    setLayers([newLayerMeta("Layer 1")]);
    setActiveLayerIdx(0);
    applySize(16, 16);
    selectionLiftedRef.current = false;
    selectionLayerIdxRef.current = null;
    setSelection(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const flat = document.createElement("canvas");
      flat.width = width;
      flat.height = height;
      const fctx = flat.getContext("2d");
      if (!fctx) throw new Error("Could not create canvas context");
      fctx.imageSmoothingEnabled = false;
      for (let i = 0; i < layers.length; i++) {
        if (!layers[i].visible) continue;
        const canvas = layerCanvasesRef.current[i];
        if (canvas) fctx.drawImage(canvas, 0, 0);
      }
      const blob: Blob | null = await new Promise((resolve) => flat.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not encode PNG");
      const stem = (nameInput || "texture").trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "texture";
      const file = new File([blob], `${stem}.png`, { type: "image/png" });
      const key = await onUpload(file);
      onSave(key);
    } catch (e) {
      alert(`Could not save texture: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const isShapeTool = tool === "line" || tool === "rect" || tool === "ellipse";

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden p-4">
      <div className="flex flex-wrap items-end gap-3 text-xs shrink-0">
        {onBack && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={onBack} title="Back">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        )}
        <div className="flex flex-col gap-0.5">
          <label className="text-muted-foreground">Name</label>
          <Input
            className="h-7 w-36 text-xs"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="texture"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-muted-foreground">Width (px)</label>
          <Input
            type="number"
            min={MIN_SIZE}
            max={MAX_SIZE}
            className="h-7 w-20 text-xs"
            value={widthInput}
            onChange={(e) => setWidthInput(e.target.value)}
            onBlur={commitWidth}
            onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-muted-foreground">Height (px)</label>
          <Input
            type="number"
            min={MIN_SIZE}
            max={MAX_SIZE}
            className="h-7 w-20 text-xs"
            value={heightInput}
            onChange={(e) => setHeightInput(e.target.value)}
            onBlur={commitHeight}
            onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-muted-foreground">Color</label>
          <input
            ref={colorInputRef}
            type="color"
            defaultValue={color}
            onChange={(e) => commitColor(e.target.value)}
            onBlur={flushColor}
            className="h-7 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
          />
        </div>
        <Button type="button" variant={tool === "paint" ? "default" : "outline"} size="sm" className="h-7 px-2" onClick={() => setTool("paint")} title="Paint">
          <Paintbrush className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant={tool === "erase" ? "default" : "outline"} size="sm" className="h-7 px-2" onClick={() => setTool("erase")} title="Erase">
          <Eraser className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant={tool === "line" ? "default" : "outline"} size="sm" className="h-7 px-2" onClick={() => setTool("line")} title="Line">
          <Slash className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant={tool === "rect" ? "default" : "outline"} size="sm" className="h-7 px-2" onClick={() => setTool("rect")} title="Rectangle">
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant={tool === "ellipse" ? "default" : "outline"} size="sm" className="h-7 px-2" onClick={() => setTool("ellipse")} title="Ellipse">
          <Circle className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant={tool === "fill" ? "default" : "outline"} size="sm" className="h-7 px-2" onClick={() => setTool("fill")} title="Bucket fill">
          <PaintBucket className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant={tool === "bgremove" ? "default" : "outline"} size="sm" className="h-7 px-2"
          onClick={() => setTool("bgremove")}
          title="Remove background: click a color and every matching pixel on this layer (not just the connected blob) turns transparent"
        >
          <Wand2 className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant={tool === "select" ? "default" : "outline"} size="sm" className="h-7 px-2" onClick={() => setTool("select")} title="Select a region to move or resize it. Shift+resize keeps it proportional. Ctrl+C/Ctrl+V copy/paste, R rotates 90°, Delete clears.">
          <MousePointer2 className="h-3.5 w-3.5" />
        </Button>
        {(tool === "rect" || tool === "ellipse") && (
          <label className="flex items-center gap-1 text-muted-foreground">
            <input type="checkbox" checked={filled} onChange={(e) => setFilled(e.target.checked)} /> Filled
          </label>
        )}
        {tool === "bgremove" && (
          <div className="flex flex-col gap-0.5">
            <label className="text-muted-foreground">Tolerance ({bgTolerance})</label>
            <input
              type="range" min={0} max={100} value={bgTolerance}
              onChange={(e) => setBgTolerance(Number(e.target.value))}
              className="h-7 w-24"
              title="How close a pixel's color must be to the clicked one to also be removed"
            />
          </div>
        )}
        {tool === "select" && selection && (
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 gap-1" onClick={commitSelection} title="Commit the selection to the layer and deselect">
            <Check className="h-3.5 w-3.5" /> Deselect
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={handleClearLayer} title="Clear active layer">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <div className="h-5 w-px bg-border" />
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={undo} disabled={undoCount === 0} title="Undo (Ctrl+Z)">
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={redo} disabled={redoCount === 0} title="Redo (Ctrl+Y / Ctrl+Shift+Z)">
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <div className="h-5 w-px bg-border" />
        <Button
          type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1"
          onClick={() => setSourcePickerOpen(true)}
          title="Load an existing texture as a starting template onto the active layer"
        >
          <ImageDown className="h-3.5 w-3.5" /> Use existing as template
        </Button>
        <Button
          type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1"
          onClick={() => importFileRef.current?.click()}
          title="Import a PNG from your computer onto the active layer, scaled centered to fit the current canvas size"
        >
          <Upload className="h-3.5 w-3.5" /> Import image
        </Button>
        <input
          ref={importFileRef}
          type="file"
          accept="image/png,image/*"
          onChange={handleImportFileChange}
          style={{ display: "none" }}
        />
        <Button
          type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1"
          onClick={handleTint}
          title="Recolor the active layer's pixels to the selected color, keeping their shading/pattern"
        >
          <Droplet className="h-3.5 w-3.5" /> Tint
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            Resizing crops/pads, doesn&apos;t clear. (0,0) = top-left corner. Scroll to zoom.
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => setZoom(1)} title="Reset zoom to fit">
            Reset
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-3 overflow-hidden">
        <div ref={canvasAreaRef} className="flex min-w-0 min-h-0 flex-1 items-center justify-center overflow-auto rounded border border-input bg-background">
          {layers.map((layer, i) => (
            <canvas
              key={layer.id}
              ref={(el) => { layerCanvasesRef.current[i] = el; }}
              width={width}
              height={height}
              style={{ display: "none" }}
            />
          ))}
          <canvas
            ref={displayCanvasRef}
            width={displayW}
            height={displayH}
            style={{ width: displayW, height: displayH, imageRendering: "pixelated", cursor: "crosshair" }}
            onMouseDown={(e) => {
              const [x, y] = cellFromEvent(e);
              if (tool === "paint" || tool === "erase") {
                pushUndoSnapshot();
                paintingRef.current = true;
                paintAt(x, y);
              } else if (tool === "fill") {
                pushUndoSnapshot();
                const canvas = layerCanvasesRef.current[activeLayerIdx];
                if (canvas) floodFillLayer(canvas, x, y, color);
                redraw();
              } else if (tool === "bgremove") {
                pushUndoSnapshot();
                const canvas = layerCanvasesRef.current[activeLayerIdx];
                if (canvas) removeBackgroundColor(canvas, x, y, bgTolerance);
                redraw();
              } else if (tool === "select") {
                if (selection) {
                  const handle = selectionHandleAt(e, selection);
                  if (handle) {
                    if (!selectionLiftedRef.current) liftSelection();
                    selectionDragRef.current = { mode: "resize", handle, startCell: [x, y], startSel: selection };
                    return;
                  }
                  if (insideSelection(e, selection)) {
                    if (!selectionLiftedRef.current) liftSelection();
                    selectionDragRef.current = { mode: "move", startCell: [x, y], startSel: selection };
                    return;
                  }
                  commitSelection();
                }
                const newSel: SelRect = { x, y, w: 1, h: 1 };
                selectionDragRef.current = { mode: "create", startCell: [x, y], startSel: newSel };
                setSelection(newSel);
              } else {
                pushUndoSnapshot();
                shapeStartRef.current = [x, y];
                redraw([[x, y]]);
              }
            }}
            onMouseMove={(e) => {
              const [x, y] = cellFromEvent(e);
              if (paintingRef.current && (tool === "paint" || tool === "erase")) { paintAt(x, y); return; }
              if (isShapeTool && shapeStartRef.current) redraw(cellsFor(tool as "line" | "rect" | "ellipse", shapeStartRef.current, [x, y]));
              if (tool === "select" && selectionDragRef.current) {
                const drag = selectionDragRef.current;
                if (drag.mode === "create") {
                  const x0 = drag.startCell[0], y0 = drag.startCell[1];
                  const minX = Math.max(0, Math.min(x0, x)), maxX = Math.min(width - 1, Math.max(x0, x));
                  const minY = Math.max(0, Math.min(y0, y)), maxY = Math.min(height - 1, Math.max(y0, y));
                  setSelection({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
                } else if (drag.mode === "move") {
                  const dx = x - drag.startCell[0], dy = y - drag.startCell[1];
                  const nx = Math.max(0, Math.min(width - drag.startSel.w, drag.startSel.x + dx));
                  const ny = Math.max(0, Math.min(height - drag.startSel.h, drag.startSel.y + dy));
                  setSelection({ ...drag.startSel, x: nx, y: ny });
                } else if (drag.mode === "resize") {
                  const s = drag.startSel;
                  // Raw w/h relative to whichever corner stays fixed (the opposite one from the
                  // dragged handle), then Shift locks that raw w/h back to the original aspect
                  // ratio — driven by whichever axis moved more — before deriving x/y from it, so
                  // the fixed corner really does stay put regardless of the lock.
                  let rawW = s.w, rawH = s.h;
                  if (drag.handle === "se") { rawW = x - s.x + 1; rawH = y - s.y + 1; }
                  else if (drag.handle === "sw") { rawW = (s.x + s.w) - x; rawH = y - s.y + 1; }
                  else if (drag.handle === "ne") { rawW = x - s.x + 1; rawH = (s.y + s.h) - y; }
                  else if (drag.handle === "nw") { rawW = (s.x + s.w) - x; rawH = (s.y + s.h) - y; }
                  rawW = Math.max(1, rawW); rawH = Math.max(1, rawH);
                  const [nw0, nh0] = e.shiftKey ? lockAspect(rawW, rawH, s.w, s.h) : [rawW, rawH];
                  let nx = s.x, ny = s.y, nw = nw0, nh = nh0;
                  if (drag.handle === "sw" || drag.handle === "nw") nx = (s.x + s.w) - nw;
                  if (drag.handle === "ne" || drag.handle === "nw") ny = (s.y + s.h) - nh;
                  nx = Math.max(0, nx); ny = Math.max(0, ny);
                  nw = Math.min(nw, width - nx); nh = Math.min(nh, height - ny);
                  setSelection({ x: nx, y: ny, w: nw, h: nh });
                }
              }
            }}
            onMouseUp={(e) => {
              if (isShapeTool && shapeStartRef.current) {
                const [x, y] = cellFromEvent(e);
                commitShapeCells(cellsFor(tool as "line" | "rect" | "ellipse", shapeStartRef.current, [x, y]));
                shapeStartRef.current = null;
              }
              if (tool === "select") selectionDragRef.current = null;
              paintingRef.current = false;
            }}
          />
        </div>

        <div className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto">
          {tool === "select" && selection && (
            <div className="flex flex-col gap-1 rounded border border-input p-2 text-xs">
              <span className="font-semibold text-muted-foreground">Selection</span>
              <div className="grid grid-cols-2 gap-1">
                <Field label="Width">
                  <NumInput value={selection.w} onChange={(v) => setSelectionSize(v, selection.h)} />
                </Field>
                <Field label="Height">
                  <NumInput value={selection.h} onChange={(v) => setSelectionSize(selection.w, v)} />
                </Field>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1 rounded border border-input p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-muted-foreground">Layers</span>
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={addLayer} title="Add layer">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-col gap-0.5">
              {[...layers].map((layer, displayIdx) => {
                const idx = layers.length - 1 - displayIdx; // top-of-stack shown first
                return (
                  <div
                    key={layer.id}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 ${idx === activeLayerIdx ? "bg-accent" : "hover:bg-sidebar-accent"}`}
                    onClick={() => setActiveLayerIdx(idx)}
                  >
                    <button
                      title={layer.visible ? "Hide layer" : "Show layer"}
                      onClick={(e) => { e.stopPropagation(); toggleLayerVisible(idx); }}
                      className="shrink-0 text-muted-foreground hover:text-foreground [&>svg]:size-3.5"
                    >
                      {layer.visible ? <Eye /> : <EyeOff />}
                    </button>
                    <input
                      className="min-w-0 flex-1 truncate bg-transparent text-xs outline-none"
                      value={layer.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => renameLayer(idx, e.target.value)}
                    />
                    <button
                      title="Bring forward"
                      disabled={idx === layers.length - 1}
                      onClick={(e) => { e.stopPropagation(); moveLayer(idx, 1); }}
                      className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-20 [&>svg]:size-3.5"
                    >
                      <ChevronUp />
                    </button>
                    <button
                      title="Send backward"
                      disabled={idx === 0}
                      onClick={(e) => { e.stopPropagation(); moveLayer(idx, -1); }}
                      className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-20 [&>svg]:size-3.5"
                    >
                      <ChevronDown />
                    </button>
                    <button
                      title="Delete layer"
                      disabled={layers.length <= 1}
                      onClick={(e) => { e.stopPropagation(); removeLayer(idx); }}
                      className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-20 [&>svg]:size-3.5"
                    >
                      <Trash2 />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Preview (as in designer)</span>
            <div className="flex items-center justify-center rounded border border-input bg-[#8b8b8b] shadow-inner" style={{ width: 96, height: 96 }}>
              <canvas
                ref={previewCanvasRef}
                width={64}
                height={64}
                style={{ width: "80%", height: "80%", imageRendering: "pixelated" }}
              />
            </div>
          </div>

          <Button
            type="button" variant="outline" size="sm" className="gap-1"
            onClick={handleNewTexture}
            title="Start a brand-new blank texture (16x16) — your current work goes on the undo stack"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : onBack ? "Save & use here" : "Save texture"}
          </Button>
        </div>
      </div>

      <TexturePickerModal
        open={sourcePickerOpen}
        packTextures={packTextures}
        current=""
        onSelect={loadFromTexture}
        onClose={() => setSourcePickerOpen(false)}
      />
    </div>
  );
}
