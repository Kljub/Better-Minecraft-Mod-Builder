import { TEMPLATE_NAMES, templateUrl } from "./textureTemplateNames";

/**
 * "From template" texture generator (like MCreator's image editor dialog): up to four template
 * layers, the upper three tinted with a colour and optionally rotated, stacked into a texture.
 *
 * Tinting, per layer:
 * - default: each channel moves halfway to the colour ((pixel + colour) / 2), keeping the template's
 *   shading and some of its own colour;
 * - "lock saturation and brightness": hue and saturation come from the colour, brightness from the
 *   pixel, so greyscale templates take the exact colour.
 */
export type Rotation = 0 | 90 | 180 | 270;

export interface TemplateLayer {
  /** template name (see TEMPLATE_NAMES) or null for an empty layer */
  template: string | null;
  color: string;
  lock: boolean;
  rotation: Rotation;
}

export const EMPTY_LAYER: TemplateLayer = { template: null, color: "#ff9800", lock: false, rotation: 0 };

export { TEMPLATE_NAMES, templateUrl };

// ---- pixel ops (pure, on RGBA ImageData-like buffers) -------------------------------------------

interface Pixels { width: number; height: number; data: Uint8ClampedArray }

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xff9800;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max ? d / max : 0, max / 255];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Tints in place (alpha untouched). */
export function colorize(px: Pixels, color: string, lock: boolean): Pixels {
  const [cr, cg, cb] = hexToRgb(color);
  const [ch, cs] = rgbToHsv(cr, cg, cb);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    if (lock) {
      const [, , v] = rgbToHsv(d[i], d[i + 1], d[i + 2]);
      [d[i], d[i + 1], d[i + 2]] = hsvToRgb(ch, cs, v);
    } else {
      d[i] = (d[i] + cr) >> 1;
      d[i + 1] = (d[i + 1] + cg) >> 1;
      d[i + 2] = (d[i + 2] + cb) >> 1;
    }
  }
  return px;
}

/** Rotates clockwise by 90° steps (square images; others only by 180°). */
export function rotate(px: Pixels, deg: Rotation): Pixels {
  if (!deg) return px;
  const { width: w, height: h, data } = px;
  if (deg !== 180 && w !== h) return px;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [nx, ny] = deg === 90 ? [w - 1 - y, x] : deg === 180 ? [w - 1 - x, h - 1 - y] : [y, h - 1 - x];
      out.set(data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (ny * w + nx) * 4);
    }
  }
  return { width: w, height: h, data: out };
}

// ---- loading + rendering (browser) ---------------------------------------------------------------

const cache = new Map<string, Promise<HTMLImageElement>>();

export function loadTemplate(name: string): Promise<HTMLImageElement> {
  let p = cache.get(name);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => { cache.delete(name); reject(new Error(`Couldn't load template "${name}" from GitHub`)); };
      img.src = templateUrl(name);
    });
    cache.set(name, p);
  }
  return p;
}

/** One layer as ImageData at the target size (nearest-neighbour scaled), tinted and rotated. */
export async function renderLayer(layer: TemplateLayer, width: number, height: number, tint: boolean): Promise<ImageData | null> {
  if (!layer.template) return null;
  const img = await loadTemplate(layer.template);
  const src = document.createElement("canvas");
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);
  let px: Pixels = sctx.getImageData(0, 0, src.width, src.height);
  if (tint) px = colorize(px, layer.color, layer.lock);
  px = rotate(px, layer.rotation);
  sctx.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const octx = out.getContext("2d", { willReadFrequently: true })!;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(src, 0, 0, width, height);
  return octx.getImageData(0, 0, width, height);
}

/** All four layers (layer 1 untinted, like MCreator), bottom first; null = empty. */
export async function renderLayers(layers: TemplateLayer[], width: number, height: number): Promise<(ImageData | null)[]> {
  return Promise.all(layers.map((l, i) => renderLayer(l, width, height, i > 0)));
}

