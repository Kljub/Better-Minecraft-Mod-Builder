"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Browser side of the MCP bridge (webapp/mcp/server.mjs): long-polls the local MCP server for
 * commands, runs them in the editor and posts the results. Opt-in per browser ("AI bridge" switch
 * in the status bar).
 */
const KEY = "mc-ui-builder:mcp-bridge";
const listeners = new Set<() => void>();
let enabledCache: boolean | null = null;

function readEnabled(): boolean {
  if (enabledCache === null) {
    try { enabledCache = localStorage.getItem(KEY) === "on"; } catch { enabledCache = false; }
  }
  return enabledCache;
}

export function setBridgeEnabled(on: boolean) {
  enabledCache = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

export function useBridgeEnabled(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, readEnabled, () => false);
}

export type BridgeStatus = "off" | "connecting" | "connected" | "busy";

export interface BridgeCommand { id: string; tool: string; args: Record<string, unknown> }

/** Runs the poll loop while `enabled`; returns its live status and the last tool it ran. */
export function useMcpBridge(enabled: boolean, port: number, execute: (cmd: BridgeCommand) => Promise<unknown>, info: () => Record<string, unknown>) {
  const [status, setStatus] = useState<BridgeStatus>("connecting");
  const [lastTool, setLastTool] = useState<string | null>(null);
  const exec = useRef(execute);
  const getInfo = useRef(info);
  useEffect(() => { exec.current = execute; getInfo.current = info; });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const ctrl = new AbortController();
    const base = `http://127.0.0.1:${port}`;
    (async () => {
      let failures = 0;
      let reachable = false;
      while (!stopped) {
        try {
          // A cheap ping first so the status turns green right away (the poll itself may be held for ~25 s).
          if (!reachable) {
            const ping = await fetch(`${base}/ping`, { signal: ctrl.signal, cache: "no-store" });
            if (!ping.ok) throw new Error("bridge not reachable");
            reachable = true;
            setStatus("connected");
          }
          const res = await fetch(`${base}/poll?info=${encodeURIComponent(JSON.stringify(getInfo.current()))}`, { signal: ctrl.signal, cache: "no-store" });
          failures = 0;
          setStatus("connected");
          if (res.status === 204) continue;
          const cmd = (await res.json()) as BridgeCommand;
          setStatus("busy");
          setLastTool(cmd.tool);
          let body: Record<string, unknown>;
          try { body = { id: cmd.id, ok: true, result: await exec.current(cmd) }; }
          catch (err) { body = { id: cmd.id, ok: false, error: err instanceof Error ? err.message : String(err) }; }
          await fetch(`${base}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
          setStatus("connected");
        } catch {
          if (stopped) return;
          reachable = false;
          failures++;
          setStatus("connecting");
          await new Promise((r) => setTimeout(r, Math.min(10_000, 1000 * failures)));
        }
      }
    })();
    return () => { stopped = true; ctrl.abort(); };
  }, [enabled, port]);

  return { status: enabled ? status : ("off" as BridgeStatus), lastTool };
}
