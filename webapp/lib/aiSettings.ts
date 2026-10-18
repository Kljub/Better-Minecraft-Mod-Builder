"use client";

import { useSyncExternalStore } from "react";

/**
 * Settings for the local AI integration (Settings → AI). Any number of clients can be enabled at
 * once: the dev server shells out to the Claude Code / Codex CLI installed on the machine it runs
 * on, or talks to its local Ollama server (see app/api/ai). No API key is stored here — the CLIs
 * use their own login/subscription. Per browser, not per project.
 */
export type AiClientId = "claude" | "codex" | "ollama";

export const AI_CLIENTS: { id: AiClientId; label: string; hint: string; modelHint: string }[] = [
  { id: "claude", label: "Claude Code", hint: "Uses the local `claude` CLI and its login.", modelHint: "e.g. sonnet, opus, haiku" },
  { id: "codex", label: "Codex", hint: "Uses the local `codex` CLI and its ChatGPT login.", modelHint: "model name from codex config" },
  { id: "ollama", label: "Ollama", hint: "Local models via the Ollama server (OLLAMA_HOST, default 127.0.0.1:11434).", modelHint: "first installed model" },
];

export interface AiClientSettings {
  enabled: boolean;
  /** passed as --model / -m (Ollama: model name); empty = the client's default */
  model: string;
}

export interface AiSettings {
  clients: Record<AiClientId, AiClientSettings>;
  /** preselected client in the editor when several are enabled; "all" = ask every enabled client and compare */
  preferred: AiClientId | "all";
}

const STORAGE_KEY = "mc-ui-builder:ai-settings";
const OFF: AiClientSettings = { enabled: false, model: "" };
const DEFAULTS: AiSettings = { clients: { claude: OFF, codex: OFF, ollama: OFF }, preferred: "claude" };
const isClientId = (v: unknown): v is AiClientId => v === "claude" || v === "codex" || v === "ollama";

let state: AiSettings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function parseClient(v: unknown): AiClientSettings {
  const c = (v ?? {}) as Partial<AiClientSettings>;
  return { enabled: c.enabled === true, model: typeof c.model === "string" ? c.model : "" };
}

function load(): AiSettings {
  if (loaded) return state;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiSettings> & { provider?: string; model?: string };
      if (parsed.clients) {
        const p = parsed.preferred;
        state = {
          clients: {
            claude: parseClient(parsed.clients.claude),
            codex: parseClient(parsed.clients.codex),
            ollama: parseClient(parsed.clients.ollama),
          },
          preferred: isClientId(p) || p === "all" ? p : "claude",
        };
      } else if (parsed.provider === "claude" || parsed.provider === "codex") {
        // pre-multi-client shape: { provider, model }
        state = {
          ...DEFAULTS,
          clients: { ...DEFAULTS.clients, [parsed.provider]: { enabled: true, model: parsed.model ?? "" } },
          preferred: parsed.provider,
        };
      }
    }
  } catch {
    state = DEFAULTS;
  }
  return state;
}

function save(next: AiSettings) {
  state = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable — keep in memory */ }
  listeners.forEach((l) => l());
}

export function setAiClient(id: AiClientId, patch: Partial<AiClientSettings>) {
  const s = load();
  save({ ...s, clients: { ...s.clients, [id]: { ...s.clients[id], ...patch } } });
}

export function setAiPreferred(preferred: AiSettings["preferred"]) {
  save({ ...load(), preferred });
}

export function useAiSettings(): AiSettings {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    load,
    () => DEFAULTS,
  );
}

export function aiClientLabel(id: AiClientId): string {
  return AI_CLIENTS.find((c) => c.id === id)?.label ?? id;
}

export function enabledAiClients(s: AiSettings): AiClientId[] {
  return AI_CLIENTS.map((c) => c.id).filter((id) => s.clients[id].enabled);
}

export interface AiCliStatus {
  available: boolean;
  version?: string;
  /** Ollama only: installed models */
  models?: string[];
}

export async function fetchAiStatus(): Promise<Record<AiClientId, AiCliStatus>> {
  const res = await fetch("/api/ai/status");
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
  return res.json();
}

export async function aiGenerate<T>(
  provider: AiClientId, task: string, prompt: string, context: Record<string, unknown>,
  /** optional labelled images as data URLs (PNG/JPEG/WebP), e.g. renders of a model */
  images?: { data: string; label: string }[],
): Promise<T> {
  const { enabled, model } = load().clients[provider];
  if (!enabled) throw new Error(`${provider} is disabled — enable it in Settings → AI.`);
  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model, task, prompt, context, ...(images?.length ? { images } : {}) }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}
