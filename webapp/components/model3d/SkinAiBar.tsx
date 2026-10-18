"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { aiClientLabel, aiGenerate, enabledAiClients, useAiSettings, type AiClientId } from "@/lib/aiSettings";
import { skinContext, type AiSkin } from "@/lib/model3d/aiSkin";
import type { EntityModel } from "@/lib/model3d/types";

/**
 * Skin tab: describe the look ("lava hound, dark red with glowing cracks") and Claude / Codex /
 * Ollama answer with a palette and face details, which the skin painter then paints (one undo step).
 */
export default function SkinAiBar({ model, onApply }: { model: EntityModel; onApply: (skin: AiSkin) => Promise<void> }) {
  const settings = useAiSettings();
  const enabled = enabledAiClients(settings);
  const [client, setClient] = useState<AiClientId | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (enabled.length === 0) {
    return (
      <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground" data-testid="skin-ai">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Enable Codex, Claude or Ollama in Settings → AI to paint the skin with AI.
      </div>
    );
  }
  const target = client && enabled.includes(client) ? client
    : settings.preferred !== "all" && enabled.includes(settings.preferred) ? settings.preferred : enabled[0];

  const submit = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    if (!model.cubes.length) { setError("The model has no cubes yet."); return; }
    setBusy(true);
    setError(null);
    try {
      const skin = await aiGenerate<AiSkin>(target, "skin", text, skinContext(model) as unknown as Record<string, unknown>);
      await onApply(skin);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid="skin-ai">
      <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-primary" /> AI skin</div>
      {enabled.length > 1 && (
        <select aria-label="AI client" value={target} disabled={busy} onChange={(e) => setClient(e.target.value as AiClientId)}
          className="h-7 rounded-sm border border-input bg-background px-1 text-xs">
          {enabled.map((id) => <option key={id} value={id}>{aiClientLabel(id)}</option>)}
        </select>
      )}
      <textarea
        aria-label="Skin request"
        rows={3}
        className="resize-y rounded-sm border border-input bg-background px-2 py-1 text-xs"
        placeholder={`Ask ${aiClientLabel(target)}, e.g. "lava hound: dark red, glowing orange cracks, yellow eyes"`}
        value={prompt}
        disabled={busy}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(); }}
      />
      <button type="button" onClick={() => void submit()} disabled={busy || !prompt.trim()}
        className="flex h-7 items-center justify-center gap-1 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? `${aiClientLabel(target)} is painting…` : `Paint with ${aiClientLabel(target)}`}
      </button>
      {error && <span className="text-[11px] text-destructive" role="alert">{error}</span>}
    </div>
  );
}
