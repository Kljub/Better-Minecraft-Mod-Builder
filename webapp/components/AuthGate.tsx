"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Cloud, CloudAlert, CloudUpload, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialSync, logout, useCloudStatus } from "@/lib/cloud/sync";

/**
 * Wraps the app: when the server has accounts configured (MySQL, see lib/server/db.ts) nothing
 * renders until the user is logged in and this browser is synced with the account. Without
 * accounts (e.g. the public Vercel build) it renders the app straight away, local-only as before.
 */
interface Account { username: string }
const AccountCtx = createContext<Account | null>(null);
export const useAccount = () => useContext(AccountCtx);

type State =
  | { phase: "loading" }
  | { phase: "local" }
  | { phase: "login" }
  | { phase: "syncing"; user: Account }
  | { phase: "ready"; user: Account }
  | { phase: "error"; message: string };

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  const enter = useCallback(async (user: { id: number; username: string }) => {
    setState({ phase: "syncing", user });
    try {
      await initialSync(user.id);
      setState({ phase: "ready", user });
    } catch (e) {
      setState({ phase: "error", message: `Couldn't sync your projects: ${(e as Error).message}` });
    }
  }, []);

  const check = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const me = (await res.json()) as { enabled: boolean; user: { id: number; username: string } | null; error?: string };
      if (me.error) setState({ phase: "error", message: me.error });
      else if (!me.enabled) setState({ phase: "local" });
      else if (!me.user) setState({ phase: "login" });
      else await enter(me.user);
    } catch (e) {
      setState({ phase: "error", message: `Server not reachable: ${(e as Error).message}` });
    }
  }, [enter]);

  useEffect(() => {
    // Initial account check on mount; check() only sets state after its fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
  }, [check]);

  if (state.phase === "local") return <>{children}</>;
  if (state.phase === "ready") return <AccountCtx.Provider value={state.user}>{children}</AccountCtx.Provider>;
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background p-4">
      {state.phase === "login" ? (
        <LoginForm onLoggedIn={enter} />
      ) : state.phase === "error" ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center text-sm" data-testid="auth-error">
          <CloudAlert className="h-8 w-8 text-destructive" />
          <p>{state.message}</p>
          <Button size="sm" onClick={() => void check()}>Try again</Button>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground" data-testid="auth-loading">
          {state.phase === "syncing" ? `Loading ${state.user.username}'s projects…` : "Loading…"}
        </div>
      )}
    </div>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (user: { id: number; username: string }) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "register" && password !== password2) { setError("The passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }),
      });
      const body = (await res.json()) as { user?: { id: number; username: string }; error?: string };
      if (!res.ok || !body.user) setError(body.error ?? `Failed (${res.status})`);
      else onLoggedIn(body.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-4 rounded-md border bg-card p-6 shadow-sm" data-testid="login-form">
      <div>
        <h1 className="text-xl font-bold tracking-tight">MC Screen Designer</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "login" ? "Log in to open your projects." : "Create an account — your projects, textures and structures are stored with it."}
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-xs">
        Username
        <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required name="username" />
      </label>
      <label className="flex flex-col gap-1.5 text-xs">
        Password
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} name="password" required
          autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} />
      </label>
      {mode === "register" && (
        <label className="flex flex-col gap-1.5 text-xs">
          Repeat password
          <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required name="password2" />
        </label>
      )}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>{mode === "login" ? "Log in" : "Create account"}</Button>
      <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
        {mode === "login" ? "No account yet? Create one" : "Already have an account? Log in"}
      </button>
    </form>
  );
}

/** Username + logout, for the projects page. */
export function AccountMenu() {
  const user = useAccount();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="account-menu">
      <UserRound className="h-3.5 w-3.5" />
      <span className="text-foreground">{user.username}</span>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => void logout()}>
        <LogOut className="h-3.5 w-3.5" /> Log out
      </Button>
    </div>
  );
}

/** Small "saved / saving / error" indicator for the editor's status bar. */
export function CloudStatusChip() {
  const status = useCloudStatus();
  const user = useAccount();
  if (!user || status === "off") return null;
  const Icon = status === "error" ? CloudAlert : status === "saving" ? CloudUpload : Cloud;
  const label = status === "error" ? "Not saved to account" : status === "saving" ? "Saving…" : "Saved";
  return (
    <span className={`flex items-center gap-1 ${status === "error" ? "text-destructive" : ""}`} title={`Account: ${user.username}`} data-testid="cloud-status">
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}
