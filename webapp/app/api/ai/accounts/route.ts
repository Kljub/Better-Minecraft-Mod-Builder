import { requireUser } from "@/lib/server/auth";
import { addAccount, listAccounts, removeAccount, reorderAccounts, updateAccount, type AiAccountKind, type AiProvider } from "@/lib/server/aiAccounts";

/**
 * Linked AI accounts of the logged-in user (Settings → AI → Accounts). Secrets go in, never out:
 * GET lists labels, queue order and quota only.
 * POST { provider: "claude", kind: "oauth_token"|"api_key", label, secret } — Codex accounts are
 * added through ./codex-login (device login or API key).
 * PATCH { id, label?, enabled?, secret?, kind? } or { order: number[] }; DELETE ?id=
 */
const json = async (request: Request) => { try { return await request.json(); } catch { return null; } };

/** Shape check only — a wrong token still fails at its first run / "Check". */
function claudeSecret(kind: unknown, secret: unknown): string | null {
  if (typeof secret !== "string") return null;
  const s = secret.trim();
  if (kind === "oauth_token") return /^sk-ant-oat\d*-[\w-]{20,}$/.test(s) ? s : null;
  if (kind === "api_key") return /^sk-ant-api\d*-[\w-]{20,}$/.test(s) ? s : null;
  return null;
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  return Response.json({ accounts: await listAccounts(user.id) });
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = await json(request);
  if (!body || body.provider !== "claude") return Response.json({ error: "Add Claude accounts here; Codex accounts via the Codex login." }, { status: 400 });
  const secret = claudeSecret(body.kind, body.secret);
  if (!secret) {
    return Response.json({ error: body.kind === "api_key" ? "That doesn't look like an Anthropic API key (sk-ant-api…)." : "That doesn't look like a token from `claude setup-token` (sk-ant-oat…)." }, { status: 400 });
  }
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : `Claude ${body.kind === "api_key" ? "API key" : "account"}`;
  const id = await addAccount(user.id, { provider: "claude" as AiProvider, kind: body.kind as AiAccountKind, label, secret });
  return Response.json({ id });
}

export async function PATCH(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = await json(request);
  if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  if (Array.isArray(body.order)) {
    await reorderAccounts(user.id, body.order.map(Number).filter(Number.isInteger));
    return Response.json({ ok: true });
  }
  const id = Number(body.id);
  if (!Number.isInteger(id)) return Response.json({ error: "Missing id" }, { status: 400 });
  const patch: { label?: string; enabled?: boolean; secret?: string; kind?: AiAccountKind } = {};
  if (typeof body.label === "string" && body.label.trim()) patch.label = body.label.trim();
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.secret !== undefined) {
    const secret = claudeSecret(body.kind, body.secret);
    if (!secret) return Response.json({ error: "Invalid token / key." }, { status: 400 });
    patch.secret = secret;
    patch.kind = body.kind;
  }
  try { await updateAccount(user.id, id, patch); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 404 }); }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "Missing id" }, { status: 400 });
  await removeAccount(user.id, id);
  return Response.json({ ok: true });
}
