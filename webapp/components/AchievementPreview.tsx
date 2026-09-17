"use client";

import React from "react";
import type { AchievementSpec } from "@/lib/types";

const FRAME_COLOR: Record<AchievementSpec["frame"], string> = {
  task: "#8b8b8b",
  goal: "#8b8b3a",
  challenge: "#9b3ad0",
};

/** Simple centerpiece for the currently selected Achievement — no real in-game advancement-toast
 * rendering (out of scope), just frame color + title/description. */
export default function AchievementPreview({ achievement }: { achievement: AchievementSpec | null }) {
  if (!achievement) {
    return <div className="text-sm text-muted-foreground italic">Select or add an achievement.</div>;
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div
        className="flex items-center justify-center rounded shadow-inner"
        style={{ width: 64, height: 64, background: FRAME_COLOR[achievement.frame], transform: "rotate(45deg)" }}
      >
        <div
          className="flex items-center justify-center rounded-sm text-[9px] text-white/80"
          style={{ width: 40, height: 40, background: "#3a3a3a", transform: "rotate(-45deg)" }}
        >
          {achievement.icon.split(":").pop()?.slice(0, 6)}
        </div>
      </div>
      <div className="text-sm font-medium">{achievement.title || achievement.id}</div>
      {achievement.description && <div className="text-xs text-muted-foreground max-w-48">{achievement.description}</div>}
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {achievement.frame}{achievement.parentId ? "" : " · root"}
      </div>
    </div>
  );
}
