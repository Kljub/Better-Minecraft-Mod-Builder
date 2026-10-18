"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Gauge, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/components/AuthGate";

/**
 * Settings → AI → Accounts: several Claude / Codex logins per user. Runs use the first account in
 * the queue that has free quota and fall over to the next when one hits its limit. Tokens are
 * stored encrypted on the server and never sent back to the browser.
 */
interface QuotaWindow { label: string; usedPercent: number; resetsAt: number | null }
interface AccountView {
  id: number; provider: "claude" | "codex"; kind: string; label: string; priority: number; enabled: boolean;
  quota: { checkedAt: number; status: "allowed" | "limited"; windows: QuotaWindow[]; plan?: string } | null;
  limitedUntil: number | null; lastUsedAt: number | null; createdAt: number;
}

const fmt = (ms: number) => new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function isLimited(a: AccountView) {
  const now = Date.now();
  return (a.limitedUntil ?? 0) > now || !!a.quota?.windows.some((w) => w.usedPercent >= 99.5 && (w.resetsAt ?? 0) * 1000 > now);
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export default function AiAccountsPanel() {
  const user = useAccount();
  const [accounts, setAccounts] = useState<AccountView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [adding, setAdding] = useState<null | { replace?: AccountView }>(null);

  const load = useCallback(() => {
    call("/api/ai/accounts").then((b) => { setAccounts(b.accounts); setError(null); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    // Initial list; load() only sets state once its fetch resolves.
    if (user) load();
  }, [user, load]);

  if (!user) {
    return <p className="text-xs text-muted-foreground">Log in to link Claude / Codex accounts.</p>;
  }

  const act = async (id: number | null, fn: () => Promise<unknown>) => {
    setBusy(id ?? -1);
    try { await fn(); setError(null); } catch (e) { setError((e as Error).message); }
    setBusy(null);
    load();
  };
  const move = (a: AccountView, dir: -1 | 1) => {
    if (!accounts) return;
    const same = accounts.filter((x) => x.provider === a.provider);
    const i = same.findIndex((x) => x.id === a.id);
    const j = i + dir;
    if (j < 0 || j >= same.length) return;
    [same[i], same[j]] = [same[j], same[i]];
    const others = accounts.filter((x) => x.provider !== a.provider);
    void act(a.id, () => call("/api/ai/accounts", { method: "PATCH", body: JSON.stringify({ order: [...same, ...others].map((x) => x.id) }) }));
  };

  // The account the next run would use, per provider.
  const next = new Map<string, number>();
  for (const a of accounts ?? []) if (a.enabled && !isLimited(a) && !next.has(a.provider)) next.set(a.provider, a.id);

  return (
    <div className="flex flex-col gap-2" data-testid="ai-accounts">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Runs use the first account with free quota and switch to the next one at a limit.</p>
        <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" onClick={() => setAdding({})}><Plus className="h-3.5 w-3.5" /> Add account</Button>
      </div>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {accounts === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : accounts.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No linked accounts — AI runs use this server&apos;s own Claude / Codex login.</p>
      ) : (["claude", "codex"] as const).map((provider) => {
        const list = accounts.filter((a) => a.provider === provider);
        if (!list.length) return null;
        return (
          <div key={provider} className="flex flex-col gap-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{provider === "claude" ? "Claude" : "Codex"} · queue</p>
            {list.map((a, i) => {
              const limited = isLimited(a);
              return (
                <div key={a.id} className={`flex flex-col gap-1.5 rounded-md border p-2.5 ${next.get(provider) === a.id ? "border-primary/60 bg-accent/40" : "bg-card"} ${a.enabled ? "" : "opacity-60"}`} data-testid="ai-account">
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-center text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={a.label}>{a.label}</span>
                    <span className="rounded border px-1.5 text-[10px] text-muted-foreground">{a.kind === "api_key" ? "API key" : a.kind === "codex_auth" ? "login" : "token"}</span>
                    {next.get(provider) === a.id && <span className="rounded border border-primary/60 px-1.5 text-[10px] text-primary">Next</span>}
                    {limited && <span className="rounded border border-destructive/60 px-1.5 text-[10px] text-destructive">Limit reached</span>}
                  </div>
                  {a.quota?.windows.length ? (
                    <div className="flex flex-col gap-1 pl-6">
                      {a.quota.windows.map((w) => (
                        <div key={w.label} className="flex items-center gap-2 text-[11px]">
                          <span className="w-20 shrink-0 text-muted-foreground">{w.label}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                            <div className={`h-full ${w.usedPercent >= 90 ? "bg-destructive" : w.usedPercent >= 70 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(100, w.usedPercent)}%` }} />
                          </div>
                          <span className="w-10 text-right tabular-nums">{Math.round(w.usedPercent)}%</span>
                          {w.resetsAt && <span className="hidden w-28 text-muted-foreground sm:inline">resets {fmt(w.resetsAt * 1000)}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="pl-6 text-[11px] text-muted-foreground">Quota unknown — click Check.</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1 pl-6 text-[11px] text-muted-foreground">
                    {a.quota && <span>checked {fmt(a.quota.checkedAt)}{a.quota.plan ? ` · plan ${a.quota.plan}` : ""}</span>}
                    {a.limitedUntil && a.limitedUntil > Date.now() && <span>· free again {fmt(a.limitedUntil)}</span>}
                    <span className="ml-auto flex items-center gap-0.5">
                      <Button size="icon" variant="ghost" className="h-6 w-6" title="Earlier in the queue" disabled={i === 0} onClick={() => move(a, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" title="Later in the queue" disabled={i === list.length - 1} onClick={() => move(a, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px]" title="Run a tiny request to read the quota" disabled={busy === a.id || !a.enabled}
                        onClick={() => void act(a.id, async () => { const r = await call(`/api/ai/accounts/check?id=${a.id}`, { method: "POST" }); if (!r.ok) throw new Error(`${a.label}: ${r.error}`); })}>
                        {busy === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gauge className="h-3 w-3" />} Check
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => setAdding({ replace: a })}><RefreshCw className="h-3 w-3" /> Re-authenticate</Button>
                      <label className="flex items-center gap-1 px-1"><input type="checkbox" checked={a.enabled} onChange={(e) => void act(a.id, () => call("/api/ai/accounts", { method: "PATCH", body: JSON.stringify({ id: a.id, enabled: e.target.checked }) }))} /> on</label>
                      <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px] hover:text-destructive"
                        onClick={() => { if (window.confirm(`Remove "${a.label}"? Its stored token is deleted.`)) void act(a.id, () => call(`/api/ai/accounts?id=${a.id}`, { method: "DELETE" })); }}>
                        <Trash2 className="h-3 w-3" /> Remove
                      </Button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {adding && <AddAccountForm replace={adding.replace} onClose={() => { setAdding(null); load(); }} />}
    </div>
  );
}

type Method = "claude_token" | "claude_key" | "codex_device" | "codex_key";

function AddAccountForm({ replace, onClose }: { replace?: AccountView; onClose: () => void }) {
  const initial: Method = replace ? (replace.provider === "codex" ? "codex_device" : replace.kind === "api_key" ? "claude_key" : "claude_token") : "claude_token";
  const [method, setMethod] = useState<Method>(initial);
  const [label, setLabel] = useState(replace?.label ?? "");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<{ url: string; code: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (method === "claude_token" || method === "claude_key") {
        const kind = method === "claude_key" ? "api_key" : "oauth_token";
        if (replace) await call("/api/ai/accounts", { method: "PATCH", body: JSON.stringify({ id: replace.id, kind, secret, label: label || undefined }) });
        else await call("/api/ai/accounts", { method: "POST", body: JSON.stringify({ provider: "claude", kind, secret, label }) });
        onClose();
      } else if (method === "codex_key") {
        await call("/api/ai/accounts/codex-login", { method: "POST", body: JSON.stringify({ apiKey: secret, label, replaceId: replace?.id }) });
        onClose();
      } else {
        const res = await fetch("/api/ai/accounts/codex-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, replaceId: replace?.id }) });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const ev = JSON.parse(buf.slice(0, i));
            buf = buf.slice(i + 1);
            if (ev.type === "code") setDevice({ url: ev.url, code: ev.code });
            if (ev.type === "done") {
              if (!ev.ok) throw new Error(ev.error ?? "Login failed");
              onClose();
              return;
            }
          }
        }
        throw new Error("Login ended without a result");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const methods: { id: Method; label: string; provider: "claude" | "codex" }[] = [
    { id: "claude_token", label: "Claude subscription (token)", provider: "claude" },
    { id: "claude_key", label: "Claude API key", provider: "claude" },
    { id: "codex_device", label: "Codex / ChatGPT login", provider: "codex" },
    { id: "codex_key", label: "OpenAI API key", provider: "codex" },
  ];
  const allowed = replace ? methods.filter((m) => m.provider === replace.provider) : methods;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-3 text-xs" data-testid="ai-account-form">
      <p className="font-medium">{replace ? `Re-authenticate "${replace.label}"` : "Link an account"}</p>
      <select aria-label="Account type" className="h-8 rounded border border-input bg-background px-2 text-sm" value={method} onChange={(e) => { setMethod(e.target.value as Method); setDevice(null); }}>
        {allowed.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      <Input placeholder="Name, e.g. the account's e-mail" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Account name" />
      {method === "claude_token" && (
        <p className="text-muted-foreground">Run <code className="rounded bg-muted px-1">claude setup-token</code> on any computer where you&apos;re logged in to that Claude account and paste the token (sk-ant-oat…).</p>
      )}
      {method === "codex_device" ? (
        device ? (
          <div className="flex flex-col gap-1 rounded border border-primary/50 p-2">
            <span>1. Open <a href={device.url} target="_blank" rel="noreferrer" className="text-primary underline">{device.url}</a> and sign in.</span>
            <span>2. Enter the code <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-semibold tracking-wider">{device.code}</code> (valid 15 minutes).</span>
            <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Waiting for the login…</span>
          </div>
        ) : <p className="text-muted-foreground">Starts a ChatGPT device login: you get a link and a code to confirm in your browser.</p>
      ) : (
        <Input type="password" autoComplete="off" placeholder={method === "claude_token" ? "sk-ant-oat01-…" : method === "claude_key" ? "sk-ant-api03-…" : "sk-…"} value={secret} onChange={(e) => setSecret(e.target.value)} aria-label="Token or key" />
      )}
      {error && <p className="text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={busy || (method !== "codex_device" && !secret.trim())} onClick={() => void submit()}>
          {busy && method !== "codex_device" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {method === "codex_device" ? (busy ? "Waiting…" : "Start login") : replace ? "Save" : "Link"}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Stored encrypted on this server; never shown again.</p>
    </div>
  );
}
