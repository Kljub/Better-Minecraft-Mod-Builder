"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { clearTextures, deleteTexture, loadAllTextures, saveTexture } from "./textureStore";
import { extractFromPack, type ExtractResult } from "./extractFromPack";
import { extractFromGithub, fetchGithubPackCatalog } from "./extractFromGithub";

export const REQUIRED_TEXTURES = [
  "mc_panel_slice.png",
  "mc_slider_track_slice.png",
  "mc_slider_handle_slice.png",
  "mc_button_normal.png",
  "mc_button_hover.png",
  "mc_slot_tile.png",
  "mc_scrollbar_handle.png",
  "mc_checkbox.png",
  "mc_checkbox_selected.png",
  "mc_checkbox_highlighted.png",
  "mc_checkbox_selected_highlighted.png",
  "tab_selected_left.png",
  "tab_selected_middle.png",
  "tab_selected_right.png",
  "tab_unselected_left.png",
  "tab_unselected_middle.png",
  "tab_unselected_right.png",
  "widget_tab_selected.png",
  "widget_tab_unselected.png",
] as const;

export type TextureName = (typeof REQUIRED_TEXTURES)[number];

interface TextureCtx {
  textures: Partial<Record<TextureName, string>>;
  packTextures: Record<string, string>;
  ready: boolean;
  initialized: boolean;
  setupRequired: boolean;
  uploadFiles: (files: FileList) => Promise<void>;
  /** Saves a single custom image (e.g. for a sprite/icon widget) under a fresh "custom/<name>" pack key and returns that key. */
  uploadCustomTexture: (file: File) => Promise<string>;
  /** Permanently deletes a custom ("custom/..."-keyed) texture. No-op for pack/extracted textures. */
  deleteCustomTexture: (key: string) => Promise<void>;
  /** Renames a custom texture (new filename stem, extension kept) — returns its new pack key. */
  renameCustomTexture: (key: string, newStem: string) => Promise<string>;
  extractPack: (file: File) => Promise<ExtractResult>;
  reload: () => Promise<void>;
  reset: () => Promise<void>;
}

const Ctx = createContext<TextureCtx>({
  textures: {},
  packTextures: {},
  ready: false,
  initialized: false,
  setupRequired: false,
  uploadFiles: async () => {},
  uploadCustomTexture: async () => "",
  deleteCustomTexture: async () => {},
  renameCustomTexture: async () => "",
  extractPack: async () => ({ extracted: [], missing: [] }),
  reload: async () => {},
  reset: async () => {},
});

export function useTextures() {
  return useContext(Ctx);
}

