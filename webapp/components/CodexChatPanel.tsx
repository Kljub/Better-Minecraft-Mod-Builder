"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, ImagePlus, Info, Loader2, MessageSquare, Send, Square, Trash2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiClientLabel, setAiClient, useAiSettings } from "@/lib/aiSettings";
import { stopAgentRun, useAgentRun } from "@/lib/ai/modelAgent";
import { chatProviderLabel, clearChat, sendChatMessage, setChatImageStatus, setChatProvider, useChatMessages, useChatProvider, type ChatImage, type ChatProvider } from "@/lib/ai/chatStore";
import { useTextures } from "@/lib/TextureContext";
import { createFolder, moveToFolder, useResourceFolders } from "@/lib/resourceFolders";
import { toast } from "sonner";
import { TOOL_LABELS } from "@/lib/ai/toolLabels";

/** Resources folder approved AI pictures go to. */
const AI_FOLDER = "KI";

const EXAMPLES = [
  "Was ist in meinem Projekt alles drin?",
  "Erstelle ein Rubin-Schwert mit 8 Angriffsschaden",
  "Mach einen Höllenhund-Mob mit Lava-Textur",
  "Zeichne eine 16×16 Pixel-Art-Textur für einen Rubin",
];

/**
 * Codex Chat / Claude Chat — opened from the editor header, docked on the right. Codex or Claude Code
 * (switch in the panel header, remembered per browser) answers
 * and works in the editor through the same mc-designer tools as the Entity Model Generator: every
 * element kind, entity models, animations, screenshots — no access to the source code.
 */
