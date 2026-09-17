import JSZip from "jszip";
import { saveTexture } from "./textureStore";
import {
  TASKS_9SLICE, NESTED_TAB_TASKS, CHECKBOX_SPRITES, TAB_SPRITES, HUD_SPRITES,
  SLOT_SPRITE_PATH, SLOT_CROP, SCROLLBAR_SPRITE_PATH, SCROLLBAR_ATLAS_FALLBACK,
  sample9slice, bitmapToImageData, imageDataToBlob, cropImageData,
} from "./textureTasks";

export interface ExtractResult {
  extracted: string[];
  missing: string[];
}

/**
 * Reads a file entry from the ZIP as an ImageBitmap.
 * Returns null if the entry doesn't exist.
 */
async function readBitmap(zip: JSZip, path: string): Promise<ImageBitmap | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  const buf = await entry.async("arraybuffer");
  return createImageBitmap(new Blob([buf], { type: "image/png" }));
}

/**
 * Load a JAR or resource pack ZIP (as an ArrayBuffer), extract the known
 * GUI sprites, and persist them to IndexedDB.
 *
 * Returns which texture names were successfully extracted vs not found.
 */
export async function extractFromPack(buffer: ArrayBuffer): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(buffer);

  const extracted: string[] = [];
  const missing: string[] = [];

  // --- 9-slice textures ---
  for (const task of [...TASKS_9SLICE, ...NESTED_TAB_TASKS]) {
    const bitmap = await readBitmap(zip, task.path);
    if (!bitmap) {
      missing.push(task.name);
      continue;
    }
    const srcData = bitmapToImageData(bitmap);
    const bitmapWidth = bitmap.width;
    bitmap.close();
    const sliced = sample9slice(srcData, bitmapWidth, task);
    const blob = await imageDataToBlob(sliced);
    await saveTexture(task.name, blob);
    extracted.push(task.name);
  }

  // --- Checkbox + tab + HUD bar sprites: direct copy ---
  for (const { name, path } of [...CHECKBOX_SPRITES, ...TAB_SPRITES, ...HUD_SPRITES]) {
    const bitmap = await readBitmap(zip, path);
    if (bitmap) {
      const blob = await imageDataToBlob(bitmapToImageData(bitmap));
      bitmap.close();
      await saveTexture(name, blob);
      extracted.push(name);
    } else {
      missing.push(name);
    }
  }

  // --- Slot tile: dedicated sprite (1.20.2+), atlas crop as fallback for older packs ---
  const slotBitmap = await readBitmap(zip, SLOT_SPRITE_PATH);
  if (slotBitmap) {
    const blob = await imageDataToBlob(bitmapToImageData(slotBitmap));
    slotBitmap.close();
    await saveTexture("mc_slot_tile.png", blob);
    extracted.push("mc_slot_tile.png");
  } else {
    const inventoryBitmap = await readBitmap(zip, SLOT_CROP.path);
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

  // --- Scrollbar handle: creative-inventory scroller sprite ---
  const scrollbarBitmap = await readBitmap(zip, SCROLLBAR_SPRITE_PATH);
  if (scrollbarBitmap) {
    const blob = await imageDataToBlob(bitmapToImageData(scrollbarBitmap));
    scrollbarBitmap.close();
    await saveTexture("mc_scrollbar_handle.png", blob);
    extracted.push("mc_scrollbar_handle.png");
  } else {
    const tabsBitmap = await readBitmap(zip, SCROLLBAR_ATLAS_FALLBACK.path);
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

  // --- Store raw pack textures (gui + item) for use as widget sources ---
  const packRe = /^assets\/[^/]+\/textures\/.+\.png$/;
  const packFiles = Object.keys(zip.files).filter(p => packRe.test(p) && !zip.files[p].dir);
  for (const path of packFiles) {
    const entry = zip.files[path];
    const buf = await entry.async("arraybuffer");
    const blob = new Blob([buf], { type: "image/png" });
    // Key: strip "assets/<namespace>/textures/" prefix → e.g. "gui/sprites/widget/button.png"
    const key = path.replace(/^assets\/[^/]+\/textures\//, "pack:");
    await saveTexture(key, blob);
  }

  return { extracted, missing };
}
