"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { aiClientLabel, aiGenerate, enabledAiClients, useAiSettings, type AiClientId } from "@/lib/aiSettings";
import { aiToAnimation, animationContext, type AiAnimation } from "@/lib/model3d/aiAnimation";
import type { EntityModel } from "@/lib/model3d/types";
import type { ModelAnimation } from "@/lib/model3d/animation";

/**
 * Animation tab: describe a change ("more bouncy", "add a tail wag", "slower, heavier steps") and
 * Claude / Codex / Ollama rewrite the selected animation — or create one when none is selected.
 * The result replaces the animation in one undo step (Ctrl+Z goes back).
 */
export default function AnimationAiBar({ model, anim, onApply }: {
  model: EntityModel;
  anim: ModelAnimation | null;
  onApply: (next: ModelAnimation, isNew: boolean) => void;
}) {
  const settings = useAiSettings();
  const enabled = enabledAiClients(settings);
  const [client, setClient] = useState<AiClientId | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (enabled.length === 0) {
    return (
      <div className="flex items-center gap-1.5 border-t px-2 py-1 text-[11px] text-muted-foreground" data-testid="animation-ai">
        <Sparkles className="h-3.5 w-3.5" /> Enable Claude, Codex or Ollama in Settings → AI to edit animations with AI.
      </div>
    );
  }
  const target = client && enabled.includes(client) ? client
    : settings.preferred !== "all" && enabled.includes(settings.preferred) ? settings.preferred : enabled[0];

  const submit = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const answer = await aiGenerate<AiAnimation>(target, "animation", text, animationContext(model, anim) as unknown as Record<string, unknown>);
      const next = aiToAnimation(model, answer, anim);
      if (!Object.keys(next.bones).length) throw new Error("The answer didn't animate any of this model's bones.");
      onApply(next, !anim);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 border-t px-2 py-1.5" data-testid="animation-ai">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        {enabled.length > 1 && (
          <select aria-label="AI client" value={target} disabled={busy} onChange={(e) => setClient(e.target.value as AiClientId)}
            className="h-7 shrink-0 rounded-sm border border-input bg-background px-1 text-xs">
            {enabled.map((id) => <option key={id} value={id}>{aiClientLabel(id)}</option>)}
          </select>
        )}
        <input
          aria-label="Animation request"
          className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-background px-2 text-xs"
          placeholder={anim
            ? `Ask ${aiClientLabel(target)} to change "${anim.name}", e.g. "more bouncy", "add a tail wag", "slower, heavier steps"`
            : `Ask ${aiClientLabel(target)} for a new animation, e.g. "a happy idle with the head looking around"`}
          value={prompt}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") void submit(); }}
        />
        <button type="button" onClick={() => void submit()} disabled={busy || !prompt.trim()}
          className="flex h-7 shrink-0 items-center gap-1 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{anim ? "Rewrite" : "Create"}
        </button>
      </div>
      {error && <p className="pl-5 text-[11px] text-destructive" role="alert">{error}</p>}
    </div>
  );
}
