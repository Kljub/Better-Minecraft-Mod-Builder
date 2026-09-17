import { saveTexture } from "./textureStore";
import {
  TASKS_9SLICE, NESTED_TAB_TASKS, CHECKBOX_SPRITES, TAB_SPRITES, HUD_SPRITES,
  SLOT_SPRITE_PATH, SLOT_CROP, SCROLLBAR_SPRITE_PATH, SCROLLBAR_ATLAS_FALLBACK,
  sample9slice, bitmapToImageData, imageDataToBlob, cropImageData,
} from "./textureTasks";
import type { ExtractResult } from "./extractFromPack";

// Faithful-Pack/Default-Java mirrors vanilla Minecraft's GUI textures 1:1 at
// native resolution (it's a scaffold repo for texture-pack contributors, not
// a distinct art style) — used here purely as a texture *source*. Every
// fetch below goes straight from the user's own browser to GitHub's raw CDN;
// this app never downloads, stores, or re-serves the bytes itself.
const GITHUB_OWNER = "Faithful-Pack";
const GITHUB_REPO = "Default-Java";
const GITHUB_REF = "1.21.11";

function rawUrl(assetPath: string): string {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/${assetPath}`;
}

/** Fetches a texture path from the GitHub raw CDN as an ImageBitmap. Returns null on any failure (404, network, etc). */
async function readBitmap(assetPath: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(rawUrl(assetPath));
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/**
 * Fetches the same set of GUI sprites as extractFromPack.ts, but pulls each
 * one directly from GitHub's raw CDN instead of reading them out of an
 * uploaded ZIP. Same task list, same slicing/cropping math (lib/textureTasks.ts)
 * — the result is byte-identical to what uploading this same pack would produce.
 */
export async function extractFromGithub(): Promise<ExtractResult> {
  const extracted: string[] = [];
  const missing: string[] = [];

  for (const task of [...TASKS_9SLICE, ...NESTED_TAB_TASKS]) {
    const bitmap = await readBitmap(task.path);
    if (!bitmap) { missing.push(task.name); continue; }
    const srcData = bitmapToImageData(bitmap);
    const bitmapWidth = bitmap.width;
    bitmap.close();
    const blob = await imageDataToBlob(sample9slice(srcData, bitmapWidth, task));
    await saveTexture(task.name, blob);
    extracted.push(task.name);
  }

  for (const { name, path } of [...CHECKBOX_SPRITES, ...TAB_SPRITES, ...HUD_SPRITES]) {
    const bitmap = await readBitmap(path);
    if (bitmap) {
      const blob = await imageDataToBlob(bitmapToImageData(bitmap));
      bitmap.close();
      await saveTexture(name, blob);
      extracted.push(name);
    } else {
      missing.push(name);
    }
  }

  const slotBitmap = await readBitmap(SLOT_SPRITE_PATH);
  if (slotBitmap) {
    const blob = await imageDataToBlob(bitmapToImageData(slotBitmap));
    slotBitmap.close();
    await saveTexture("mc_slot_tile.png", blob);
    extracted.push("mc_slot_tile.png");
  } else {
    const inventoryBitmap = await readBitmap(SLOT_CROP.path);
    if (inventoryBitmap) {
      const srcData = bitmapToImageData(inventoryBitmap);
      inventoryBitmap.close();
      const cropped = cropImageData(srcData, SLOT_CROP.x, SLOT_CROP.y, SLOT_CROP.w, SLOT_CROP.h);
      const blob = await imageDataToBlob(cropped);
      await saveTexture("mc_slot_tile.png", blob);
      extracted.push("mc_slot_tile.png");
    } else {
      missing.push("mc_slot_tile.png");
    }
  }

  const scrollbarBitmap = await readBitmap(SCROLLBAR_SPRITE_PATH);
  if (scrollbarBitmap) {
    const blob = await imageDataToBlob(bitmapToImageData(scrollbarBitmap));
    scrollbarBitmap.close();
    await saveTexture("mc_scrollbar_handle.png", blob);
    extracted.push("mc_scrollbar_handle.png");
  } else {
    const tabsBitmap = await readBitmap(SCROLLBAR_ATLAS_FALLBACK.path);
    if (tabsBitmap) {
      const srcData = bitmapToImageData(tabsBitmap);
      tabsBitmap.close();
      const cropped = cropImageData(
        srcData,
        SCROLLBAR_ATLAS_FALLBACK.x, SCROLLBAR_ATLAS_FALLBACK.y,
        SCROLLBAR_ATLAS_FALLBACK.w, SCROLLBAR_ATLAS_FALLBACK.h
      );
      const blob = await imageDataToBlob(cropped);
      await saveTexture("mc_scrollbar_handle.png", blob);
      extracted.push("mc_scrollbar_handle.png");
    } else {
      missing.push("mc_scrollbar_handle.png");
    }
  }

  return { extracted, missing };
}

// ── Pack catalog (arbitrary item/sprite textures for sprite & icon widgets) ──
//
// Uses the GitHub Trees API to list every texture path in the repo, then
// exposes each as its raw CDN URL directly — no fetching/caching into
// IndexedDB, since that would mean pulling down hundreds of files eagerly.
// The browser's own HTTP cache handles repeat loads. Unlike raw.githubusercontent.com,
// api.github.com is rate-limited for unauthenticated requests, so a failure
// here is non-fatal: the catalog just stays empty (manual pack upload still
// works as a fallback — see TextureContext's uploadFiles/extractPack).

interface GithubTreeEntry {
  path: string;
  type: "blob" | "tree";
}
interface GithubTreeResponse {
  tree: GithubTreeEntry[];
  truncated: boolean;
}

export async function fetchGithubPackCatalog(): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${GITHUB_REF}?recursive=1`
    );
    if (!res.ok) return {};
    const data: GithubTreeResponse = await res.json();
    const catalog: Record<string, string> = {};
    const packRe = /^assets\/[^/]+\/textures\/(.+\.png)$/;
    for (const entry of data.tree) {
      if (entry.type !== "blob") continue;
      const m = packRe.exec(entry.path);
      if (!m) continue;
      catalog[m[1]] = rawUrl(entry.path);
    }
    return catalog;
  } catch {
    return {};
  }
}