export default function CodexChatPanel({ activeElement, projectKey, onAssignTexture, onClose }: {
  activeElement: { kind: string; id: string } | null;
  projectKey?: string;
  /** sets a pack texture key on a record (built-in collection or element kind); false if it doesn't exist */
  onAssignTexture?: (target: { collection: string; id: string; field: string }, key: string) => boolean;
  onClose: () => void;
}) {
  const settings = useAiSettings();
  const messages = useChatMessages();
  const run = useAgentRun();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const { uploadCustomTexture } = useTextures();
  const { folders } = useResourceFolders();
  /** Approved picture → custom texture in Resources, filed into the "KI" folder. */
  const addImage = async (img: ChatImage) => {
    try {
      const blob = img.size ? await scaledPng(img.dataUrl, img.size) : await (await fetch(img.dataUrl)).blob();
      const key = await uploadCustomTexture(new File([blob], img.name, { type: "image/png" }));
      if (!folders.includes(AI_FOLDER)) createFolder(AI_FOLDER);
      moveToFolder([key], AI_FOLDER);
      setChatImageStatus(img.id, "added", key);
      const assigned = img.assign && onAssignTexture?.(img.assign, key);
      toast.success(`${img.name} added to Resources → ${AI_FOLDER}${assigned ? ` and set as the texture of ${img.assign!.id}` : ""}.`);
      if (img.assign && !assigned) toast.warning(`${img.assign.collection} "${img.assign.id}" not found — the texture wasn't applied.`);
    } catch (e) {
      toast.error(`Couldn't add the image: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const chosen = useChatProvider();
  /** the chosen client, once it's enabled under Settings → AI */
  const provider: ChatProvider | undefined = settings.clients[chosen].enabled ? chosen : undefined;
  const chatRunning = run.running && run.mode === "chat";
  const otherRunning = run.running && run.mode !== "chat";
  const live = chatRunning ? run.log.filter((l) => l.kind === "tool") : [];

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages.length, live.length]);

  const send = (value = text) => {
    const t = value.trim();
    if (!t || !provider || run.running) return;
    setText("");
    void sendChatMessage({ provider, model: settings.clients[provider].model, text: t, activeElement, projectKey });
  };

  return (
    <aside className="flex h-svh w-[380px] shrink-0 flex-col border-l bg-sidebar text-sm" data-testid="codex-chat" aria-label={chatProviderLabel(chosen)}>
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="font-semibold">{chatProviderLabel(chosen)}</span>
        <div className="ml-1 flex rounded-sm border border-input p-px" role="radiogroup" aria-label="Chat AI client">
          {(["codex", "claude"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={chosen === c} disabled={run.running}
              onClick={() => setChatProvider(c)} title={`Chat with ${aiClientLabel(c)}`}
              className={`h-5 rounded-[2px] px-1.5 text-[11px] disabled:opacity-50 ${chosen === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
              {c === "claude" ? "Claude" : "Codex"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 w-6 px-0" title="Clear chat" disabled={run.running} onClick={clearChat}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-6 w-6 px-0" title="Close chat" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!provider ? (
        <div className="m-3 flex flex-col items-start gap-2 rounded-sm border border-input bg-card p-3 text-xs">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span><b>{aiClientLabel(chosen)}</b> is turned off in <b>Settings → AI</b> (gear at the bottom of the sidebar). It needs the <code>{chosen}</code> CLI installed and logged in on this computer.</span>
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={() => setAiClient(chosen, { enabled: true })}>Enable {aiClientLabel(chosen)}</Button>
        </div>
      ) : (
        <>
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2" data-testid="codex-chat-messages">
            {messages.length === 0 && !chatRunning && (
              <div className="flex flex-col gap-2 p-2 text-xs text-muted-foreground">
                <p>
                  Ask about your project or let {provider ? aiClientLabel(provider) : "the AI"}{" "}do things in the editor — create and change items, blocks,
                  mobs, loot, recipes and every other element. It works through the editor&apos;s features only, not the source code. Every change can be undone (Ctrl+Z).
                </p>
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => send(ex)} disabled={run.running}
                    className="rounded-sm border border-input px-2 py-1 text-left text-[11px] hover:border-foreground/40 hover:text-foreground disabled:opacity-50">
                    {ex}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[92%] whitespace-pre-wrap break-words rounded-md px-2.5 py-1.5 text-[13px] leading-snug ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : m.error ? "border border-destructive/50 bg-card text-destructive" : "bg-card text-foreground"}`}>
                  {m.role === "assistant" ? <InlineMarkdown text={m.text} /> : m.text}
                </div>
                {m.images && m.images.length > 0 && (
                  <div className="flex max-w-[92%] flex-wrap gap-2" data-testid="codex-chat-images">
                    {m.images.map((img) => (
                      <div key={img.id} className="flex w-[150px] flex-col gap-1 rounded-md border border-input bg-card p-1.5">
                        {img.dataUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={img.dataUrl} alt={img.name} className="aspect-square w-full rounded-sm bg-[var(--rail)] object-contain" style={{ imageRendering: "pixelated" }} />
                          : <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-sm bg-[var(--rail)] px-1 text-center text-[10px] text-muted-foreground">
                              {img.status === "generating" ? <><Loader2 className="h-4 w-4 animate-spin text-primary" />Drawing… (~1 min)</>
                                : img.status === "failed" ? <span className="text-destructive">Failed{img.error ? `: ${img.error.slice(0, 80)}` : ""}</span>
                                : "not kept after reload"}
                            </div>}
                        <span className="truncate text-[10px] text-muted-foreground" title={img.name}>
                          {img.name}{img.size ? ` · ${img.size}×${img.size}` : ""}{img.assign ? ` → ${img.assign.id}` : ""}
                        </span>
                        {img.status === "pending" && img.dataUrl ? (
                          <div className="flex gap-1">
                            <Button size="sm" className="h-6 flex-1 gap-1 px-1 text-[10px]" onClick={() => void addImage(img)} title={`Add to Resources, folder ${AI_FOLDER}`}>
                              <ImagePlus className="h-3 w-3" /> Add
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => setChatImageStatus(img.id, "discarded")} title="Discard">
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : img.status === "added" ? (
                          <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400"><Check className="h-3 w-3" /> In Resources · {AI_FOLDER}</span>
                        ) : img.status === "discarded" ? (
                          <span className="text-[10px] text-muted-foreground">Discarded</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                {m.tools && m.tools.length > 0 && (
                  <details className="max-w-[92%] text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer select-none">{m.tools.length} editor action{m.tools.length === 1 ? "" : "s"}</summary>
                    <ul className="mt-0.5 flex flex-col gap-0.5 pl-3">
                      {m.tools.map((t, j) => <li key={j} className="flex items-center gap-1"><Wrench className="h-3 w-3 shrink-0 text-primary" />{TOOL_LABELS[t] ?? t}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            ))}
            {chatRunning && (
              <div className="flex flex-col gap-0.5 rounded-md bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground" data-testid="codex-chat-working">
                {live.slice(-6).map((l, i) => <span key={i} className="flex items-center gap-1"><Wrench className="h-3 w-3 shrink-0 text-primary" />{TOOL_LABELS[l.text] ?? l.text}</span>)}
                <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />{run.port ? "Working…" : "Starting…"}</span>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t p-2">
            {otherRunning && (
              <p className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Bot className="h-3 w-3" />The Entity Model Generator is running — wait until it&apos;s done.</p>
            )}
            <div className="flex items-end gap-1.5">
              <textarea
                aria-label="Chat message"
                rows={2}
                value={text}
                disabled={!provider}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={`Message ${provider ? aiClientLabel(provider) : ""}… (Enter to send, Shift+Enter for a new line)`}
                className="min-h-[38px] flex-1 resize-y rounded-sm border border-input bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary"
              />
              {chatRunning ? (
                <Button size="sm" variant="destructive" className="h-8 w-8 px-0" title="Stop" onClick={stopAgentRun}><Square className="h-3.5 w-3.5" /></Button>
              ) : (
                <Button size="sm" className="h-8 w-8 px-0" title="Send" disabled={!text.trim() || run.running} onClick={() => send()}><Send className="h-3.5 w-3.5" /></Button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

/** The little Markdown chat answers use: **bold** and `code` (everything else stays plain text). */
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") && p.length > 4
        ? <b key={i}>{p.slice(2, -2)}</b>
        : p.startsWith("`") && p.endsWith("`") && p.length > 2
          ? <code key={i} className="rounded-sm bg-background/60 px-1 font-mono text-[12px]">{p.slice(1, -1)}</code>
          : p))}
    </>
  );
}

/** Downscales a generated picture to a square texture (stepwise halving keeps it clean, no blur at the end). */
async function scaledPng(dataUrl: string, size: number): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  let canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  while (canvas.width / 2 >= size) {
    const next = document.createElement("canvas");
    next.width = Math.max(size, Math.round(canvas.width / 2));
    next.height = Math.max(size, Math.round(canvas.height / 2));
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
  }
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, size, size);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}
