"use client";

import { useRef, useState } from "react";
import { Play, Pause, SkipBack, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EntityModel } from "@/lib/model3d/types";
import { CHANNELS, type AnimKeyframe, type Channel, type LoopMode, type ModelAnimation } from "@/lib/model3d/animation";

const CHANNEL_COLOR: Record<Channel, string> = { rotation: "#f5b301", position: "#6cc06c", scale: "#4fa3e0" };
const LANE_Y: Record<Channel, number> = { rotation: 4, position: 10, scale: 16 };
const ROW_H = 24;
const NAME_W = 150;
const SNAP = 1 / 24;

export interface TimelineProps {
  model: EntityModel;
  animations: ModelAnimation[];
  active: ModelAnimation | null;
  time: number;
  playing: boolean;
  selectedBone: string | null;
  selectedKeyframe: string | null;
  onSelectAnimation: (id: string) => void;
  onAddAnimation: () => void;
  onRenameAnimation: () => void;
  onDeleteAnimation: () => void;
  onChangeAnimation: (patch: Partial<ModelAnimation>) => void;
  onTime: (t: number) => void;
  onPlay: (playing: boolean) => void;
  onSelectBone: (id: string) => void;
  onSelectKeyframe: (id: string | null) => void;
  onMoveKeyframe: (id: string, time: number) => void;
  onKeyframeMenu: (id: string, x: number, y: number) => void;
}

