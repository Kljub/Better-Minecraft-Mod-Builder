"use client";

import { useSyncExternalStore } from "react";
import { agentRunState, startAgentRun } from "./modelAgent";
import { genId } from "@/lib/utils";
import { onImageProposalUpdate, takeImageProposals } from "./imageProposals";
import { cloudPutSetting } from "@/lib/cloud/sync";

/**
 * AI Builder tab: saved conversations, kept outside React so they survive switching views, in
 * localStorage so they survive reloads, and mirrored to the account (/api/kv "ai-conversations")
 * when logged in. Each message is answered by a fresh agent run (app/api/ai/agent, mode "chat")
 * that gets the conversation's earlier turns plus a digest of the project's other conversations
 * (its memory) as text and works in the editor through the mc-designer MCP tools.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** tools the assistant used for this answer */
  tools?: string[];
  error?: boolean;
  /** pictures the AI generated — added to Resources (folder "KI") only when the user approves */
  images?: ChatImage[];
  /** reference pictures the user attached to this message (only their names are kept) */
  attachments?: string[];
}

export interface ChatImage {
  id: string;
  name: string;
  dataUrl: string;
  status: "generating" | "pending" | "failed" | "added" | "discarded";
  error?: string;
  /** pack texture key once added */
  key?: string;
  /** becomes this record's texture when added */
  assign?: { collection: string; id: string; field: string };
  /** scaled to this square size when added */
  size?: number;
}

export interface Conversation {
  /** also the conversation id of its training data (lib/server/chatDataset) */
  id: string;
  title: string;
  projectKey: string | null;
  updatedAt: number;
  messages: ChatMessage[];
}

const KEY = "mc-ui-builder:ai-conversations";
/** the open conversation, per browser tab */
const ACTIVE_KEY = `${KEY}:active`;
/** before saved conversations: one conversation per browser tab */
const LEGACY_KEY = "mc-ui-builder:codex-chat";
const MAX_CONVERSATIONS = 60;
const MAX_MESSAGES = 200;
/** what /api/kv accepts is 1 MB */
const MAX_CLOUD_CHARS = 900_000;

let conversations: Conversation[] = [];
let activeId = "";
let loaded = false;
const listeners = new Set<() => void>();

const isMessage = (m: ChatMessage) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string";

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as { conversations?: Conversation[] }) : null;
    conversations = (parsed?.conversations ?? [])
      .filter((c) => c && typeof c.id === "string" && Array.isArray(c.messages))
      .map((c) => ({ ...c, messages: c.messages.filter(isMessage) }));
  } catch {
    conversations = [];
  }
  try {
    activeId = sessionStorage.getItem(ACTIVE_KEY) ?? "";
    const legacy = sessionStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const messages = (JSON.parse(legacy) as ChatMessage[]).filter(isMessage);
      const id = sessionStorage.getItem(`${LEGACY_KEY}:id`) || genId();
      if (messages.length && !conversations.some((c) => c.id === id)) {
        conversations = [{ id, title: titleOf(messages), projectKey: null, updatedAt: Date.now(), messages }, ...conversations];
        activeId = id;
      }
      sessionStorage.removeItem(LEGACY_KEY);
      sessionStorage.removeItem(`${LEGACY_KEY}:id`);
      save();
    }
  } catch { /* storage unavailable — memory only */ }
}

function titleOf(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.text.trim().split("\n")[0] ?? "";
  return first.length > 60 ? `${first.slice(0, 57)}…` : first || "New conversation";
}

/** Generated pictures are big: only the ones still waiting for Add/Discard keep their data. */
const lean = (cs: Conversation[], keepPending: boolean) => cs.map((c) => ({
  ...c,
  messages: c.messages.map((m) => (m.images
    ? { ...m, images: m.images.map((i) => (keepPending && i.status === "pending" ? i : { ...i, dataUrl: "" })) }
    : m)),
}));

