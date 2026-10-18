import { BEDROCK_SAMPLES_COMMIT, VANILLA_MOBS, type VanillaMob } from "./vanillaMobs";

/**
 * "Import from Minecraft": loads a vanilla mob's geometry + default texture from Mojang's
 * bedrock-samples repository (pinned commit) in the browser, ready for fromBedrockGeo. Mojang's
 * files are not part of this app; textures of an imported mob are Mojang's — repaint before
 * publishing a mod with them.
 */
export { VANILLA_MOBS, type VanillaMob };

const BASE = `https://raw.githubusercontent.com/Mojang/bedrock-samples/${BEDROCK_SAMPLES_COMMIT}/resource_pack/`;

export const vanillaLabel = (id: string) => id.replace(/_v\d+$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Bedrock JSON allows // line comments. */
export function parseBedrockJson(text: string): unknown {
  return JSON.parse(text.replace(/^﻿/, "").replace(/^\s*\/\/.*$/gm, ""));
}

type Geo = Record<string, unknown> & { bones?: { name?: string }[] };

/** The geometry object with this identifier in a 1.12+ ("minecraft:geometry") or legacy file. */
export function findGeometry(file: unknown, identifier: string): { geo: Geo; legacy: boolean } | null {
  const f = file as Record<string, unknown>;
  const list = f["minecraft:geometry"];
  if (Array.isArray(list)) {
    const g = list.find((x) => (x as { description?: { identifier?: string } })?.description?.identifier === identifier);
    return g ? { geo: g as Geo, legacy: false } : null;
  }
  const key = Object.keys(f).find((k) => k === identifier || k.startsWith(`${identifier}:`));
  return key ? { geo: f[key] as Geo, legacy: true } : null;
}

/** Legacy inheritance: the child's bones replace the parent's bones of the same name. */
export function inheritGeometry(parent: Geo, child: Geo): Geo {
  const childBones = child.bones ?? [];
  const names = new Set(childBones.map((b) => b.name));
  return { ...parent, ...child, bones: [...(parent.bones ?? []).filter((b) => !names.has(b.name)), ...childBones] };
}

/** Geometry JSON for fromBedrockGeo with inheritance resolved. */
export function mobGeometryJson(mob: VanillaMob, files: Record<string, unknown>): Record<string, unknown> {
  const own = findGeometry(files[mob.geo], mob.geometry);
  if (!own) throw new Error(`${mob.geometry} not found in ${mob.geo}`);
  let geo = own.geo;
  if (mob.parent) {
    const parent = findGeometry(files[mob.parent.geo], mob.parent.geometry);
    if (parent) geo = inheritGeometry(parent.geo, geo);
  }
  return own.legacy ? { format_version: "1.8.0", [mob.geometry]: geo } : { format_version: "1.12.0", "minecraft:geometry": [geo] };
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GitHub: ${res.status} for ${url.split("/resource_pack/")[1]}`);
  return res;
}

/** Downloads geometry (+ parent) and texture; TGA textures are converted to PNG. */
export async function loadVanillaMob(mob: VanillaMob): Promise<{ geometry: Record<string, unknown>; texture: Blob }> {
  const geoFiles = [...new Set([mob.geo, mob.parent?.geo].filter((x): x is string => !!x))];
  const files: Record<string, unknown> = {};
  await Promise.all(geoFiles.map(async (f) => { files[f] = parseBedrockJson(await (await fetchOk(`${BASE}models/entity/${f}`)).text()); }));
  const raw = await (await fetchOk(BASE + mob.texture)).arrayBuffer();
  const texture = mob.texture.endsWith(".tga") ? await pngFromRgba(decodeTga(new Uint8Array(raw))) : new Blob([raw], { type: "image/png" });
  return { geometry: mobGeometryJson(mob, files), texture };
}

// ---- TGA (Bedrock ships some entity textures as Truevision TGA) ---------------------------------

export interface Rgba { width: number; height: number; data: Uint8ClampedArray }

/** Uncompressed (type 2) or RLE (type 10) true-colour TGA, 24 or 32 bit. */
export function decodeTga(buf: Uint8Array): Rgba {
  const idLen = buf[0], cmapType = buf[1], type = buf[2];
  const cmapLen = buf[5] | (buf[6] << 8), cmapEntry = buf[7];
  const width = buf[12] | (buf[13] << 8), height = buf[14] | (buf[15] << 8);
  const bpp = buf[16], desc = buf[17];
  if (type !== 2 && type !== 10) throw new Error(`Unsupported TGA type ${type}`);
  if (bpp !== 24 && bpp !== 32) throw new Error(`Unsupported TGA depth ${bpp}`);
  const bytes = bpp / 8;
  let p = 18 + idLen + (cmapType ? cmapLen * Math.ceil(cmapEntry / 8) : 0);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const put = (i: number, at: number) => {
    pixels[i * 4] = buf[at + 2];
    pixels[i * 4 + 1] = buf[at + 1];
    pixels[i * 4 + 2] = buf[at];
    pixels[i * 4 + 3] = bytes === 4 ? buf[at + 3] : 255;
  };
  let i = 0;
  const total = width * height;
  if (type === 2) {
    for (; i < total; i++, p += bytes) put(i, p);
  } else {
    while (i < total && p < buf.length) {
      const head = buf[p++];
      const n = (head & 0x7f) + 1;
      if (head & 0x80) { for (let k = 0; k < n && i < total; k++) put(i++, p); p += bytes; }
      else { for (let k = 0; k < n && i < total; k++, p += bytes) put(i++, p); }
    }
  }
  // Bit 5 of the descriptor: origin at the top; otherwise rows run bottom-up.
  if (!(desc & 0x20)) {
    const row = width * 4;
    const flipped = new Uint8ClampedArray(pixels.length);
    for (let y = 0; y < height; y++) flipped.set(pixels.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
    return { width, height, data: flipped };
  }
  return { width, height, data: pixels };
}

async function pngFromRgba(img: Rgba): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"));
}
