"use client";

import { useSyncExternalStore } from "react";

/**
 * Cloud storage for logged-in users (server: app/api/{sync,projects,files,kv}, MySQL).
 *
 * The browser stores (localStorage projects, IndexedDB textures/structures) stay the working copy
 * the editor reads and writes synchronously; this module mirrors them to the account:
 * - initialSync() runs once after login/page load, before the app renders: pulls what's newer on
 *   the server, uploads what only exists locally (that's how pre-account projects move into the
 *   account), drops projects deleted elsewhere.
 * - afterwards every local write is pushed (projects debounced per key).
 * A browser only ever caches one account: if another user logs in, the local copy is cleared first.
 */

export const PROJECTS_KEY = "mc-ui-builder-projects";
const OWNER_KEY = "mc-ui-builder:account";
const RESOURCE_FOLDERS_KEY = "mc-ui-builder:resource-folders";
const LAST_PROJECT_KEY = "mc-ui-builder-last-project";

export type CloudStatus = "off" | "saved" | "saving" | "error";

interface StoredProjectLike { key: string; updatedAt: number; session: unknown }

let active = false;
let status: CloudStatus = "off";
const listeners = new Set<() => void>();
const pushedAt = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, StoredProjectLike>();
let inflight = 0;

function setStatus(s: CloudStatus) {
  if (status === s) return;
  status = s;
  listeners.forEach((l) => l());
}

export function useCloudStatus(): CloudStatus {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => status, () => "off");
}

export function cloudActive(): boolean {
  return active;
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status}`);
  return res;
}

/** Runs a write, keeping the status chip honest. */
async function track(fn: () => Promise<unknown>) {
  inflight++;
  setStatus("saving");
  try {
    await fn();
    if (--inflight === 0 && !pending.size) setStatus("saved");
  } catch (e) {
    inflight--;
    console.error("cloud sync failed", e);
    setStatus("error");
  }
}

// ---- projects -------------------------------------------------------------------------------

function readLocalProjects(): StoredProjectLike[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalProjects(list: StoredProjectLike[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
}

const putProject = (p: StoredProjectLike) =>
  api(`/api/projects?key=${encodeURIComponent(p.key)}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ updatedAt: p.updatedAt, session: p.session }),
  });

function flushProject(key: string) {
  const p = pending.get(key);
  timers.delete(key);
  if (!p) return;
  pending.delete(key);
  void track(async () => { await putProject(p); pushedAt.set(key, p.updatedAt); });
}

/** Called with the full list after every local save: pushes the projects that changed. */
export function cloudSaveProjects(projects: StoredProjectLike[]) {
  if (!active) return;
  for (const p of projects) {
    if (!p?.key || (pushedAt.get(p.key) ?? -1) >= p.updatedAt) continue;
    pending.set(p.key, p);
    setStatus("saving");
    clearTimeout(timers.get(p.key));
    timers.set(p.key, setTimeout(() => flushProject(p.key), 1200));
  }
}

/** Only explicit deletes remove a project from the account (never "missing from a list"). */
export function cloudDeleteProject(key: string) {
  if (!active) return;
  clearTimeout(timers.get(key));
  timers.delete(key);
  pending.delete(key);
  void track(() => api(`/api/projects?key=${encodeURIComponent(key)}`, { method: "DELETE" }));
}

/** Sends pending project saves now (before logout / page hide). */
export async function flushCloud() {
  const keys = [...pending.keys()];
  for (const k of keys) { clearTimeout(timers.get(k)); flushProject(k); }
  while (inflight > 0) await new Promise((r) => setTimeout(r, 50));
}

// ---- files & settings -------------------------------------------------------------------------

export type CloudFileKind = "texture" | "structure";

const fileUrl = (kind: CloudFileKind, key: string) => `/api/files?kind=${kind}&key=${encodeURIComponent(key)}`;

export function cloudPutFile(kind: CloudFileKind, key: string, blob: Blob) {
  if (!active) return;
  void track(() => api(fileUrl(kind, key), { method: "PUT", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob }));
}

export function cloudDeleteFile(kind: CloudFileKind, key: string) {
  if (!active) return;
  void track(() => api(fileUrl(kind, key), { method: "DELETE" }));
}

