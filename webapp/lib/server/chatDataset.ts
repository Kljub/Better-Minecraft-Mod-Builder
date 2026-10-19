import { appendFile, mkdir } from "fs/promises";
import { join } from "path";
import { db } from "./db";

/**
 * Training data from Codex Chat: every turn is stored with the whole conversation up to and
 * including it (OpenAI/Anthropic-style messages) and the editor tool calls that answered it — a
 * ready-made "conversation → actions" example. Logged-in users: mmb_ai_chats (exported by
 * GET /api/dataset?type=chats and `npm run dataset:export -- out.jsonl --chats`). Without accounts
 * (local mode) the lines go to webapp/training-data/chat-turns.jsonl (git-ignored).
 */
export interface ChatTurn {
  conversationId: string;
  provider: string;
  projectKey?: string | null;
  runId?: number | null;
  /** earlier turns, then this turn's user message and the assistant's answer */
  messages: { role: "user" | "assistant"; content: string }[];
  tools: { name: string; input: unknown }[];
  ok: boolean;
}

export const LOCAL_CHAT_FILE = join(process.cwd(), "training-data", "chat-turns.jsonl");

export async function recordChatTurn(userId: number | null, t: ChatTurn): Promise<void> {
  const turn = t.messages.filter((m) => m.role === "user").length;
  const now = Date.now();
  if (userId != null) {
    await (await db()).execute(
      `INSERT INTO mmb_ai_chats (user_id, conversation_id, turn, run_id, provider, project_key, messages_json, tools_json, ok, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, t.conversationId, turn, t.runId ?? null, t.provider, t.projectKey ?? null,
        JSON.stringify(t.messages), JSON.stringify(t.tools).slice(0, 4_000_000), t.ok ? 1 : 0, now]);
    return;
  }
  await mkdir(join(process.cwd(), "training-data"), { recursive: true });
  await appendFile(LOCAL_CHAT_FILE, JSON.stringify({
    conversation_id: t.conversationId, turn, provider: t.provider, project_key: t.projectKey ?? null,
    messages: t.messages, tools: t.tools, ok: t.ok, created_at: now,
  }) + "\n");
}
