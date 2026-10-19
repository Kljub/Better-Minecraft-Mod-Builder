"use client";

import { useSyncExternalStore } from "react";
import { agentRunState, startAgentRun } from "./modelAgent";
import { genId } from "@/lib/utils";
import { onImageProposalUpdate, takeImageProposals } from "./imageProposals";

/**
 * Codex Chat (editor header): the conversation, kept outside React so it survives switching
 * views and closing the panel, and in sessionStorage so a reload of the tab keeps it. Each
 * message is answered by a fresh agent run (app/api/ai/agent, mode "chat") that gets the earlier
 * turns as text and works in the editor through the mc-designer MCP tools.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** tools the assistant used for this answer */
  tools?: string[];
  error?: boolean;
  /** pictures the AI generated — added to Resources (folder "KI") only when the user approves */
  images?: ChatImage[];
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

const KEY = "mc-ui-builder:codex-chat";
let messages: ChatMessage[] = [];
/** id of the current conversation — kept with the training data of every turn (lib/server/chatDataset) */
let conversationId = "";
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  try {
    conversationId = sessionStorage.getItem(`${KEY}:id`) ?? "";
    const raw = sessionStorage.getItem(KEY);
    if (raw) messages = (JSON.parse(raw) as ChatMessage[]).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string");
  } catch {
    messages = [];
  }
}

function set(next: ChatMessage[]) {
  messages = next.slice(-100);
  try {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(messages));
    } catch {
      // Too big with the pictures — keep the text (pictures stay in memory for this page).
      sessionStorage.setItem(KEY, JSON.stringify(messages.map(({ images, ...m }) => (images ? { ...m, images: [] } : m))));
    }
    if (!messages.length) sessionStorage.removeItem(`${KEY}:id`);
  } catch { /* private mode / full — memory only */ }
  listeners.forEach((l) => l());
}

const EMPTY: ChatMessage[] = [];

// Pictures still generating when the answer was added fill in here when they arrive.
if (typeof window !== "undefined") {
  onImageProposalUpdate((p) => {
    if (!messages.some((m) => m.images?.some((i) => i.id === p.id))) return;
    set(messages.map((m) => (m.images?.some((i) => i.id === p.id)
      ? { ...m, images: m.images.map((i) => (i.id === p.id && (i.status === "generating" || i.status === "pending") ? { ...i, ...p } : i)) }
      : m)));
  });
}

export function useChatMessages(): ChatMessage[] {
  return useSyncExternalStore(
    (cb) => { load(); listeners.add(cb); return () => listeners.delete(cb); },
    () => { load(); return messages; },
    () => EMPTY,
  );
}

export function clearChat() {
  conversationId = "";
  set([]);
}

function currentConversationId(): string {
  if (!conversationId) {
    conversationId = genId();
    try { sessionStorage.setItem(`${KEY}:id`, conversationId); } catch { /* memory only */ }
  }
  return conversationId;
}

/** Sends one message and appends the assistant's answer when the run ends. */
export async function sendChatMessage(opts: {
  provider: "claude" | "codex";
  model: string;
  text: string;
  activeElement: { kind: string; id: string } | null;
  projectKey?: string;
}) {
  load();
  const history = messages.filter((m) => !m.error).map(({ role, text }) => ({ role, text }));
  set([...messages, { role: "user", text: opts.text }]);
  takeImageProposals(); // drop leftovers of an earlier, aborted run
  await startAgentRun({
    provider: opts.provider, model: opts.model, prompt: opts.text, mode: "chat", history,
    conversationId: currentConversationId(), projectKey: opts.projectKey,
    context: { activeElement: opts.activeElement },
  });
  const run = agentRunState();
  const texts = run.log.filter((l) => l.kind === "text").map((l) => l.text);
  const errors = run.log.filter((l) => l.kind === "error").map((l) => l.text);
  const answer = run.result?.text?.trim() || texts.at(-1) || errors.at(-1) || (run.result?.ok ? "Done." : "No answer.");
  set([...messages, {
    role: "assistant",
    text: answer,
    tools: run.log.filter((l) => l.kind === "tool").map((l) => l.text),
    error: !run.result?.ok,
    images: takeImageProposals(),
  }]);
}

/** Marks a generated picture as added (with its texture key) or discarded. */
export function setChatImageStatus(id: string, status: ChatImage["status"], key?: string) {
  set(messages.map((m) => (m.images?.some((i) => i.id === id)
    ? { ...m, images: m.images.map((i) => (i.id === id ? { ...i, status, ...(key ? { key } : {}) } : i)) }
    : m)));
}

/** Which AI answers in the chat (Codex Chat / Claude Chat) — remembered per browser. */
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

export const chatProviderLabel = (p: ChatProvider) => (p === "claude" ? "Claude Chat" : "Codex Chat");
