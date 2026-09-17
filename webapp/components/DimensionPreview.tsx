"use client";

import React, { useEffect, useState } from "react";
import type { DimensionSpec } from "@/lib/types";
import { DIMENSION_TYPE_TEMPLATE_LABELS } from "@/lib/dimensionTemplates";

const BLOCK_COLORS: Record<string, string> = {
  bedrock: "#3a3a3a", stone: "#8a8a8a", dirt: "#6b4a2c", grass_block: "#5a9c3f",
  sand: "#d9c98b", netherrack: "#7a2b2b", end_stone: "#dfdca0", obsidian: "#1a0f2b",
  cobblestone: "#7d7d7d", gravel: "#8f8a86", water: "#3f76e4", glass: "#cfe8ff",
};

function colorFor(block: string): string {
  const bare = block.split(":").pop() ?? block;
  return BLOCK_COLORS[bare] ?? "#999999";
}

/** Sky background per base type — the End/Nether don't just follow hasSkylight like the Overworld
 * does, they have their own fixed look in the real game. */
function skyBackground(d: DimensionSpec): string {
  if (d.baseType === "end") return "#150a1f";
  if (d.baseType === "nether") return "#170707";
  return d.hasSkylight ? "#87ceeb" : "#0a0a0a";
}

/** Live local-clock hour (0-24, fractional), refreshed every minute — purely decorative, not tied
 * to any actual in-game time state (this game version doesn't expose a settable fixed-time value
 * at all, see AchievementPropertyPanel/DimensionPropertyPanel's own notes on that limitation). */
function useLocalHour(): number {
  const [hour, setHour] = useState(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  });
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setHour(now.getHours() + now.getMinutes() / 60);
    }, 60000);
    return () => clearInterval(id);
  }, []);
  return hour;
}

/** Sun (day, roughly 6-18) or moon (night) drifting right-to-left across the sky over the course
 * of the day — morning sits to the right, afternoon/evening to the left, arcing higher at midday
 * or midnight. */
function SkyBody({ hour }: { hour: number }) {
  const isDay = hour >= 6 && hour < 18;
  const t = isDay ? (hour - 6) / 12 : (hour >= 18 ? (hour - 18) : (hour + 6)) / 12;
  const xFrac = 1 - t; // 1 = right (rise), 0 = left (set)
  const yFrac = 1 - Math.sin(t * Math.PI); // 0 = high (peak), 1 = low (horizon)
  return (
    <div
      title={isDay ? "Sun (local time)" : "Moon (local time)"}
      style={{
        position: "absolute",
        left: `${8 + xFrac * 78}%`,
        top: `${8 + yFrac * 30}%`,
        width: 8, height: 8, borderRadius: isDay ? "50%" : 2,
        background: isDay ? "#ffe066" : "#e4e6f0",
        boxShadow: isDay ? "0 0 4px 1px rgba(255,224,102,0.6)" : "0 0 3px 1px rgba(228,230,240,0.4)",
      }}
    />
  );
}

/** Simple dark silhouette standing in for the ender dragon — The End's signature detail. */
function PixelDragon() {
  return (
    <div style={{ position: "absolute", top: 10, right: 14, width: 30, height: 10 }} title="The End">
      <div style={{ position: "absolute", left: 9, top: 2, width: 11, height: 4, background: "#0d0713", borderRadius: 2 }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 10, height: 4, background: "#0d0713", clipPath: "polygon(100% 0, 100% 100%, 0% 60%)" }} />
      <div style={{ position: "absolute", left: 19, top: 0, width: 10, height: 4, background: "#0d0713", clipPath: "polygon(0 0, 0 100%, 100% 60%)" }} />
      <div style={{ position: "absolute", left: 20, top: 3, width: 6, height: 2, background: "#0d0713" }} />
    </div>
  );
}

/** Tiny blocky zombie — stands in for "monsters can spawn". */
function PixelZombie() {
  return (
    <div style={{ position: "relative", width: 8, height: 14 }} title="Monsters can spawn">
      <div style={{ position: "absolute", left: 2, top: 0, width: 4, height: 4, background: "#5a9c5a" }} />
      <div style={{ position: "absolute", left: 1, top: 4, width: 6, height: 6, background: "#3d6b8a" }} />
      <div style={{ position: "absolute", left: 0, top: 4, width: 1, height: 5, background: "#5a9c5a" }} />
      <div style={{ position: "absolute", left: 7, top: 4, width: 1, height: 5, background: "#5a9c5a" }} />
      <div style={{ position: "absolute", left: 1, top: 10, width: 2, height: 4, background: "#3d5a80" }} />
      <div style={{ position: "absolute", left: 4, top: 10, width: 2, height: 4, background: "#3d5a80" }} />
    </div>
  );
}

