"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Download, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/components/AuthGate";
import { copyToClipboard } from "@/lib/utils";

/**
 * Settings → AI → Minecraft mod: tokens for the companion mod (companion-mod/), which talks to this
 * server by domain / IP — /mmb generate asks Claude/Codex for a structure, places it and uploads the
 * .nbt, which then shows up in the open project's Structures tab.
 */
interface TokenView { id: number; label: string; createdAt: number; lastUsedAt: number | null }
interface JarView { mc: string; file: string | null; size: number }

const fmt = (ms: number) => new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export default function ModTokensPanel() {
  const user = useAccount();
  const [tokens, setTokens] = useState<TokenView[] | null>(null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jars, setJars] = useState<JarView[] | null>(null);

  const load = useCallback(() => {
    call("/api/mod/tokens").then((b) => { setTokens(b.tokens); setError(null); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    // Initial list; load() only sets state once its fetch resolves.
    if (user) load();
  }, [user, load]);
  useEffect(() => {
    // Which companion-mod jars this server has built; state is set once the fetch resolves.
    fetch("/api/mod/download", { cache: "no-store" }).then((r) => r.json()).then((b) => setJars(b.versions ?? [])).catch(() => setJars([]));
  }, []);

  if (!user) return <p className="text-xs text-muted-foreground">Log in to connect the Minecraft mod.</p>;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const command = fresh ? `/mmb connect ${origin} ${fresh}` : "";

  const create = async () => {
    setBusy(true);
    try { setFresh((await call("/api/mod/tokens", { method: "POST", body: JSON.stringify({ label: label.trim() }) })).token); setLabel(""); setError(null); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
    load();
  };
  const revoke = async (id: number) => {
    try { await call(`/api/mod/tokens?id=${id}`, { method: "DELETE" }); } catch (e) { setError((e as Error).message); }
    load();
  };

  return (
    <div className="flex flex-col gap-2" data-testid="mod-tokens">
      <p className="text-xs text-muted-foreground">
        The companion mod (<code>companion-mod/</code>) generates structures in-game with your linked Claude / Codex accounts
        (<code>/mmb generate a small watchtower</code>) and uploads the <code>.nbt</code> — it lands in the open project&apos;s
        Structures tab, folder &quot;From Minecraft&quot;.
      </p>
      <div className="flex flex-wrap items-center gap-2" data-testid="mod-downloads">
        <span className="text-xs">1. Download the mod:</span>
        {(jars ?? []).map((j) => j.file ? (
          <a key={j.mc} href={`/api/mod/download?mc=${j.mc}`} download className="inline-flex h-7 items-center gap-1 rounded-sm border border-input px-2 text-xs hover:bg-accent">
            <Download className="h-3.5 w-3.5" /> Minecraft {j.mc} <span className="text-muted-foreground">({Math.round(j.size / 1024)} KB)</span>
          </a>
        ) : (
          <span key={j.mc} className="text-[11px] text-muted-foreground" title={`In companion-mod/: ./gradlew build${j.mc === "26.2" ? "" : ` -Pmc=${j.mc}`}`}>
            {j.mc}: not built on this server
          </span>
        ))}
        <span className="text-[11px] text-muted-foreground">→ into your <code>mods/</code> folder (NeoForge)</span>
      </div>
      <p className="text-xs">2. Create a token, then run the command it shows in Minecraft:</p>
      <div className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name, e.g. My PC" aria-label="Token name" className="h-8 text-xs" />
        <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs" disabled={busy} onClick={create}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create token
        </Button>
      </div>
      {fresh && (
        <div className="flex flex-col gap-1 rounded-sm border border-primary/50 bg-primary/5 p-2 text-xs" data-testid="mod-token-fresh">
          <span>Shown only once — run this in Minecraft (single player or as an op):</span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-background px-1.5 py-1 font-mono text-[11px]">{command}</code>
            <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" title="Copy" onClick={() => void copyToClipboard(command)}><Copy className="h-3.5 w-3.5" /></Button>
          </div>
          <span className="text-muted-foreground">If Minecraft runs on another machine, use this server&apos;s LAN IP or domain instead of {origin}.</span>
        </div>
      )}
      {tokens?.map((t) => (
        <div key={t.id} className="flex items-center gap-2 rounded-sm border border-input px-2 py-1 text-xs">
          <span className="flex-1 truncate">{t.label}</span>
          <span className="text-muted-foreground">created {fmt(t.createdAt)}{t.lastUsedAt ? ` · used ${fmt(t.lastUsedAt)}` : " · never used"}</span>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Revoke" aria-label={`Revoke ${t.label}`} onClick={() => void revoke(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
      {error && <p className="text-[11px] text-destructive" role="alert">{error}</p>}
    </div>
  );
}
