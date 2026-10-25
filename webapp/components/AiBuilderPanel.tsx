"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Hammer, ImagePlus, Info, Loader2, MessageSquarePlus, Paperclip, Pencil, Square, Trash2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiClientLabel, setAiClient, useAiSettings } from "@/lib/aiSettings";
import { stopAgentRun, useAgentRun } from "@/lib/ai/modelAgent";
import {
  chatProviderLabel, deleteConversation, newConversation, openConversation, renameConversation, sendChatMessage, setChatImageStatus,
  setChatProvider, useActiveConversationId, useChatProvider, useConversations, type ChatImage, type ChatMessage, type ChatProvider,
} from "@/lib/ai/chatStore";
import { useTextures } from "@/lib/TextureContext";
import { createFolder, moveToFolder, useResourceFolders } from "@/lib/resourceFolders";
import { referenceImage } from "@/components/EntityModelGeneratorPanel";
import { toast } from "sonner";
import { TOOL_LABELS } from "@/lib/ai/toolLabels";

/** Resources folder approved AI pictures go to. */
const AI_FOLDER = "KI";
const MAX_IMAGES = 8;
const EMPTY_MESSAGES: ChatMessage[] = [];

/** Brief skeletons the user fills in — the more precise, the closer the result. */
const TEMPLATES: { label: string; text: string }[] = [
  { label: "Item", text: "Item: \n- Name: \n- Type (sword, tool, food, ingredient …): \n- Stats (damage, speed, durability, food value …): \n- Looks / texture: \n- Crafting recipe: \n- Creative tab: \n- Special behaviour: " },
  { label: "Block", text: "Block: \n- Name: \n- Material / sound / hardness: \n- Looks / texture (all sides or per side): \n- Drops (loot): \n- Crafting recipe: \n- Light level / special behaviour: " },
  { label: "Mob", text: "Mob: \n- Name: \n- Body shape and size (blocks high): \n- Colours / texture details: \n- Held item / armour: \n- Animations (idle, walk, attack …): \n- Health, speed, damage, hostile or peaceful: \n- Spawning (biomes, time, group size): \n- Drops: " },
  { label: "Armor set", text: "Armor set: \n- Name / material: \n- Pieces (helmet, chestplate, leggings, boots): \n- Protection, toughness, durability: \n- Looks / colours: \n- Crafting recipes: \n- Set bonus / effects: " },
  { label: "Structure", text: "Structure: \n- What it is (house, dungeon, ruin …): \n- Size and materials: \n- Rooms / layout: \n- Loot chests (what inside): \n- Where it generates: " },
];

const EXAMPLES = [
  "Was ist in meinem Projekt alles drin?",
  "Item: Rubin-Schwert\n- 8 Angriffsschaden, Haltbarkeit 1200\n- rote Klinge mit goldenem Griff\n- Rezept: 2 Rubine + 1 Stock wie ein Eisenschwert\n- Rechtsklick: Feuerball, 5 s Abklingzeit",
  "Mob: Höllenhund\n- Hund mit Lava-Textur, glühende Augen, ca. 1 Block hoch\n- feindlich, 30 Leben, schnell, setzt Ziele in Brand\n- spawnt im Nether in Gruppen von 2–4\n- droppt 0–2 Höllenhund-Zähne (neues Item)",
];

/**
 * AI Builder tab: describe precisely what you want — items, blocks, mobs, armor, structures,
 * recipes, anything — and Codex or Claude Code (switch in the header, remembered per browser)
 * builds it in the editor through the mc-designer tools, including the full Entity Model
 * Generator workflow for mobs. Conversations are saved (lib/ai/chatStore) and the project's
 * earlier ones go along as the builder's memory. No access to the source code.
 */