/** Stacks rendered layers onto one ImageData. */
export function mergeLayers(images: (ImageData | null)[], width: number, height: number): ImageData {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const tmp = document.createElement("canvas");
  tmp.width = width;
  tmp.height = height;
  const tctx = tmp.getContext("2d")!;
  for (const im of images) {
    if (!im) continue;
    tctx.clearRect(0, 0, width, height);
    tctx.putImageData(im, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }
  return ctx.getImageData(0, 0, width, height);
}

// ---- generator presets -----------------------------------------------------------------------------

export const PRESET_COLORS = [
  "#ff0000", "#00ff00", "#0000ff", "#f5b301", "#ff00ff", "#00ffff", "#f44336", "#e91e63", "#ffeb3b",
  "#cddc39", "#ff5722", "#9e9e9e", "#ff9800", "#00bcd4", "#8bc34a",
];

export const GENERATORS = [
  "Random", "Sword", "Pickaxe", "Axe", "Shovel", "Hoe", "Shears", "Ingot", "Nugget", "Gem", "Dust", "Ore", "Block",
  "Music disc", "Drinkable potion", "Splash potion", "Lingering potion", "Dye", "Spawn egg",
] as const;
export type Generator = (typeof GENERATORS)[number];

type Rand = () => number;

/** Fills the four layers for a generator preset with random picks (own recipes, keyed on template names). */
export function generate(gen: Generator, rand: Rand = Math.random): TemplateLayer[] {
  const pickFrom = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const named = (pred: (n: string) => boolean) => TEMPLATE_NAMES.filter(pred);
  const has = (...names: string[]) => names.filter((n) => TEMPLATE_NAMES.includes(n));
  const one = (...names: string[]) => { const l = has(...names); return l.length ? pickFrom(l) : null; };
  const like = (re: RegExp) => { const l = named((n) => re.test(n)); return l.length ? pickFrom(l) : null; };
  const color = () => pickFrom(PRESET_COLORS);
  const lock = () => rand() < 0.4;
  const tinted = (template: string | null, c = color(), l = lock()): TemplateLayer => ({ template, color: c, lock: l, rotation: 0 });
  const base = (template: string | null): TemplateLayer => ({ ...EMPTY_LAYER, template });
  const none = () => ({ ...EMPTY_LAYER, color: color() });

  switch (gen) {
    case "Sword":
      return rand() < 0.66
        ? [base(one("tool_base_stick")), tinted(one("tool_sword")), none(), none()]
        : [base(one("tool_base_stick")), tinted(one("tool_sword_blade")), tinted(one("tool_sword_handle")), none()];
    case "Pickaxe": return [base(one("tool_base_stick")), tinted(one("tool_pickaxe")), none(), none()];
    case "Axe": return [base(one("tool_base_stick")), tinted(one("tool_axe")), none(), none()];
    case "Hoe": return [base(one("tool_base_stick")), tinted(one("tool_hoe")), none(), none()];
    case "Shovel": return [base(one("tool_shovel_base")), tinted(one("tool_shovel_top")), none(), none()];
    case "Shears": {
      const c = color(), l = lock();
      return [base(one("shears_base")), rand() < 0.1 ? tinted(one("shears_base_mono")) : none(), tinted(one("shears_blades"), c, l), tinted(one("shears_mechanism"), rand() < 0.8 ? c : color(), l)];
    }
    case "Ingot": return [base(null), tinted(one("ingot_bright", "ingot_dark")), none(), none()];
    case "Nugget": return [base(null), tinted(one("nugget", "nugget1")), none(), none()];
    case "Gem": return [base(null), tinted(like(/^gem\d*$|^Gem template/)), none(), none()];
    case "Dust": return [base(null), tinted(one("dust_base", "powder1", "powder2")), rand() < 0.5 ? tinted(one("dust_sprinkles")) : none(), none()];
    case "Ore": return [base(like(/^(stone|new_cobblestone1|noise\d+)$/)), tinted(like(/^ore\d+$/)), rand() < 0.25 ? tinted(like(/^oregem\d$/)) : none(), none()];
    case "Block": {
      const layer1 = like(/block|noise|pattern|machine|plank|log|stone_|stonebrick|dirt/);
      return [base(layer1), tinted(like(/^(noise|pattern)\d+$/)), rand() < 0.3 ? tinted(like(/^oreblock\d$/)) : none(), none()];
    }
    case "Music disc":
      return [base(rand() < 0.75 ? one("record") : one("record_broken")), tinted(like(/^record_mid_(0|1|inner)$/)),
        rand() < 0.5 ? tinted(like(/^record_mid_dots_/)) : none(), none()];
    case "Drinkable potion":
    case "Splash potion":
    case "Lingering potion": {
      const bottle = gen === "Splash potion" ? "potion_bottle_overlay_splash" : gen === "Lingering potion" ? "potion_bottle_overlay_lingering" : "potion_bottle_overlay";
      return [base(one(bottle)), tinted(one("potion_fluid_bright", "potion_fluid_dark", "potion_fluid_water"), color(), rand() < 0.6), none(), none()];
    }
    case "Dye": {
      const full = rand() < 0.5;
      return full
        ? [base(null), tinted(like(/^dye\d$|^dye7_full$/)), none(), none()]
        : [base(null), tinted(one("dye7_bottom")), tinted(one("dye7_top")), none()];
    }
    case "Spawn egg": return [base(null), tinted(one("egg_base")), tinted(one("egg_accent")), none()];
    default: {
      const anyLayer = () => (rand() < 0.6 ? tinted(pickFrom(TEMPLATE_NAMES), color(), lock()) : none());
      const rot = (l: TemplateLayer): TemplateLayer => ({ ...l, rotation: pickFrom([0, 90, 180, 270] as const) });
      return [base(like(/noise|pattern|oreblock|block_base|stone/)), rot(tinted(like(/noise|pattern|ore\d|oreblock/))), rot(anyLayer()), anyLayer()];
    }
  }
}
