"use client";

import { useSyncExternalStore } from "react";

/**
 * State of the Entity Model Generator's agent run (app/api/ai/agent) — kept outside React
 * components because the agent opens the model it builds, which navigates the editor away from
 * the generator tab; the run (and its log) must survive that. The page reads `port` to connect a
 * second MCP bridge for the run's own MCP server.
 */
export interface AgentLogLine { kind: "tool" | "text" | "error" | "info"; text: string; detail?: string }

export interface AgentRunState {
  running: boolean;
  /** "model": Entity Model Generator; "chat": the AI Builder tab */
  mode: "model" | "chat";
  /** port of the run's MCP server while it's up — the page bridges to it */
  port: number | null;
  provider: string | null;
  log: AgentLogLine[];
  /** set when finished */
  result: { ok: boolean; text: string } | null;
}

const IDLE: AgentRunState = { running: false, mode: "model", port: null, provider: null, log: [], result: null };
let state: AgentRunState = IDLE;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<AgentRunState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
const push = (line: AgentLogLine) => set({ log: [...state.log, line].slice(-400) });

export function useAgentRun(): AgentRunState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => IDLE,
  );
}

export async function startAgentRun(opts: {
  provider: "claude" | "codex";
  model: string;
  prompt: string;
  context: Record<string, unknown>;
  /** optional reference images (data URLs), each labelled with the view it shows */
  images?: { data: string; view: string }[];
  mode?: "model" | "chat";
  /** chat: earlier turns */
  history?: { role: "user" | "assistant"; text: string }[];
  /** chat: digest of the project's other saved conversations */
  memory?: string;
  /** chat: conversation id + project, stored with the turn as training data */
  conversationId?: string;
  projectKey?: string;
}) {
  if (state.running) return;
  controller = new AbortController();
  set({ ...IDLE, running: true, mode: opts.mode ?? "model", provider: opts.provider, log: [{ kind: "info", text: `Starting ${opts.provider === "claude" ? "Claude Code" : "Codex"}…` }] });
  try {
    const res = await fetch("/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let ev: { type: string; port?: number; name?: string; detail?: string; text?: string; ok?: boolean };
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === "start") set({ port: ev.port ?? null });
        else if (ev.type === "tool") push({ kind: "tool", text: ev.name ?? "tool", detail: ev.detail });
        else if (ev.type === "text" && ev.text) push({ kind: "text", text: ev.text });
        else if (ev.type === "info" && ev.text) push({ kind: "info", text: ev.text });
        else if (ev.type === "done") {
          // claude repeats its last message as the final result — don't show it twice
          const last = state.log.at(-1);
          const text = ev.text && !(last?.kind === "text" && last.text === ev.text.trim()) ? ev.text : "";
          set({ result: { ok: !!ev.ok, text } });
        }
      }
    }
    if (!state.result) set({ result: { ok: false, text: "The run ended without a result." } });
  } catch (e) {
    const aborted = controller?.signal.aborted;
    push({ kind: aborted ? "info" : "error", text: aborted ? "Stopped." : e instanceof Error ? e.message : String(e) });
    set({ result: { ok: false, text: aborted ? "Stopped by you." : "" } });
  } finally {
    controller = null;
    set({ running: false, port: null });
  }
}

export function stopAgentRun() {
  controller?.abort();
}

export function clearAgentRun() {
  if (!state.running) set(IDLE);
}

/** Current run state outside React (e.g. right after `await startAgentRun(...)`). */
export function agentRunState(): AgentRunState {
  return state;
}
