/** Shared validation for register/login bodies. */
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;

export async function readCredentials(request: Request): Promise<{ username: string; password: string } | Response> {
  let body: { username?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) return Response.json({ error: "Username and password are required." }, { status: 400 });
  if (password.length > 256) return Response.json({ error: "Password too long." }, { status: 400 });
  return { username, password };
}
