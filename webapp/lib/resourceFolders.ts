"use client";

import { useSyncExternalStore } from "react";
import { cloudPutSetting } from "@/lib/cloud/sync";

/**
 * Folders for the Resources tab. Folders are pure organisation metadata — a
 * custom texture's key ("custom/foo.png") never changes when it's moved, so
 * items/blocks/etc. that reference it keep working. Like the custom textures
 * themselves (IndexedDB), this is per browser, not per project.
 */
export interface ResourceFolderState {
  /** folder names, in display order */
  folders: string[];
  /** texture key -> folder name; keys not listed are "Unsorted" */
  assign: Record<string, string>;
}

const STORAGE_KEY = "mc-ui-builder:resource-folders";
const EMPTY: ResourceFolderState = { folders: [], assign: {} };

let state: ResourceFolderState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load(): ResourceFolderState {
  if (loaded) return state;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ResourceFolderState>;
      state = {
        folders: Array.isArray(parsed.folders) ? parsed.folders.filter((f) => typeof f === "string") : [],
        assign: parsed.assign && typeof parsed.assign === "object" ? parsed.assign : {},
      };
    }
  } catch {
    state = EMPTY;
  }
  return state;
}

function set(next: ResourceFolderState) {
  state = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable — keep in memory */ }
  cloudPutSetting("resource-folders", next);
  listeners.forEach((l) => l());
}

export function useResourceFolders(): ResourceFolderState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    load,
    () => EMPTY,
  );
}

/** Trims and strips slashes; returns "" for an unusable name. */
export function cleanFolderName(name: string): string {
  return name.replace(/[\\/]/g, "").trim().slice(0, 64);
}

export function createFolder(name: string): string | null {
  const s = load();
  const clean = cleanFolderName(name);
  if (!clean || s.folders.includes(clean)) return null;
  set({ ...s, folders: [...s.folders, clean] });
  return clean;
}

export function renameFolder(from: string, to: string): boolean {
  const s = load();
  const clean = cleanFolderName(to);
  if (!clean || clean === from || s.folders.includes(clean)) return false;
  const assign = Object.fromEntries(Object.entries(s.assign).map(([k, f]) => [k, f === from ? clean : f]));
  set({ folders: s.folders.map((f) => (f === from ? clean : f)), assign });
  return true;
}

/** Deletes the folder; its images go back to "Unsorted" (they are not deleted). */
export function deleteFolder(name: string) {
  const s = load();
  const assign = Object.fromEntries(Object.entries(s.assign).filter(([, f]) => f !== name));
  set({ folders: s.folders.filter((f) => f !== name), assign });
}

/** Moves textures into `folder`, or back to "Unsorted" when `folder` is null. */
export function moveToFolder(keys: string[], folder: string | null) {
  const s = load();
  const assign = { ...s.assign };
  for (const k of keys) {
    if (folder) assign[k] = folder;
    else delete assign[k];
  }
  set({ ...s, assign });
}

/** Keeps a texture in its folder after it was renamed (its key changed). */
export function renameAssignedKey(oldKey: string, newKey: string) {
  const s = load();
  if (oldKey === newKey || !(oldKey in s.assign)) return;
  const { [oldKey]: folder, ...rest } = s.assign;
  set({ ...s, assign: { ...rest, [newKey]: folder } });
}

export function forgetKey(key: string) {
  const s = load();
  if (!(key in s.assign)) return;
  const { [key]: _removed, ...rest } = s.assign; // eslint-disable-line @typescript-eslint/no-unused-vars
  set({ ...s, assign: rest });
}

/** The folder an image is in (null = Unsorted), outside React (e.g. a duplicate keeps its folder). */
export function folderOfKey(key: string): string | null {
  const s = load();
  const f = s.assign[key];
  return f && s.folders.includes(f) ? f : null;
}
