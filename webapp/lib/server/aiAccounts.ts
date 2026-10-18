import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { db } from "./db";
import { decryptSecret, encryptSecret } from "./secrets";

/**
 * Linked AI accounts per user (Settings → AI): several Claude and Codex logins, tried in queue
 * order. Secrets are AES-GCM encrypted in mmb_ai_accounts.secret_enc (see secrets.ts):
 * - claude / oauth_token: a `claude setup-token` token → CLAUDE_CODE_OAUTH_TOKEN
 * - claude / api_key:     an Anthropic API key        → ANTHROPIC_API_KEY
 * - codex  / codex_auth:  the auth.json a `codex login` wrote → a private CODEX_HOME per run
 * Each run reports the account's quota (Claude's rate_limit_event, Codex's rate_limits); the
 * picker skips accounts that are at their limit until it resets.
 */
export type AiProvider = "claude" | "codex";
export type AiAccountKind = "oauth_token" | "api_key" | "codex_auth";

export interface QuotaWindow { label: string; usedPercent: number; resetsAt: number | null }
export interface Quota { checkedAt: number; status: "allowed" | "limited"; windows: QuotaWindow[]; plan?: string }

export interface AiAccountView {
  id: number; provider: AiProvider; kind: AiAccountKind; label: string; priority: number; enabled: boolean;
  quota: Quota | null; limitedUntil: number | null; lastUsedAt: number | null; createdAt: number;
}

interface Row extends AiAccountView { secretEnc: string }

const aad = (userId: number, provider: string) => `mmb-ai:${userId}:${provider}`;

function toRow(r: RowDataPacket): Row {
  let quota: Quota | null = null;
  try { quota = r.quota_json ? JSON.parse(String(r.quota_json)) : null; } catch { /* ignore */ }
  return {
    id: Number(r.id), provider: r.provider, kind: r.kind, label: String(r.label), priority: Number(r.priority), enabled: !!r.enabled,
    quota, limitedUntil: r.limited_until == null ? null : Number(r.limited_until), lastUsedAt: r.last_used_at == null ? null : Number(r.last_used_at),
    createdAt: Number(r.created_at), secretEnc: String(r.secret_enc),
  };
}

function view(r: Row): AiAccountView {
  const v: Partial<Row> = { ...r };
  delete v.secretEnc;
  return v as AiAccountView;
}

async function rows(userId: number, provider?: AiProvider): Promise<Row[]> {
  const [r] = await (await db()).execute<RowDataPacket[]>(
    `SELECT * FROM mmb_ai_accounts WHERE user_id = ?${provider ? " AND provider = ?" : ""} ORDER BY priority, id`,
    provider ? [userId, provider] : [userId]);
  return r.map(toRow);
}

export async function listAccounts(userId: number): Promise<AiAccountView[]> {
  return (await rows(userId)).map(view);
}