function save() {
  try {
    try {
      localStorage.setItem(KEY, JSON.stringify({ conversations: lean(conversations, true) }));
    } catch {
      // Too big with the pictures — keep the text (pictures stay in memory for this page).
      localStorage.setItem(KEY, JSON.stringify({ conversations: lean(conversations, false) }));
    }
    if (activeId) sessionStorage.setItem(ACTIVE_KEY, activeId);
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch { /* private mode / full — memory only */ }
  // The account copy: text only, oldest conversations dropped until it fits.
  let cloud = lean(conversations, false);
  while (cloud.length > 1 && JSON.stringify(cloud).length > MAX_CLOUD_CHARS) cloud = cloud.slice(0, -1);
  cloudPutSetting("ai-conversations", { conversations: cloud });
}

function emit() {
  listeners.forEach((l) => l());
}

function update(id: string, fn: (c: Conversation) => Conversation) {
  conversations = conversations.map((c) => (c.id === id ? fn(c) : c));
  save();
  emit();
}

// Pictures still generating when the answer was added fill in here when they arrive.
if (typeof window !== "undefined") {
  onImageProposalUpdate((p) => {
    const conv = conversations.find((c) => c.messages.some((m) => m.images?.some((i) => i.id === p.id)));
    if (!conv) return;
    update(conv.id, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.images?.some((i) => i.id === p.id)
        ? { ...m, images: m.images.map((i) => (i.id === p.id && (i.status === "generating" || i.status === "pending") ? { ...i, ...p } : i)) }
        : m)),
    }));
  });
}

const subscribe = (cb: () => void) => { load(); listeners.add(cb); return () => { listeners.delete(cb); }; };
const EMPTY: Conversation[] = [];

/** All saved conversations, newest first. */
export function useConversations(): Conversation[] {
  return useSyncExternalStore(subscribe, () => { load(); return conversations; }, () => EMPTY);
}

/** The open conversation's id ("" = a new, empty one). */
export function useActiveConversationId(): string {
  return useSyncExternalStore(subscribe, () => { load(); return activeId; }, () => "");
}

export function openConversation(id: string) {
  load();
  activeId = conversations.some((c) => c.id === id) ? id : "";
  save();
  emit();
}

/** Starts an empty conversation (created on its first message). */
export function newConversation() {
  openConversation("");
}

export function deleteConversation(id: string) {
  load();
  conversations = conversations.filter((c) => c.id !== id);
  if (activeId === id) activeId = "";
  save();
  emit();
}

export function renameConversation(id: string, title: string) {
  const t = title.trim().slice(0, 80);
  if (t) update(id, (c) => ({ ...c, title: t }));
}

/**
 * The builder's memory: title, requests and last answer of the project's other recent
 * conversations, newest first, within a character budget.
 */
function memoryDigest(projectKey: string | null, exclude: string): string {
  const parts: string[] = [];
  let budget = 10_000;
  for (const c of conversations) {
    if (c.id === exclude || (projectKey && c.projectKey && c.projectKey !== projectKey) || !c.messages.length) continue;
    const asks = c.messages.filter((m) => m.role === "user").map((m) => `- ${m.text.trim().replace(/\s+/g, " ").slice(0, 300)}`).slice(-6);
    const answer = [...c.messages].reverse().find((m) => m.role === "assistant" && !m.error)?.text.trim().slice(0, 600);
    const part = `### "${c.title}" (${new Date(c.updatedAt).toISOString().slice(0, 10)})\nUser asked:\n${asks.join("\n")}${answer ? `\nLast answer: ${answer}` : ""}`;
    if (part.length > budget) break;
    budget -= part.length;
    parts.push(part);
  }
  return parts.join("\n\n");
}

