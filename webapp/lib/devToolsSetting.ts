"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Whether the Next.js dev-tools badge (bottom corner, dev server only) is shown — toggled in
 * Settings → General instead of always floating over the editor. The badge lives in a
 * <nextjs-portal> element Next injects at runtime, so hiding it is a plain style rule; no restart
 * or next.config change needed. Per browser.
 */
const STORAGE_KEY = "mc-ui-builder:show-next-devtools";
const STYLE_ID = "mc-ui-builder-hide-next-devtools";

let visible = true;
let loaded = false;
const listeners = new Set<() => void>();

function load(): boolean {
  if (loaded) return visible;
  loaded = true;
  try { visible = localStorage.getItem(STORAGE_KEY) !== "false"; } catch { /* storage unavailable */ }
  return visible;
}

export function setNextDevToolsVisible(next: boolean) {
  visible = next;
  try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* storage unavailable — keep in memory */ }
  listeners.forEach((l) => l());
}

export function useNextDevToolsVisible(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    load,
    () => true,
  );
}

/** Mounted once in the root layout — keeps the hide rule in sync with the setting. */
export function NextDevToolsVisibility() {
  const show = useNextDevToolsVisible();
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let style = document.getElementById(STYLE_ID);
    if (show) { style?.remove(); return; }
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.appendChild(style);
    }
  }, [show]);
  return null;
}