export async function addAccount(userId: number, a: { provider: AiProvider; kind: AiAccountKind; label: string; secret: string }): Promise<number> {
  const [[max]] = await (await db()).execute<RowDataPacket[]>("SELECT COALESCE(MAX(priority), -1) AS m FROM mmb_ai_accounts WHERE user_id = ?", [userId]);
  const [res] = await (await db()).execute<ResultSetHeader>(
    "INSERT INTO mmb_ai_accounts (user_id, provider, kind, label, secret_enc, priority, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    [userId, a.provider, a.kind, a.label.slice(0, 100), encryptSecret(a.secret, aad(userId, a.provider)), Number(max.m) + 1, Date.now()]);
  return res.insertId;
}

export async function updateAccount(userId: number, id: number, patch: { label?: string; enabled?: boolean; secret?: string; kind?: AiAccountKind }) {
  const acc = (await rows(userId)).find((r) => r.id === id);
  if (!acc) throw new Error("Account not found");
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (patch.label !== undefined) { sets.push("label = ?"); vals.push(patch.label.slice(0, 100)); }
  if (patch.enabled !== undefined) { sets.push("enabled = ?"); vals.push(patch.enabled ? 1 : 0); }
  if (patch.kind !== undefined) { sets.push("kind = ?"); vals.push(patch.kind); }
  if (patch.secret !== undefined) {
    // Re-authenticated: new secret, forget the old limit.
    sets.push("secret_enc = ?", "limited_until = NULL", "quota_json = NULL");
    vals.push(encryptSecret(patch.secret, aad(userId, acc.provider)));
  }
  if (!sets.length) return;
  await (await db()).execute(`UPDATE mmb_ai_accounts SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, [...vals, id, userId]);
}

export async function reorderAccounts(userId: number, ids: number[]) {
  const pool = await db();
  for (const [i, id] of ids.entries()) await pool.execute("UPDATE mmb_ai_accounts SET priority = ? WHERE id = ? AND user_id = ?", [i, id, userId]);
}

export async function removeAccount(userId: number, id: number) {
  await (await db()).execute("DELETE FROM mmb_ai_accounts WHERE id = ? AND user_id = ?", [id, userId]);
}

export async function hasAccounts(userId: number, provider: AiProvider): Promise<boolean> {
  return (await rows(userId, provider)).some((r) => r.enabled);
}

/** Whether the stored quota says this account can't run right now. */
function blocked(r: Row, now = Date.now()): boolean {
  if (r.limitedUntil && r.limitedUntil > now) return true;
  return !!r.quota?.windows.some((w) => w.usedPercent >= 99.5 && (w.resetsAt ?? 0) * 1000 > now);
}

/** Enabled accounts in queue order, the ones with free quota first (blocked ones last, as a last resort). */
export async function accountQueue(userId: number, provider: AiProvider): Promise<Row[]> {
  const enabled = (await rows(userId, provider)).filter((r) => r.enabled);
  return [...enabled.filter((r) => !blocked(r)), ...enabled.filter((r) => blocked(r))];
}

/** When the earliest blocked account frees up (for "all accounts at their limit" messages). */
export function nextFree(queue: Row[]): number | null {
  const times = queue.map((r) => Math.max(r.limitedUntil ?? 0, ...(r.quota?.windows ?? []).filter((w) => w.usedPercent >= 99.5).map((w) => (w.resetsAt ?? 0) * 1000))).filter((t) => t > Date.now());
  return times.length ? Math.min(...times) : null;
}

export { blocked as isBlocked };

// ---- running with an account ------------------------------------------------------------------

export interface RunAccount {
  id: number;
  label: string;
  provider: AiProvider;
  /** extra env for the CLI process */
  env: Record<string, string>;
  /** Codex: a private CODEX_HOME (its sessions hold the rate limits) */
  codexHome?: string;
  /** after the run: stores refreshed Codex tokens + quota found in the session, deletes temp files */
  finish(): Promise<void>;
}

export async function openAccount(userId: number, r: Row): Promise<RunAccount> {
  const secret = decryptSecret(r.secretEnc, aad(userId, r.provider));
  const pool = await db();
  await pool.execute("UPDATE mmb_ai_accounts SET last_used_at = ? WHERE id = ?", [Date.now(), r.id]);
  if (r.provider === "claude") {
    // A private, empty config dir so the host's own Claude login is never used or touched.
    const home = await mkdtemp(join(tmpdir(), "mmb-claude-"));
    return {
      id: r.id, label: r.label, provider: "claude",
      env: { CLAUDE_CONFIG_DIR: home, ...(r.kind === "api_key" ? { ANTHROPIC_API_KEY: secret } : { CLAUDE_CODE_OAUTH_TOKEN: secret }) },
      finish: () => rm(home, { recursive: true, force: true }),
    };
  }
  const home = await mkdtemp(join(tmpdir(), "mmb-codex-"));
  await writeFile(join(home, "auth.json"), secret, { mode: 0o600 });
  return {
    id: r.id, label: r.label, provider: "codex", env: { CODEX_HOME: home }, codexHome: home,
    finish: async () => {
      try {
        const auth = await readFile(join(home, "auth.json"), "utf8").catch(() => null);
        if (auth && auth !== secret) {
          await pool.execute("UPDATE mmb_ai_accounts SET secret_enc = ? WHERE id = ?", [encryptSecret(auth, aad(userId, "codex")), r.id]);
        }
        const limits = await latestCodexRateLimits(home);
        if (limits) await recordQuota(r.id, codexQuota(limits));
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    },
  };
}

export async function recordQuota(id: number, quota: Quota) {
  const limitedUntil = quota.status === "limited"
    ? Math.max(Date.now() + 60_000, ...quota.windows.filter((w) => w.usedPercent >= 99.5 || quota.windows.length === 1).map((w) => (w.resetsAt ?? 0) * 1000))
    : null;
  await (await db()).execute("UPDATE mmb_ai_accounts SET quota_json = ?, limited_until = ? WHERE id = ?", [JSON.stringify(quota), limitedUntil, id]);
}

/** Marks an account as out of quota after a "limit reached" failure; resets in an hour unless the error said when. */
export async function markLimited(id: number, until?: number | null) {
  await (await db()).execute("UPDATE mmb_ai_accounts SET limited_until = ? WHERE id = ?", [until && until > Date.now() ? until : Date.now() + 3600_000, id]);
}

/** Error text that means "this account is out of quota" (as opposed to a bad prompt etc.). */
export function isLimitError(text: string): boolean {
  return /usage limit|rate[ _-]?limit|limit reached|quota|429|too many requests|credit balance/i.test(text);
}

// ---- quota formats ----------------------------------------------------------------------------

/** Claude stream-json `rate_limit_event.rate_limit_info`. */
export function claudeQuota(info: {
  status?: string; resetsAt?: number; rateLimitType?: string;
  unifiedWindows?: Record<string, { utilization?: number; resetsAt?: number }>;
}): Quota {
  const names: Record<string, string> = { five_hour: "5 h", seven_day: "7 days", seven_day_opus: "7 days (Opus)", seven_day_sonnet: "7 days (Sonnet)" };
  const windows = Object.entries(info.unifiedWindows ?? {}).map(([k, w]) => ({
    label: names[k] ?? k, usedPercent: Math.round((w.utilization ?? 0) * 1000) / 10, resetsAt: w.resetsAt ?? null,
  }));
  if (!windows.length && info.rateLimitType) windows.push({ label: names[info.rateLimitType] ?? info.rateLimitType, usedPercent: info.status === "allowed" ? 0 : 100, resetsAt: info.resetsAt ?? null });
  return { checkedAt: Date.now(), status: info.status && info.status !== "allowed" && info.status !== "allowed_warning" ? "limited" : "allowed", windows };
}

interface CodexLimits {
  primary?: { used_percent?: number; window_minutes?: number; resets_at?: number } | null;
  secondary?: { used_percent?: number; window_minutes?: number; resets_at?: number } | null;
  plan_type?: string | null;
  rate_limit_reached_type?: string | null;
}

function windowLabel(minutes?: number) {
  if (!minutes) return "window";
  if (minutes % 1440 === 0) return `${minutes / 1440} days`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${minutes} min`;
}

export function codexQuota(l: CodexLimits): Quota {
  const windows = [l.primary, l.secondary].filter((w): w is NonNullable<typeof w> => !!w).map((w) => ({
    label: windowLabel(w.window_minutes), usedPercent: w.used_percent ?? 0, resetsAt: w.resets_at ?? null,
  }));
  return {
    checkedAt: Date.now(), status: l.rate_limit_reached_type || windows.some((w) => w.usedPercent >= 99.5) ? "limited" : "allowed",
    windows, plan: l.plan_type ?? undefined,
  };
}

/** The last `rate_limits` a Codex run wrote into its session files under CODEX_HOME/sessions. */
async function latestCodexRateLimits(home: string): Promise<CodexLimits | null> {
  const files: { path: string; mtime: number }[] = [];
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".jsonl")) files.push({ path: p, mtime: (await stat(p)).mtimeMs });
    }
  };
  await walk(join(home, "sessions"));
  files.sort((a, b) => b.mtime - a.mtime);
  for (const f of files) {
    const lines = (await readFile(f.path, "utf8")).trim().split("\n").reverse();
    for (const line of lines) {
      if (!line.includes('"rate_limits"')) continue;
      try {
        const found = findKey(JSON.parse(line), "rate_limits");
        if (found) return found as CodexLimits;
      } catch { /* skip */ }
    }
  }
  return null;
}

function findKey(v: unknown, key: string): unknown {
  if (!v || typeof v !== "object") return null;
  if (key in (v as Record<string, unknown>) && (v as Record<string, unknown>)[key]) return (v as Record<string, unknown>)[key];
  for (const x of Object.values(v as Record<string, unknown>)) {
    const r = findKey(x, key);
    if (r) return r;
  }
  return null;
}