/** Sends one message in the open conversation (a new one if none is open) and appends the answer. */
export async function sendChatMessage(opts: {
  provider: "claude" | "codex";
  model: string;
  text: string;
  activeElement: { kind: string; id: string } | null;
  projectKey?: string;
  /** reference pictures (data URLs) with a label */
  images?: { data: string; view: string; name: string }[];
}) {
  load();
  let conv = conversations.find((c) => c.id === activeId);
  if (!conv) {
    conv = { id: genId(), title: "", projectKey: opts.projectKey ?? null, updatedAt: Date.now(), messages: [] };
    conversations = [conv, ...conversations].slice(0, MAX_CONVERSATIONS);
    activeId = conv.id;
  }
  const id = conv.id;
  const history = conv.messages.filter((m) => !m.error).map(({ role, text }) => ({ role, text }));
  const memory = memoryDigest(conv.projectKey, id);
  const userMessage: ChatMessage = { role: "user", text: opts.text, ...(opts.images?.length ? { attachments: opts.images.map((i) => i.name) } : {}) };
  // Most recently used first.
  conversations = [conv, ...conversations.filter((c) => c.id !== id)];
  update(id, (c) => ({ ...c, title: c.title || titleOf([userMessage]), updatedAt: Date.now(), messages: [...c.messages, userMessage].slice(-MAX_MESSAGES) }));
  takeImageProposals(); // drop leftovers of an earlier, aborted run
  await startAgentRun({
    provider: opts.provider, model: opts.model, prompt: opts.text, mode: "chat", history, memory,
    conversationId: id, projectKey: opts.projectKey,
    images: opts.images?.map(({ data, view }) => ({ data, view })),
    context: { activeElement: opts.activeElement },
  });
  const run = agentRunState();
  const texts = run.log.filter((l) => l.kind === "text").map((l) => l.text);
  const errors = run.log.filter((l) => l.kind === "error").map((l) => l.text);
  const answer = run.result?.text?.trim() || texts.at(-1) || errors.at(-1) || (run.result?.ok ? "Done." : "No answer.");
  update(id, (c) => ({ ...c, updatedAt: Date.now(), messages: [...c.messages, {
    role: "assistant" as const,
    text: answer,
    tools: run.log.filter((l) => l.kind === "tool").map((l) => l.text),
    error: !run.result?.ok,
    images: takeImageProposals(),
  }].slice(-MAX_MESSAGES) }));
}

/** Marks a generated picture as added (with its texture key) or discarded. */
export function setChatImageStatus(id: string, status: ChatImage["status"], key?: string) {
  const conv = conversations.find((c) => c.messages.some((m) => m.images?.some((i) => i.id === id)));
  if (!conv) return;
  update(conv.id, (c) => ({
    ...c,
    messages: c.messages.map((m) => (m.images?.some((i) => i.id === id)
      ? { ...m, images: m.images.map((i) => (i.id === id ? { ...i, status, ...(key ? { key } : {}) } : i)) }
      : m)),
  }));
}

/** Which AI builds in the AI Builder tab (Codex / Claude Code) — remembered per browser. */
export type ChatProvider = "codex" | "claude";
const PROVIDER_KEY = "mc-ui-builder:chat-provider";
let provider: ChatProvider | null = null;
const providerListeners = new Set<() => void>();

function readProvider(): ChatProvider {
  if (provider) return provider;
  try { provider = localStorage.getItem(PROVIDER_KEY) === "claude" ? "claude" : "codex"; } catch { provider = "codex"; }
  return provider;
}

export function setChatProvider(next: ChatProvider) {
  provider = next;
  try { localStorage.setItem(PROVIDER_KEY, next); } catch { /* memory only */ }
  providerListeners.forEach((l) => l());
}

export function useChatProvider(): ChatProvider {
  return useSyncExternalStore(
    (cb) => { providerListeners.add(cb); return () => providerListeners.delete(cb); },
    readProvider,
    () => "codex",
  );
}

export const chatProviderLabel = (p: ChatProvider) => (p === "claude" ? "Claude Builder" : "Codex Builder");