export function cloudPutSetting(key: "resource-folders", value: unknown) {
  if (!active) return;
  void track(() => api(`/api/kv?key=${key}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ value }) }));
}

// ---- IndexedDB access without the sync hooks (avoids echoing downloads back up) ------------------

function idb<T>(dbName: string, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(store);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction(store, mode);
      const r = fn(tx.objectStore(store));
      tx.oncomplete = () => { req.result.close(); resolve(r ? r.result : undefined); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

const STORES: Record<CloudFileKind, { db: string; store: string; prefix: string }> = {
  // custom textures only — extracted vanilla/pack textures stay per browser (never uploaded)
  texture: { db: "mc-ui-builder", store: "textures", prefix: "pack:" },
  structure: { db: "mc-ui-builder-structures", store: "structures", prefix: "" },
};

async function localFileKeys(kind: CloudFileKind): Promise<string[]> {
  const { db, store, prefix } = STORES[kind];
  const keys = ((await idb<IDBValidKey[]>(db, store, "readonly", (s) => s.getAllKeys())) ?? []).map(String);
  if (kind === "texture") return keys.filter((k) => k.startsWith("pack:custom/")).map((k) => k.slice(prefix.length));
  return keys;
}

const localFileGet = (kind: CloudFileKind, key: string) =>
  idb<Blob>(STORES[kind].db, STORES[kind].store, "readonly", (s) => s.get(STORES[kind].prefix + key));
const localFilePut = (kind: CloudFileKind, key: string, blob: Blob) =>
  idb(STORES[kind].db, STORES[kind].store, "readwrite", (s) => { s.put(blob, STORES[kind].prefix + key); });
const localFileDelete = (kind: CloudFileKind, key: string) =>
  idb(STORES[kind].db, STORES[kind].store, "readwrite", (s) => { s.delete(STORES[kind].prefix + key); });

// ---- login / logout ---------------------------------------------------------------------------

/** Removes everything the account syncs from this browser (not the extracted vanilla textures). */
async function clearLocalAccountData() {
  for (const k of [PROJECTS_KEY, RESOURCE_FOLDERS_KEY, LAST_PROJECT_KEY]) localStorage.removeItem(k);
  for (const kind of ["texture", "structure"] as CloudFileKind[]) {
    for (const key of await localFileKeys(kind)) await localFileDelete(kind, key);
  }
}

interface Manifest {
  projects: { key: string; updatedAt: number; deletedAt: number | null }[];
  files: { kind: string; key: string; updatedAt: number }[];
  kv: { key: string; updatedAt: number }[];
}

/**
 * Brings this browser and the account in line. Runs before the app renders, so the pages'
 * synchronous localStorage reads already see the merged state.
 */
export async function initialSync(userId: number) {
  const owner = localStorage.getItem(OWNER_KEY);
  if (owner && owner !== String(userId)) await clearLocalAccountData();
  const manifest = (await (await api("/api/sync")).json()) as Manifest;

  // Projects: newest wins per key; tombstones remove older local copies.
  const local = readLocalProjects();
  const byKey = new Map(local.map((p) => [p.key, p]));
  const uploads: StoredProjectLike[] = [];
  for (const s of manifest.projects) {
    const l = byKey.get(s.key);
    if (s.deletedAt != null) {
      if (l && l.updatedAt <= s.deletedAt) byKey.delete(s.key);
      else if (l) uploads.push(l);
      continue;
    }
    if (!l || s.updatedAt > l.updatedAt) {
      const remote = (await (await api(`/api/projects?key=${encodeURIComponent(s.key)}`)).json()) as StoredProjectLike;
      byKey.set(s.key, { ...(l ?? {}), key: s.key, updatedAt: remote.updatedAt, session: remote.session });
    } else if (l.updatedAt > s.updatedAt) uploads.push(l);
    pushedAt.set(s.key, Math.max(s.updatedAt, pushedAt.get(s.key) ?? -1));
  }
  const known = new Set(manifest.projects.map((p) => p.key));
  for (const l of local) if (!known.has(l.key)) uploads.push(l);
  writeLocalProjects([...byKey.values()]);
  for (const p of uploads) { await putProject(p); pushedAt.set(p.key, p.updatedAt); }

  // Files: download what's missing here, upload what's missing there.
  for (const kind of ["texture", "structure"] as CloudFileKind[]) {
    const here = new Set(await localFileKeys(kind));
    const there = new Set(manifest.files.filter((f) => f.kind === kind).map((f) => f.key));
    for (const key of there) {
      if (here.has(key)) continue;
      const res = await api(fileUrl(kind, key));
      await localFilePut(kind, key, await res.blob());
    }
    for (const key of here) {
      if (there.has(key)) continue;
      const blob = await localFileGet(kind, key);
      if (blob) await api(fileUrl(kind, key), { method: "PUT", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob });
    }
  }

  // Settings: the account's copy wins; a local-only one is uploaded.
  if (manifest.kv.some((k) => k.key === "resource-folders")) {
    const { value } = (await (await api("/api/kv?key=resource-folders")).json()) as { value: unknown };
    localStorage.setItem(RESOURCE_FOLDERS_KEY, JSON.stringify(value));
  } else {
    const raw = localStorage.getItem(RESOURCE_FOLDERS_KEY);
    if (raw) await api("/api/kv?key=resource-folders", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: JSON.parse(raw) }) });
  }

  localStorage.setItem(OWNER_KEY, String(userId));
  active = true;
  setStatus("saved");
}

/** Saves what's pending, ends the session and clears this browser's copy of the account. */
export async function logout() {
  await flushCloud().catch(() => {});
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  active = false;
  await clearLocalAccountData();
  localStorage.removeItem(OWNER_KEY);
  window.location.href = "/";
}