/** Blockbench-style timeline: one row per bone, keyframe diamonds per channel, scrubbable playhead. */
export default function AnimationTimeline(p: TimelineProps) {
  const [zoom, setZoom] = useState(160); // px per second
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; time: number } | null>(null);

  // Bones in outliner (parent-first) order with depth.
  const rows: { id: string; name: string; depth: number }[] = [];
  const ids = new Set(p.model.bones.map((b) => b.id));
  const visit = (parent: string | null, depth: number) => {
    for (const b of p.model.bones.filter((x) => (x.parent && ids.has(x.parent) ? x.parent : null) === parent)) {
      rows.push({ id: b.id, name: b.name, depth });
      visit(b.id, depth + 1);
    }
  };
  visit(null, 0);

  const length = p.active?.length ?? 1;
  const width = Math.max(length, 0.5) * zoom + 40;
  const timeAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const t = (clientX - rect.left + trackRef.current!.scrollLeft) / zoom;
    return Math.max(0, Math.round(t / SNAP) * SNAP);
  };

  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    p.onPlay(false);
    p.onTime(timeAt(e.clientX));
    const move = (ev: PointerEvent) => p.onTime(timeAt(ev.clientX));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startKfDrag = (e: React.PointerEvent, kf: AnimKeyframe) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    p.onSelectKeyframe(kf.id);
    p.onPlay(false);
    p.onTime(kf.time);
    const startX = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      moved = true;
      setDrag({ id: kf.id, time: timeAt(ev.clientX) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) { const t = timeAt(ev.clientX); p.onMoveKeyframe(kf.id, t); p.onTime(t); }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const ticks: number[] = [];
  const step = zoom >= 240 ? 0.1 : zoom >= 100 ? 0.25 : 0.5;
  for (let t = 0; t <= Math.max(length, 0.5) + 1e-6; t += step) ticks.push(Math.round(t * 1000) / 1000);

  return (
    <div className="flex h-56 shrink-0 flex-col border-t bg-sidebar text-xs" data-testid="animation-timeline">
      <div className="flex h-9 min-w-0 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b px-2 [scrollbar-width:thin] [&>*]:shrink-0">
        <select aria-label="Animation" className="h-7 max-w-40 rounded-sm border border-input bg-transparent px-1 [&>option]:bg-popover"
          value={p.active?.id ?? ""} onChange={(e) => p.onSelectAnimation(e.target.value)}>
          {p.animations.length === 0 && <option value="">No animations</option>}
          {p.animations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" title="New animation" onClick={p.onAddAnimation}><Plus className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" title="Rename animation" disabled={!p.active} onClick={p.onRenameAnimation}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" title="Delete animation" disabled={!p.active} onClick={p.onDeleteAnimation}><Trash2 className="h-3.5 w-3.5" /></Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" title="Back to start" disabled={!p.active} onClick={() => { p.onPlay(false); p.onTime(0); }}><SkipBack className="h-3.5 w-3.5" /></Button>
        <Button size="sm" className="h-7 w-7 px-0" title={p.playing ? "Pause (Space)" : "Play (Space)"} disabled={!p.active} onClick={() => p.onPlay(!p.playing)}>
          {p.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
        </Button>
        <span className="w-24 font-mono tabular-nums text-muted-foreground" data-testid="timeline-time">{p.time.toFixed(2)} / {length.toFixed(2)} s</span>
        {p.active && (
          <>
            <select aria-label="Loop mode" className="h-7 rounded-sm border border-input bg-transparent px-1 [&>option]:bg-popover"
              value={p.active.loop} onChange={(e) => p.onChangeAnimation({ loop: e.target.value as LoopMode })}>
              <option value="loop">Loop</option><option value="once">Play once</option><option value="hold">Hold last frame</option>
            </select>
            <label className="flex items-center gap-1 text-muted-foreground">Length
              <input type="number" min={0.05} step={0.05} aria-label="Animation length"
                className="h-7 w-16 rounded-sm border border-input bg-transparent px-1 text-foreground"
                value={p.active.length} onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) p.onChangeAnimation({ length: v }); }} />
            </label>
          </>
        )}
        <div className="ml-auto flex items-center gap-2 text-muted-foreground">
          {CHANNELS.map((c) => <span key={c} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rotate-45" style={{ background: CHANNEL_COLOR[c] }} />{c}</span>)}
          <label className="flex items-center gap-1">Zoom
            <input type="range" min={60} max={480} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-20 accent-[var(--primary)]" />
          </label>
        </div>
      </div>

      {!p.active ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={p.onAddAnimation}><Plus className="h-3.5 w-3.5" /> New animation</Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="shrink-0 overflow-hidden border-r" style={{ width: NAME_W }}>
            <div className="h-5 border-b" />
            {rows.map((r) => (
              <div key={r.id} onClick={() => p.onSelectBone(r.id)}
                className={`flex cursor-pointer items-center truncate ${p.selectedBone === r.id ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                style={{ height: ROW_H, paddingLeft: 8 + r.depth * 10 }}>
                {r.name}
              </div>
            ))}
          </div>
          <div ref={trackRef} className="relative min-w-0 flex-1 overflow-auto" onPointerDown={scrub} data-testid="timeline-track">
            <div className="relative" style={{ width, minHeight: "100%" }}>
              <div className="sticky top-0 z-10 h-5 border-b bg-sidebar">
                {ticks.map((t) => (
                  <span key={t} className="absolute top-0 h-full border-l border-input/60 pl-0.5 text-[9px] text-muted-foreground" style={{ left: t * zoom }}>{t}</span>
                ))}
              </div>
              <div className="absolute bottom-0 top-5 bg-black/20" style={{ left: length * zoom, right: 0 }} />
              {rows.map((r, i) => {
                const track = p.active!.bones[r.id];
                return (
                  <div key={r.id} className={`absolute left-0 right-0 border-b border-input/30 ${p.selectedBone === r.id ? "bg-white/5" : ""}`} style={{ top: 20 + i * ROW_H, height: ROW_H }}>
                    {track && CHANNELS.flatMap((ch) => track[ch].map((kf) => {
                      const t = drag?.id === kf.id ? drag.time : kf.time;
                      const sel = p.selectedKeyframe === kf.id;
                      return (
                        <div key={kf.id} role="button" aria-label={`${ch} keyframe at ${kf.time}s`} data-kf={kf.id}
                          onPointerDown={(e) => startKfDrag(e, kf)}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); p.onSelectKeyframe(kf.id); p.onKeyframeMenu(kf.id, e.clientX, e.clientY); }}
                          className={`absolute h-[7px] w-[7px] -translate-x-1/2 rotate-45 cursor-ew-resize ${sel ? "ring-2 ring-white" : ""} ${kf.interpolation === "step" ? "rounded-none" : kf.interpolation === "catmullrom" ? "rounded-full" : ""}`}
                          style={{ left: t * zoom, top: LANE_Y[ch], background: CHANNEL_COLOR[ch] }} />
                      );
                    }))}
                  </div>
                );
              })}
              <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-primary" style={{ left: p.time * zoom }}>
                <div className="absolute -left-1 top-0 h-2 w-2 bg-primary" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