/** Tiny blocky pig — stands in for "mobs (passive/neutral) can spawn". */
function PixelPig() {
  return (
    <div style={{ position: "relative", width: 12, height: 9 }} title="Mobs can spawn">
      <div style={{ position: "absolute", left: 1, top: 1, width: 10, height: 6, background: "#e8a6b0", borderRadius: 1 }} />
      <div style={{ position: "absolute", left: 9, top: 3, width: 3, height: 3, background: "#e8a6b0" }} />
      <div style={{ position: "absolute", left: 10, top: 4, width: 1, height: 1, background: "#c97a86" }} />
      <div style={{ position: "absolute", left: 3, top: 3, width: 1, height: 1, background: "#5a3a3f" }} />
      <div style={{ position: "absolute", left: 1, top: 7, width: 2, height: 2, background: "#c97a86" }} />
      <div style={{ position: "absolute", left: 8, top: 7, width: 2, height: 2, background: "#c97a86" }} />
    </div>
  );
}

/** Tiny blocky tree — stands in for "generate decorations" (trees/grass/flowers). */
function PixelTree() {
  return (
    <div style={{ position: "relative", width: 9, height: 12 }} title="Decorations generate">
      <div style={{ position: "absolute", left: 3, top: 7, width: 3, height: 5, background: "#6b4a2c" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 9, height: 8, background: "#4a8c3a", borderRadius: 1 }} />
    </div>
  );
}

const CONTAINER_W = 176;
const CONTAINER_H = 108;
const CEILING_H = 10;

/** Centerpiece for the currently selected Dimension — a stacked-layer floor cross-section with a
 * ceiling (if hasCeiling), sky matching the base type (with a drifting sun/moon, or the ender
 * dragon for The End), and a few rough pixel-art indicators reacting to the current toggles. No
 * real 3D worldgen preview — this is all approximate, illustrative detail, not simulated. */
export default function DimensionPreview({ dimension }: { dimension: DimensionSpec | null }) {
  const hour = useLocalHour();
  if (!dimension) {
    return <div className="text-sm text-muted-foreground italic">Select or add a dimension.</div>;
  }

  const reversedLayers = [...dimension.layers].reverse();
  const groundHeightPx = Math.min(
    CONTAINER_H - CEILING_H - 4,
    dimension.layers.reduce((sum, l) => sum + Math.max(3, l.height * 4), 0),
  );
  const showSkyBody = dimension.hasSkylight && dimension.baseType !== "end";

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative overflow-hidden rounded border border-input shadow-inner"
        style={{ width: CONTAINER_W, height: CONTAINER_H, background: skyBackground(dimension) }}
      >
        {dimension.hasCeiling && (
          <div className="absolute inset-x-0 top-0" style={{ height: CEILING_H, background: colorFor("bedrock") }} title="Ceiling (bedrock-like)" />
        )}
        {showSkyBody && <SkyBody hour={hour} />}
        {dimension.baseType === "end" && <PixelDragon />}
        <div className="absolute inset-x-0 bottom-0 flex flex-col">
          {reversedLayers.map((l, i) => (
            <div key={i} style={{ height: Math.max(3, l.height * 4), background: colorFor(l.block) }} title={`${l.block} x${l.height}`} />
          ))}
        </div>
        {(dimension.monstersCanSpawn || dimension.generateDecorations || dimension.mobsCanSpawn) && (
          <div
            className="absolute left-2 right-2 flex items-end justify-between"
            style={{ bottom: groundHeightPx }}
          >
            {dimension.monstersCanSpawn ? <PixelZombie /> : <span />}
            {dimension.generateDecorations ? <PixelTree /> : <span />}
            {dimension.mobsCanSpawn ? <PixelPig /> : <span />}
          </div>
        )}
      </div>
      <div className="text-sm font-medium">{dimension.id}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {DIMENSION_TYPE_TEMPLATE_LABELS[dimension.baseType]}
      </div>
      <div className="text-[10px] text-muted-foreground">{dimension.biome}</div>
    </div>
  );
}
