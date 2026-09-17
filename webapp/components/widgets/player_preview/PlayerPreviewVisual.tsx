"use client";

import { User } from "lucide-react";

/**
 * Design-canvas placeholder for the "Player Preview" widget — at runtime this renders the actual
 * live player model (same as vanilla's inventory-screen player preview, mouse-following eyes
 * included, see neoforge-runtime's SpecWidgetRenderer#renderPlayerPreview /
 * InventoryScreen.extractEntityInInventoryFollowsMouse). The design canvas has no real player
 * entity to render, so this is just a static placeholder like the other non-textured widgets.
 */
export default function PlayerPreviewVisual() {
  return (
    <div style={{
      width: "100%", height: "100%", boxSizing: "border-box",
      border: "1px dashed rgba(120,120,180,0.6)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 2, fontSize: 6, color: "rgba(120,120,180,0.9)",
      fontFamily: '"Minecraft", monospace',
    }}>
      <User size={16} strokeWidth={1.5} />
      <span>player</span>
    </div>
  );
}
