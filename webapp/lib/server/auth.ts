import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import { accountsEnabled, db } from "./db";

/**
 * Accounts: scrypt password hashes, random session tokens in an httpOnly cookie (only their SHA-256
 * is stored), same-origin checks for every state-changing request.
 */
export const SESSION_COOKIE = "mmb_session";
const SESSION_DAYS = 30;

export interface SessionUser { id: number; username: string }

const scryptAsync = (pw: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((resolve, reject) => scrypt(pw, salt, len, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(pw, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(key, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Secure cookies only when the page itself came over https (plain-http LAN dev servers would drop them). */
function cookieAttrs(request: Request, maxAge: number): string {
  const https = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? "; Secure" : ""}`;
}

export async function createSession(request: Request, userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await (await db()).execute("INSERT INTO mmb_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [sha256(token), userId, now + SESSION_DAYS * 86400_000, now]);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieAttrs(request, SESSION_DAYS * 86400)}`;
}

export async function destroySession(request: Request): Promise<string> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await (await db()).execute("DELETE FROM mmb_sessions WHERE token_hash = ?", [sha256(token)]);
  return `${SESSION_COOKIE}=; ${cookieAttrs(request, 0)}`;
}

export async function currentUser(request: Request): Promise<SessionUser | null> {
  if (!accountsEnabled()) return null;
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const [rows] = await (await db()).execute<RowDataPacket[]>(
    "SELECT u.id, u.username FROM mmb_sessions s JOIN mmb_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    [sha256(token), Date.now()]);
  return rows[0] ? { id: Number(rows[0].id), username: String(rows[0].username) } : null;
}

/** Refuses cross-site writes: the Origin (when the browser sends one) must be this host. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}

/**
 * Common guard for the account APIs: accounts configured, same-origin for writes, a logged-in
 * user. Returns the user or the error response to send.
 */
export async function requireUser(request: Request): Promise<SessionUser | Response> {
  if (!accountsEnabled()) return Response.json({ error: "Accounts are not configured on this server." }, { status: 404 });
  if (request.method !== "GET" && !sameOrigin(request)) return Response.json({ error: "Cross-origin request refused" }, { status: 403 });
  const user = await currentUser(request);
  return user ?? Response.json({ error: "Not logged in" }, { status: 401 });
}

/** Simple in-memory brake on password guessing: 10 failures per username+IP per 15 minutes. */
const failures: Map<string, number[]> = ((globalThis as { __mmbFails?: Map<string, number[]> }).__mmbFails ??= new Map<string, number[]>());
const WINDOW = 15 * 60_000;
export function tooManyFailures(key: string): boolean {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW);
  failures.set(key, list);
  return list.length >= 10;
}
export function recordFailure(key: string) {
  failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
}
export function clientKey(request: Request, username: string): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
  return `${ip}|${username.toLowerCase()}`;
}
