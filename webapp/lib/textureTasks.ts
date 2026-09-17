// Shared texture-processing helpers and task definitions, used by both
// extractFromPack.ts (upload a JAR/resource pack ZIP) and
// extractFromGithub.ts (fetch individual files from a GitHub raw URL).
// Keeping the slicing/cropping math in one place means both loading paths
// produce byte-identical results — no drift between "uploaded" and
// "auto-loaded" textures.

export interface Task9Slice {
  name: string;
  path: string;
  slice: number;
  contentW?: number;
  contentH?: number;
  midCol?: number;
  midRow?: number;
  /**
   * Row offset applied only to the top-edge corner sampling, not to the
   * middle or bottom rows. widget/tab.png (the unselected nested-tab sprite)
   * pads its real border art 4px below the canvas's top row — vanilla draws
   * unselected tabs without the raised lip selected tabs have — so sampling
   * row 0 straight grabs transparent padding instead of the actual border.
   */
  topOffset?: number;
}

export interface TaskCrop {
  name: string;
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TASKS_9SLICE: Task9Slice[] = [
  {
    name: "mc_button_normal.png",
    path: "assets/minecraft/textures/gui/sprites/widget/button.png",
    slice: 2,
  },
  {
    name: "mc_button_hover.png",
    path: "assets/minecraft/textures/gui/sprites/widget/button_highlighted.png",
    slice: 2,
  },
  {
    name: "mc_slider_track_slice.png",
    path: "assets/minecraft/textures/gui/sprites/widget/slider.png",
    slice: 2,
  },
  {
    name: "mc_slider_handle_slice.png",
    path: "assets/minecraft/textures/gui/sprites/widget/slider_handle.png",
    slice: 2,
  },
  {
    name: "mc_panel_slice.png",
    path: "assets/minecraft/textures/gui/container/inventory.png",
    slice: 3,
    contentW: 176,
    contentH: 166,
    midCol: 88,
    midRow: 10,
  },
];

// Checkbox sprites (20×20, used as-is — no processing needed)
export const CHECKBOX_SPRITES: { name: string; path: string }[] = [
  { name: "mc_checkbox.png",                     path: "assets/minecraft/textures/gui/sprites/widget/checkbox.png" },
  { name: "mc_checkbox_selected.png",             path: "assets/minecraft/textures/gui/sprites/widget/checkbox_selected.png" },
  { name: "mc_checkbox_highlighted.png",          path: "assets/minecraft/textures/gui/sprites/widget/checkbox_highlighted.png" },
  { name: "mc_checkbox_selected_highlighted.png", path: "assets/minecraft/textures/gui/sprites/widget/checkbox_selected_highlighted.png" },
];

// HUD bar sprites (9×9 icons, 182×5 bars — used as-is, no processing needed)
export const HUD_SPRITES: { name: string; path: string }[] = [
  { name: "mc_heart_container.png",       path: "assets/minecraft/textures/gui/sprites/hud/heart/container.png" },
  { name: "mc_heart_full.png",            path: "assets/minecraft/textures/gui/sprites/hud/heart/full.png" },
  { name: "mc_heart_half.png",            path: "assets/minecraft/textures/gui/sprites/hud/heart/half.png" },
  { name: "mc_heart_absorbing_full.png",  path: "assets/minecraft/textures/gui/sprites/hud/heart/absorbing_full.png" },
  { name: "mc_heart_absorbing_half.png",  path: "assets/minecraft/textures/gui/sprites/hud/heart/absorbing_half.png" },
  { name: "mc_heart_withered_full.png",   path: "assets/minecraft/textures/gui/sprites/hud/heart/withered_full.png" },
  { name: "mc_heart_withered_half.png",   path: "assets/minecraft/textures/gui/sprites/hud/heart/withered_half.png" },
  { name: "mc_armor_empty.png",           path: "assets/minecraft/textures/gui/sprites/hud/armor_empty.png" },
  { name: "mc_armor_half.png",            path: "assets/minecraft/textures/gui/sprites/hud/armor_half.png" },
  { name: "mc_armor_full.png",            path: "assets/minecraft/textures/gui/sprites/hud/armor_full.png" },
  { name: "mc_food_empty.png",            path: "assets/minecraft/textures/gui/sprites/hud/food_empty.png" },
  { name: "mc_food_half.png",             path: "assets/minecraft/textures/gui/sprites/hud/food_half.png" },
  { name: "mc_food_full.png",             path: "assets/minecraft/textures/gui/sprites/hud/food_full.png" },
  { name: "mc_xp_bar_background.png",     path: "assets/minecraft/textures/gui/sprites/hud/experience_bar_background.png" },
  { name: "mc_xp_bar_progress.png",       path: "assets/minecraft/textures/gui/sprites/hud/experience_bar_progress.png" },
  { name: "mc_boss_bar_pink_background.png",   path: "assets/minecraft/textures/gui/sprites/boss_bar/pink_background.png" },
  { name: "mc_boss_bar_pink_progress.png",     path: "assets/minecraft/textures/gui/sprites/boss_bar/pink_progress.png" },
  { name: "mc_boss_bar_blue_background.png",   path: "assets/minecraft/textures/gui/sprites/boss_bar/blue_background.png" },
  { name: "mc_boss_bar_blue_progress.png",     path: "assets/minecraft/textures/gui/sprites/boss_bar/blue_progress.png" },
  { name: "mc_boss_bar_red_background.png",    path: "assets/minecraft/textures/gui/sprites/boss_bar/red_background.png" },
  { name: "mc_boss_bar_red_progress.png",      path: "assets/minecraft/textures/gui/sprites/boss_bar/red_progress.png" },
  { name: "mc_boss_bar_green_background.png",  path: "assets/minecraft/textures/gui/sprites/boss_bar/green_background.png" },
  { name: "mc_boss_bar_green_progress.png",    path: "assets/minecraft/textures/gui/sprites/boss_bar/green_progress.png" },
  { name: "mc_boss_bar_yellow_background.png", path: "assets/minecraft/textures/gui/sprites/boss_bar/yellow_background.png" },
  { name: "mc_boss_bar_yellow_progress.png",   path: "assets/minecraft/textures/gui/sprites/boss_bar/yellow_progress.png" },
  { name: "mc_boss_bar_purple_background.png", path: "assets/minecraft/textures/gui/sprites/boss_bar/purple_background.png" },
  { name: "mc_boss_bar_purple_progress.png",   path: "assets/minecraft/textures/gui/sprites/boss_bar/purple_progress.png" },
  { name: "mc_boss_bar_white_background.png",  path: "assets/minecraft/textures/gui/sprites/boss_bar/white_background.png" },
  { name: "mc_boss_bar_white_progress.png",    path: "assets/minecraft/textures/gui/sprites/boss_bar/white_progress.png" },
];

// Tab sprites from the advancements sprite sheet (28×32) — proper left/middle/right for both states
export const TAB_SPRITES: { name: string; path: string }[] = [
  { name: "tab_selected_left.png",     path: "assets/minecraft/textures/gui/sprites/advancements/tab_above_left_selected.png" },
  { name: "tab_selected_middle.png",   path: "assets/minecraft/textures/gui/sprites/advancements/tab_above_middle_selected.png" },
  { name: "tab_selected_right.png",    path: "assets/minecraft/textures/gui/sprites/advancements/tab_above_right_selected.png" },
  { name: "tab_unselected_left.png",   path: "assets/minecraft/textures/gui/sprites/advancements/tab_above_left.png" },
  { name: "tab_unselected_middle.png", path: "assets/minecraft/textures/gui/sprites/advancements/tab_above_middle.png" },
  { name: "tab_unselected_right.png",  path: "assets/minecraft/textures/gui/sprites/advancements/tab_above_right.png" },
];

// Nested tab sprites from the widget folder — 9-sliced at 3px, single texture per state
export const NESTED_TAB_TASKS: Task9Slice[] = [
  { name: "widget_tab_selected.png",   path: "assets/minecraft/textures/gui/sprites/widget/tab_selected.png", slice: 3 },
  { name: "widget_tab_unselected.png", path: "assets/minecraft/textures/gui/sprites/widget/tab.png",          slice: 3, topOffset: 4 },
];

// Slot tile: dedicated sprite (1.20.2+) preferred; atlas crop (with the 1px
// bevel border) as fallback for older packs where the sprite is missing.
export const SLOT_SPRITE_PATH = "assets/minecraft/textures/gui/sprites/container/slot.png";
export const SLOT_CROP: TaskCrop = {
  name: "mc_slot_tile.png",
  path: "assets/minecraft/textures/gui/container/inventory.png",
  // First player-inventory slot cell (bevel border included) starts at
  // x=7, y=83 in the 176×166 atlas; the 16×16 interior is at 8,84.
  x: 7,
  y: 83,
  w: 18,
  h: 18,
};

// Scrollbar handle: the creative-inventory scroller sprite (12×15, used as-is).
export const SCROLLBAR_SPRITE_PATH = "assets/minecraft/textures/gui/sprites/container/creative_inventory/scroller.png";
// Fallback for older packs: crop from the pre-1.20.2 creative-inventory tabs atlas.
export const SCROLLBAR_ATLAS_FALLBACK: TaskCrop = {
  name: "mc_scrollbar_handle.png",
  path: "assets/minecraft/textures/gui/container/creative_inventory/tabs.png",
  x: 232,
  y: 0,
  w: 12,
  h: 15,
};

/**
 * Port of scripts/extractMCTextures.py sample_9slice().
 * Samples corner pixels + one centre pixel from each axis and writes them
 * into a compact (slicePx*2+1)² sprite suitable for CSS border-image.
 */
export function sample9slice(
  srcData: ImageData,
  imgW: number,
  task: Task9Slice
): ImageData {
  const cw = task.contentW ?? imgW;
  const ch = task.contentH ?? srcData.height;
  const s = task.slice;

  const midCol = task.midCol ?? (s + Math.floor((cw - 2 * s) / 2));
  const midRow = task.midRow ?? (s + Math.floor((ch - 2 * s) / 2));

  const buildAxis = (slicePx: number, total: number, mid: number, leadingOffset = 0): number[] => {
    const a: number[] = [];
    for (let i = 0; i < slicePx; i++) a.push(i + leadingOffset);
    a.push(mid);
    for (let i = slicePx - 1; i >= 0; i--) a.push(total - 1 - i);
    return a;
  };

  const cols = buildAxis(s, cw, midCol);
  const rows = buildAxis(s, ch, midRow, task.topOffset ?? 0);
  const outSize = s * 2 + 1;

  const out = new ImageData(outSize, outSize);
  for (let oy = 0; oy < rows.length; oy++) {
    for (let ox = 0; ox < cols.length; ox++) {
      const si = (rows[oy] * imgW + cols[ox]) * 4;
      const di = (oy * outSize + ox) * 4;
      out.data[di]     = srcData.data[si];
      out.data[di + 1] = srcData.data[si + 1];
      out.data[di + 2] = srcData.data[si + 2];
      out.data[di + 3] = srcData.data[si + 3];
    }
  }
  return out;
}

export function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export function imageDataToBlob(data: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(data, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
}

export function cropImageData(src: ImageData, x: number, y: number, w: number, h: number): ImageData {
  const out = new ImageData(w, h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const si = ((y + row) * src.width + (x + col)) * 4;
      const di = (row * w + col) * 4;
      out.data[di]     = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}
