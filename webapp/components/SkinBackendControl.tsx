"use client";

import { useCallback, useEffect, useState } from "react";
import { Cpu, Cloud, Play, Square, ScrollText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type SkinBackend = "local" | "space";

interface LocalStatus {
  installed: boolean;
  running: boolean;
  reachable: boolean;
  device: { device: string; model: string; dtype: string } | null;
  exitCode: number | null;
  logs: string[];
  url: string;
}

const STORAGE_KEY = "mc-ui-builder:skin-backend";

export function loadSkinBackend(): SkinBackend {
  try { return localStorage.getItem(STORAGE_KEY) === "space" ? "space" : "local"; } catch { return "local"; }
}

/**
 * Header controls of the Item Skin Generator: pick where the model runs, and for the local
 * backend (tools/skin-generator/server.py) see its state, start/stop it and read its log.
 */
export default function SkinBackendControl({ backend, onBackend, localOnly = false }: {
  backend: SkinBackend;
  onBackend: (b: SkinBackend) => void;
  /** only the local server can do this tab's work — no backend switch, just its controls */
  localOnly?: boolean;
}) {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const refresh = useCallback(async (init?: RequestInit) => {
    try {
      const res = await fetch("/api/skin/local", init);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus(data as LocalStatus);
      setStatusError(null);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const starting = !!status?.running && !status.reachable;
  useEffect(() => {
    if (backend !== "local") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polls an external process; setState only runs after the fetch resolves
    void refresh();
    // fast while the model loads, slow otherwise (catches a server started/stopped by hand)
    const id = setInterval(() => void refresh(), starting ? 1500 : 8000);
    return () => clearInterval(id);
  }, [backend, starting, refresh]);

  const act = async (action: "start" | "stop") => {
    setPending(true);
    try {
      const res = await fetch("/api/skin/local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus(data as LocalStatus);
      if (action === "start") setShowLog(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const pick = (b: SkinBackend) => {
    try { localStorage.setItem(STORAGE_KEY, b); } catch { /* per-browser convenience only */ }
    onBackend(b);
  };

  // dot colour + text for the local server's state
  const [dot, label] = statusError ? ["bg-destructive", statusError]
    : !status ? ["bg-muted-foreground", "checking…"]
    : !status.installed && !status.reachable ? ["bg-destructive", "not installed — see tools/skin-generator/README.md"]
    : status.reachable ? ["bg-green-500", `ready · ${status.device?.device ?? status.url}${status.running ? "" : " (started outside the app)"}`]
    : status.running ? ["bg-amber-500 animate-pulse", "loading model…"]
    : status.exitCode !== null && status.exitCode !== 0 ? ["bg-destructive", `crashed (exit ${status.exitCode}) — see log`]
    : ["bg-muted-foreground", "stopped"];

  const seg = (b: SkinBackend, icon: React.ReactNode, text: string, title: string) => (
    <button
      type="button"
      title={title}
      onClick={() => pick(b)}
      className={`flex h-6 items-center gap-1 rounded-sm px-2 text-[11px] ${backend === b ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
    >
      {icon}{text}
    </button>
  );

  return (
    <>
      <div className="ml-auto flex items-center gap-2" data-testid="skin-backend">
        {backend === "local" && (
          <>
            <span className="flex max-w-80 items-center gap-1.5 truncate text-[11px] text-muted-foreground" title={label}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <span className="truncate">{label}</span>
            </span>
            {status?.running ? (
              <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" disabled={pending} onClick={() => void act("stop")}>
                <Square className="h-3 w-3" /> Stop
              </Button>
            ) : !status?.reachable && (
              <Button size="sm" className="h-6 gap-1 px-2 text-[11px]" disabled={pending || !status?.installed} onClick={() => void act("start")}>
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Start
              </Button>
            )}
            <Button variant="ghost" size="sm" className={`h-6 w-6 p-0 ${showLog ? "text-primary" : ""}`} title="Server log" onClick={() => setShowLog((v) => !v)}>
              <ScrollText className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {!localOnly && <div className="flex gap-0.5 rounded-sm border p-0.5">
          {seg("local", <Cpu className="h-3 w-3" />, "Local GPU", "Run the model on this machine (tools/skin-generator)")}
          {seg("space", <Cloud className="h-3 w-3" />, "HF Space", "Public Hugging Face demo Space — shared GPU quota")}
        </div>}
      </div>
      {backend === "local" && showLog && (
        <pre className="absolute inset-x-0 top-10 z-20 max-h-60 overflow-auto border-b bg-[var(--rail)] p-2 font-mono text-[10px] leading-tight text-muted-foreground shadow-md">
          {status?.logs.length ? status.logs.join("\n") : "No output yet. Start the server to see its log here."}
        </pre>
      )}
    </>
  );
}