export default function AiBuilderPanel({ activeElement, projectKey, onAssignTexture }: {
  activeElement: { kind: string; id: string } | null;
  projectKey?: string;
  /** sets a pack texture key on a record (built-in collection or element kind); false if it doesn't exist */
  onAssignTexture?: (target: { collection: string; id: string; field: string }, key: string) => boolean;
}) {
  const settings = useAiSettings();
  const all = useConversations();
  const conversations = all.filter((c) => !c.projectKey || !projectKey || c.projectKey === projectKey);
  const activeId = useActiveConversationId();
  const active = conversations.find((c) => c.id === activeId);
  const messages = active?.messages ?? EMPTY_MESSAGES;
  const run = useAgentRun();
  const [text, setText] = useState("");
  const [images, setImages] = useState<{ dataUrl: string; name: string }[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
  const takeImages = (files: Iterable<File> | null | undefined) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, MAX_IMAGES - images.length);
    void Promise.all(list.map((f) => referenceImage(f).then((dataUrl) => ({ dataUrl, name: f.name || "pasted image" }))))
      .then((add) => setImages((prev) => [...prev, ...add].slice(0, MAX_IMAGES)))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  };
  const chosen = useChatProvider();
  /** the chosen client, once it's enabled under Settings → AI */
  const provider: ChatProvider | undefined = settings.clients[chosen].enabled ? chosen : undefined;
  const chatRunning = run.running && run.mode === "chat";
  const otherRunning = run.running && run.mode !== "chat";
  const live = chatRunning ? run.log.filter((l) => l.kind === "tool") : [];

  // The open conversation belongs to another project — start a new one here.
  useEffect(() => { if (activeId && !active && !run.running) newConversation(); }, [activeId, active, run.running]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages.length, live.length, activeId]);

  const send = () => {
    const t = text.trim();
    if (!t || !provider || run.running) return;
    setText("");
    setImages([]);
    void sendChatMessage({
      provider, model: settings.clients[provider].model, text: t, activeElement, projectKey,
      images: images.length ? images.map((img, i) => ({ data: img.dataUrl, view: images.length > 1 ? `reference ${i + 1}` : "", name: img.name })) : undefined,
    });
  };
  const insert = (snippet: string) => {
    setText((t) => (t.trim() ? `${t.trimEnd()}\n\n${snippet}` : snippet));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex min-h-0 flex-1 bg-background text-sm" data-testid="codex-chat" aria-label={chatProviderLabel(chosen)}>
      {/* ── Saved conversations ── */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r bg-sidebar" aria-label="Conversations">
        <div className="flex h-9 shrink-0 items-center border-b px-2">
          <Button variant="ghost" size="sm" className="h-7 w-full justify-start gap-1.5 px-2 text-xs" disabled={run.running} onClick={newConversation}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> New conversation
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-1" data-testid="ai-conversations">
          {conversations.length === 0 && <p className="p-2 text-[11px] text-muted-foreground">Saved conversations show up here.</p>}
          {conversations.map((c) => (
            <div key={c.id} className={`group flex items-center gap-1 rounded-sm px-1.5 py-1 ${c.id === activeId ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"}`}>
              {renaming === c.id ? (
                <input autoFocus defaultValue={c.title} aria-label="Conversation name"
                  className="h-6 min-w-0 flex-1 rounded-sm border border-input bg-background px-1 text-xs outline-none focus:border-primary"
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }}
                  onBlur={(e) => { renameConversation(c.id, e.currentTarget.value); setRenaming(null); }} />
              ) : (
                <button type="button" disabled={run.running} onClick={() => openConversation(c.id)} className="flex min-w-0 flex-1 flex-col items-start text-left disabled:cursor-not-allowed">
                  <span className="w-full truncate text-xs" title={c.title}>{c.title}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(c.updatedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })} · {c.messages.length} msg</span>
                </button>
              )}
              <button type="button" title="Rename" className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-accent group-hover:flex" onClick={() => setRenaming(c.id)}>
                <Pencil className="h-3 w-3" />
              </button>
              <button type="button" title="Delete conversation" disabled={run.running}
                className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-destructive hover:text-white group-hover:flex disabled:opacity-50"
                onClick={() => { if (confirm(`Delete “${c.title}”?`)) deleteConversation(c.id); }}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-1.5 border-b bg-sidebar px-3">
          <Hammer className="h-4 w-4 text-primary" />
          <span className="font-semibold">{chatProviderLabel(chosen)}</span>
          <div className="ml-1 flex rounded-sm border border-input p-px" role="radiogroup" aria-label="Builder AI client">
            {(["codex", "claude"] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={chosen === c} disabled={run.running}
                onClick={() => setChatProvider(c)} title={`Build with ${aiClientLabel(c)}`}
                className={`h-5 rounded-[2px] px-1.5 text-[11px] disabled:opacity-50 ${chosen === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                {c === "claude" ? "Claude" : "Codex"}
              </button>
            ))}
          </div>
          <span className="ml-2 truncate text-xs text-muted-foreground">{active?.title ?? "New conversation"}</span>
        </div>

        {!provider ? (
          <div className="m-4 flex max-w-xl flex-col items-start gap-2 rounded-sm border border-input bg-card p-3 text-xs">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span><b>{aiClientLabel(chosen)}</b> is turned off in <b>Settings → AI</b> (gear at the bottom of the sidebar). It needs the <code>{chosen}</code> CLI installed and logged in on this computer.</span>
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={() => setAiClient(chosen, { enabled: true })}>Enable {aiClientLabel(chosen)}</Button>
          </div>
        ) : (
          <>
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto" data-testid="codex-chat-messages">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
                {messages.length === 0 && !chatRunning && (
                  <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                    <p className="text-sm text-foreground">Describe exactly what you want — {aiClientLabel(provider)} builds it.</p>
                    <p>
                      Items, blocks, mobs (model, texture, animations), armor, recipes, loot, structures and every other element.
                      The more precise the brief — names, numbers, colours, behaviour, recipes, drops — the closer the result. Attach
                      reference pictures for looks. Earlier conversations of this project are remembered. Every change can be undone (Ctrl+Z).
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {EXAMPLES.map((ex) => (
                        <button key={ex} type="button" onClick={() => insert(ex)} disabled={run.running}
                          className="whitespace-pre-wrap rounded-sm border border-input px-2 py-1.5 text-left text-[11px] hover:border-foreground/40 hover:text-foreground disabled:opacity-50">
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-[13px] leading-snug ${
                      m.role === "user" ? "bg-primary text-primary-foreground" : m.error ? "border border-destructive/50 bg-card text-destructive" : "bg-card text-foreground"}`}>
                      {m.role === "assistant" ? <InlineMarkdown text={m.text} /> : m.text}
                    </div>
                    {m.attachments && m.attachments.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Paperclip className="h-3 w-3" />{m.attachments.join(", ")}</span>
                    )}
                    {m.images && m.images.length > 0 && (
                      <div className="flex max-w-[88%] flex-wrap gap-2" data-testid="codex-chat-images">
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
                      <details className="max-w-[88%] text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer select-none">{m.tools.length} editor action{m.tools.length === 1 ? "" : "s"}</summary>
                        <ul className="mt-0.5 flex flex-col gap-0.5 pl-3">
                          {m.tools.map((t, j) => <li key={j} className="flex items-center gap-1"><Wrench className="h-3 w-3 shrink-0 text-primary" />{TOOL_LABELS[t] ?? t}</li>)}
                        </ul>
                      </details>
                    )}
                  </div>
                ))}
                {chatRunning && (
                  <div className="flex flex-col gap-0.5 rounded-md bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid="codex-chat-working">
                    {live.slice(-10).map((l, i) => <span key={i} className="flex items-center gap-1"><Wrench className="h-3 w-3 shrink-0 text-primary" />{TOOL_LABELS[l.text] ?? l.text}</span>)}
                    <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />{run.port ? `Building… (${live.length} action${live.length === 1 ? "" : "s"})` : "Starting…"}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t bg-sidebar">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 p-3">
                {otherRunning && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Bot className="h-3 w-3" />The Entity Model Generator is running — wait until it&apos;s done.</p>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-[11px] text-muted-foreground">Add to brief:</span>
                  {TEMPLATES.map((t) => (
                    <button key={t.label} type="button" onClick={() => insert(t.text)}
                      className="h-6 rounded-sm border border-input px-2 text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground">
                      + {t.label}
                    </button>
                  ))}
                </div>
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid="ai-builder-attachments">
                    {images.map((img, i) => (
                      <div key={i} className="relative h-14 w-14 rounded-sm border border-input bg-card">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.dataUrl} alt={img.name} title={img.name} className="h-full w-full rounded-sm object-contain" />
                        <button type="button" title="Remove picture" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  aria-label="Chat message"
                  rows={7}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
                  onPaste={(e) => { const f = [...e.clipboardData.files].filter((x) => x.type.startsWith("image/")); if (f.length) { e.preventDefault(); takeImages(f); } }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); takeImages(e.dataTransfer.files); } }}
                  placeholder={`Describe exactly what ${aiClientLabel(provider)} should build — names, numbers, looks, behaviour, recipes, drops … or ask a question about the project.`}
                  className="min-h-[120px] w-full resize-y rounded-sm border border-input bg-background px-2.5 py-2 text-[13px] leading-snug outline-none focus:border-primary"
                />
                <div className="flex items-center gap-1.5">
                  <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { takeImages(e.target.files); e.target.value = ""; }} />
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={images.length >= MAX_IMAGES} onClick={() => fileRef.current?.click()}
                    title="Attach reference pictures (or paste / drop them into the text box)">
                    <Paperclip className="h-3.5 w-3.5" /> Picture
                  </Button>
                  <span className="flex-1 text-right text-[11px] text-muted-foreground">Ctrl+Enter to send</span>
                  {chatRunning ? (
                    <Button size="sm" variant="destructive" className="h-7 gap-1 px-3 text-xs" onClick={stopAgentRun}><Square className="h-3.5 w-3.5" /> Stop</Button>
                  ) : (
                    <Button size="sm" className="h-7 gap-1 px-3 text-xs" disabled={!text.trim() || run.running} onClick={send}><Hammer className="h-3.5 w-3.5" /> Build</Button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** The little Markdown answers use: **bold** and `code` (everything else stays plain text). */
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
