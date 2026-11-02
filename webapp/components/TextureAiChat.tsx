"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { aiClientLabel, aiGenerate, enabledAiClients, useAiSettings, type AiClientId } from "@/lib/aiSettings";
import type { LayerPaintResult } from "@/lib/ai/layerPaint";

interface Turn { role: "user" | "assistant"; text: string; error?: boolean }

/**
 * Texture Editor side chat: ask Claude / Codex to add something to the texture ("add a dragon
 * head silhouette") — it sees the texture and the active layer and paints the pixels onto a new
 * layer (or the active one), one undo step per answer. See lib/ai/layerPaint.
 */
export default function TextureAiChat({ snapshot, onPaint }: {
  /** the texture right now: enlarged images + what the AI needs to know about it */
  snapshot: () => { composite: string; active: string; context: Record<string, unknown> };
  /** applies an answer; returns the name of the layer it went onto */
  onPaint: (res: LayerPaintResult) => string;
}) {
  const settings = useAiSettings();
  const clients = enabledAiClients(settings);
  const [choice, setChoice] = useState<AiClientId | null>(null);
  const ai: AiClientId | undefined = choice && clients.includes(choice) ? choice
    : settings.preferred !== "all" && clients.includes(settings.preferred) ? settings.preferred : clients[0];
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [turns.length, busy]);

  const send = async () => {
    const request = text.trim();
    if (!request || !ai || busy) return;
    setText("");
    const history = turns.filter((t) => !t.error).map(({ role, text: t }) => ({ role, text: t }));
    setTurns((t) => [...t, { role: "user", text: request }]);
    setBusy(true);
    try {
      const snap = snapshot();
      const res = await aiGenerate<LayerPaintResult>(ai, "layerPaint", request, { ...snap.context, history }, [
        { data: snap.composite, label: "Image 1: the whole texture (all visible layers)" },
        { data: snap.active, label: "Image 2: the active layer alone" },
      ]);
      const layer = onPaint(res);
      setTurns((t) => [...t, { role: "assistant", text: `${res.reply || "Done."} → „${layer}“` }]);
    } catch (e) {
      setTurns((t) => [...t, { role: "assistant", text: e instanceof Error ? e.message : String(e), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded border border-input p-2 text-xs" data-testid="texture-ai-chat">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold text-muted-foreground">AI</span>
        {clients.length > 1 && (
          <select aria-label="AI for the texture chat" value={ai} onChange={(e) => setChoice(e.target.value as AiClientId)}
            className="ml-auto h-5 rounded-sm border border-input bg-transparent px-1 text-[10px] [&>option]:bg-popover">
            {clients.map((c) => <option key={c} value={c}>{aiClientLabel(c)}</option>)}
          </select>
        )}
      </div>
      {!ai ? (
        <p className="text-[10px] text-muted-foreground">Enable Claude Code or Codex under Settings → AI to draw with AI.</p>
      ) : (
        <>
          {turns.length > 0 && (
            <div ref={logRef} className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {turns.map((t, i) => (
                <p key={i} className={`rounded-sm px-1.5 py-1 text-[11px] leading-snug ${
                  t.role === "user" ? "self-end bg-primary/15" : t.error ? "bg-destructive/10 text-destructive" : "bg-accent"}`}>
                  {t.text}
                </p>
              ))}
              {busy && <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{aiClientLabel(ai)} is drawing…</p>}
            </div>
          )}
          <div className="flex items-end gap-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              rows={2}
              disabled={busy}
              aria-label="Ask the AI to draw"
              placeholder="z.B. mach mir noch eine Drachenkopf-Silhouette dazu"
              className="min-w-0 flex-1 resize-none rounded-sm border border-input bg-transparent px-1.5 py-1 text-[11px] outline-none focus:border-primary disabled:opacity-60"
            />
            <button type="button" title="Send (Enter)" aria-label="Send" disabled={busy || !text.trim()} onClick={() => void send()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground disabled:opacity-40">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">Draws on a new layer on top (say „auf diese Ebene“ to paint the active one). Ctrl+Z undoes it.</p>
        </>
      )}
    </div>
  );
}
