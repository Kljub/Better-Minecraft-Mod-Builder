"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AI_CLIENTS, setAiClient, setAiPreferred, useAiSettings, enabledAiClients, aiClientLabel, fetchAiStatus,
  type AiCliStatus, type AiClientId,
} from "@/lib/aiSettings";

/** Settings → AI: enable any mix of local AI clients (Claude Code, Codex, Ollama) that answer
 * "✨ AI" requests in the editor (e.g. "attributes for a hell sword" in an item's Attributes list).
 * With several enabled, the editor lets you pick one per request or ask all and compare. */
export default function AiSettingsTab() {
  const settings = useAiSettings();
  const enabled = enabledAiClients(settings);
  const [status, setStatus] = useState<Record<AiClientId, AiCliStatus> | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const load = () =>
    fetchAiStatus()
      .then((s) => { setStatus(s); setStatusError(null); })
      .catch((e) => { setStatus(null); setStatusError(e instanceof Error ? e.message : String(e)); })
      .finally(() => setChecking(false));
  const check = () => { setChecking(true); load(); };
  useEffect(() => { load(); }, []);

  return (
    <div className="flex flex-col gap-5 py-2">
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clients</p>
        <div className="flex flex-col gap-1.5">
          {AI_CLIENTS.map((c) => {
            const s = status?.[c.id];
            const cfg = settings.clients[c.id];
            const models = s?.models ?? [];
            return (
              <div
                key={c.id}
                className={`flex flex-col gap-1.5 rounded border p-2 ${cfg.enabled ? "border-foreground/50 bg-muted/50" : "border-input"}`}
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={cfg.enabled}
                    onChange={(e) => setAiClient(c.id, { enabled: e.target.checked })}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{c.label}</span>
                      {s && (
                        <span className={`text-[10px] ${s.available ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                          {s.available ? s.version : c.id === "ollama" ? "not running" : "not found"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{c.hint}</p>
                  </div>
                </label>
                {cfg.enabled && (
                  c.id === "ollama" && models.length > 0 ? (
                    <select
                      aria-label="Ollama model"
                      className="h-7 rounded border border-input bg-background px-1.5 text-xs"
                      value={cfg.model}
                      onChange={(e) => setAiClient(c.id, { model: e.target.value })}
                    >
                      <option value="">Default ({models[0]})</option>
                      {models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <Input
                      aria-label={`${c.label} model`}
                      className="h-7 text-xs"
                      placeholder={`Model (optional) — ${c.modelHint}`}
                      value={cfg.model}
                      onChange={(e) => setAiClient(c.id, { model: e.target.value })}
                    />
                  )
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground min-w-0">
            {statusError ?? "Runs on the machine hosting the dev server, not in the browser."}
          </p>
          <Button size="sm" variant="outline" onClick={check} disabled={checking} className="shrink-0">
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check"}
          </Button>
        </div>
      </section>

      {enabled.length > 1 && (
        <section className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Default in editor</p>
          <select
            aria-label="Default AI client"
            className="h-8 rounded border border-input bg-background px-2 text-sm"
            value={settings.preferred === "all" || enabled.includes(settings.preferred) ? settings.preferred : enabled[0]}
            onChange={(e) => setAiPreferred(e.target.value as AiClientId | "all")}
          >
            {enabled.map((id) => <option key={id} value={id}>{aiClientLabel(id)}</option>)}
            <option value="all">All — compare answers</option>
          </select>
          <p className="text-xs text-muted-foreground">Can still be switched per request next to the prompt.</p>
        </section>
      )}
    </div>
  );
}