export function TextureProvider({ children }: { children: React.ReactNode }) {
  const [textures, setTextures] = useState<Partial<Record<TextureName, string>>>({});
  const [packTextures, setPackTextures] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const urlsRef = useRef<string[]>([]);
  // Raw GitHub CDN URLs for arbitrary pack textures (sprite/icon widgets),
  // fetched once and merged under any keys an uploaded pack didn't provide.
  const githubCatalogRef = useRef<Record<string, string>>({});

  const applyBlobs = (blobs: Record<string, Blob>) => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    const next: Partial<Record<TextureName, string>> = {};
    const pack: Record<string, string> = { ...githubCatalogRef.current };
    for (const name of REQUIRED_TEXTURES) {
      if (blobs[name]) {
        const url = URL.createObjectURL(blobs[name]);
        urlsRef.current.push(url);
        next[name] = url;
        // Also expose derived textures in the picker under a virtual folder
        pack[`extracted/${name}`] = url;
      }
    }
    setTextures(next);
    for (const [key, blob] of Object.entries(blobs)) {
      if (key.startsWith("pack:")) {
        const url = URL.createObjectURL(blob);
        urlsRef.current.push(url);
        pack[key.slice(5)] = url; // an uploaded pack's own file wins over the GitHub catalog entry
      }
    }
    setPackTextures(pack);
  };

  /**
   * Loads textures from IndexedDB; if empty, auto-loads the default
   * reference pack straight from GitHub's raw CDN (the browser fetches
   * directly from GitHub — this app never hosts or redistributes those
   * bytes itself). Only falls back to requiring manual "upload a JAR/pack"
   * if that fetch didn't fully succeed (offline, GitHub unreachable, etc),
   * so the app keeps working either way. Shared by the mount effect and reset().
   */
  const loadOrAutoFetch = async () => {
    let blobs = await loadAllTextures();
    if (Object.keys(blobs).length === 0) {
      const result = await extractFromGithub().catch(() => null);
      blobs = await loadAllTextures();
      const gotAllRequired = result && result.missing.length === 0;
      if (!gotAllRequired || Object.keys(blobs).length === 0) {
        setSetupRequired(true);
        setInitialized(true);
        return;
      }
    }
    applyBlobs(blobs);
    setSetupRequired(false);
    setInitialized(true);
  };

  useEffect(() => {
    // The GitHub pack catalog (arbitrary item/sprite textures) is
    // independent of the required-texture pipeline below — fetch it
    // opportunistically; an empty result just means nothing to browse.
    fetchGithubPackCatalog().then((catalog) => {
      githubCatalogRef.current = catalog;
      setPackTextures((prev) => ({ ...catalog, ...prev }));
    });

    loadOrAutoFetch().catch((e) => {
      console.error(e);
      setSetupRequired(true);
      setInitialized(true);
    });
    return () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadFiles = async (files: FileList) => {
    const blobs = await loadAllTextures();
    for (const file of Array.from(files)) {
      if ((REQUIRED_TEXTURES as readonly string[]).includes(file.name)) {
        await saveTexture(file.name, file);
        blobs[file.name] = file;
      }
    }
    applyBlobs(blobs);
  };

  const safeName = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, "_");

  /** Builds a fresh unused "custom/<stem><ext>" key, disambiguating with a "_2", "_3", ... suffix
   * against whatever's currently loaded — shared by uploadCustomTexture and renameCustomTexture.
   * `ignoreKey` lets a rename keep its own current key out of the collision check. */
  const freshCustomKey = (stem: string, ext: string, ignoreKey?: string): string => {
    let key = `custom/${safeName(stem)}${ext}`;
    let n = 2;
    while (packTextures[key] && key !== ignoreKey) key = `custom/${safeName(stem)}_${n++}${ext}`;
    return key;
  };

  const uploadCustomTexture = async (file: File): Promise<string> => {
    const dot = file.name.lastIndexOf(".");
    const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
    const ext = dot > 0 ? file.name.slice(dot) : "";
    const key = freshCustomKey(stem, ext);
    await saveTexture(`pack:${key}`, file);
    applyBlobs(await loadAllTextures());
    return key;
  };

  const deleteCustomTexture = async (key: string): Promise<void> => {
    if (!key.startsWith("custom/")) return;
    await deleteTexture(`pack:${key}`);
    applyBlobs(await loadAllTextures());
  };

  const renameCustomTexture = async (key: string, newStem: string): Promise<string> => {
    if (!key.startsWith("custom/")) return key;
    const blobs = await loadAllTextures();
    const blob = blobs[`pack:${key}`];
    if (!blob) return key;
    const dot = key.lastIndexOf(".");
    const ext = dot > 0 ? key.slice(dot) : "";
    const newKey = freshCustomKey(newStem, ext, key);
    if (newKey === key) return key;
    await saveTexture(`pack:${newKey}`, blob);
    await deleteTexture(`pack:${key}`);
    applyBlobs(await loadAllTextures());
    return newKey;
  };

  const extractPackFn = async (file: File): Promise<ExtractResult> => {
    const buffer = await file.arrayBuffer();
    const result = await extractFromPack(buffer);
    applyBlobs(await loadAllTextures());
    setSetupRequired(false);
    setInitialized(true);
    return result;
  };

  const reload = async () => {
    applyBlobs(await loadAllTextures());
  };

  const reset = async () => {
    await clearTextures();
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    setTextures({});
    setPackTextures({});
    // Same auto-detect flow as first mount: try the default GitHub-hosted
    // pack again, only falling back to manual upload if that fails.
    await loadOrAutoFetch();
  };

  const ready = REQUIRED_TEXTURES.every((n) => !!textures[n]);

  return (
    <Ctx.Provider value={{
      textures, packTextures, ready, initialized, setupRequired, uploadFiles, uploadCustomTexture,
      deleteCustomTexture, renameCustomTexture, extractPack: extractPackFn, reload, reset,
    }}>
      {children}
    </Ctx.Provider>
  );
}
