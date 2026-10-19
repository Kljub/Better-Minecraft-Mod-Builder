import { requireUser } from "@/lib/server/auth";
import { createModToken, listModTokens, revokeModToken } from "@/lib/server/modTokens";

/** Settings → Minecraft mod: the user's companion-mod tokens. POST returns the new token once. */
export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  return Response.json({ tokens: await listModTokens(user.id) });
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const body = await request.json().catch(() => ({})) as { label?: unknown };
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 100) : "";
  return Response.json(await createModToken(user.id, label || "Minecraft"));
}

export async function DELETE(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Bad id" }, { status: 400 });
  await revokeModToken(user.id, id);
  return Response.json({ ok: true });
}
