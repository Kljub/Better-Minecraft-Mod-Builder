"use client";

/**
 * Browser-side finishing for generated GUI textures that come back larger than wanted (Codex's
 * ~1254px images): centre-crop to the target aspect, downscale smoothly, optionally reduce to a
 * small palette (the flat shading GUI textures use) and put a base image's transparency back.
 */

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous"; // pack textures can be GitHub URLs — keeps the canvas exportable
  img.src = url;
  await img.decode();
  return img;
}

/** k-means palette reduction in place (RGB only; alpha untouched). */
function quantize(data: Uint8ClampedArray, k: number, iterations = 6) {
  const n = data.length / 4;
  const centers: number[][] = [];
  for (let i = 0; i < k; i++) {
    const p = Math.floor(((i + 0.5) / k) * n) * 4;
    centers.push([data[p], data[p + 1], data[p + 2]]);
  }
  const assign = new Uint16Array(n);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (r - centers[c][0]) ** 2 + (g - centers[c][1]) ** 2 + (b - centers[c][2]) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[i] = best;
      const s = sums[best];
      s[0] += r; s[1] += g; s[2] += b; s[3]++;
    }
    sums.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  for (let i = 0; i < n; i++) {
    const c = centers[assign[i]];
    data[i * 4] = Math.round(c[0]); data[i * 4 + 1] = Math.round(c[1]); data[i * 4 + 2] = Math.round(c[2]);
  }
}

export async function fitImage(url: string, width: number, height: number, opts: { pixelate?: boolean; alphaFrom?: string } = {}): Promise<string> {
  const img = await loadImage(url);
  // centre-crop to the target aspect ratio
  const target = width / height;
  let sw = img.naturalWidth, sh = img.naturalHeight;
  if (sw / sh > target) sw = Math.round(sh * target); else sh = Math.round(sw / target);
  const sx = Math.round((img.naturalWidth - sw) / 2), sy = Math.round((img.naturalHeight - sh) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);

  if (opts.pixelate) quantize(pixels.data, 24);
  if (opts.alphaFrom) {
    const base = await loadImage(opts.alphaFrom);
    const a = document.createElement("canvas");
    a.width = width;
    a.height = height;
    const actx = a.getContext("2d")!;
    actx.imageSmoothingEnabled = false;
    actx.drawImage(base, 0, 0, width, height);
    const alpha = actx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = alpha[i];
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

/** Any image -> PNG data URL at its own size (what the generators accept as a base image). */
export async function toPngDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(url);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d")!.drawImage(img, 0, 0);
  return { dataUrl: c.toDataURL("image/png"), width: c.width, height: c.height };
}
