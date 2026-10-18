/**
 * Minimal synchronous PNG encoder (RGBA8, stored/uncompressed deflate) for tiny generated
 * textures like spawn-egg icons — works in the browser and in Node tests, no canvas needed.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (const x of bytes) { a = (a + x) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: Uint8Array): number[] {
  const body = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat(Array.from(data)));
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

/** `rgba` is width*height*4 bytes, row-major. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  // zlib stream with stored (uncompressed) deflate blocks of max 65535 bytes.
  const zlib: number[] = [0x78, 0x01];
  for (let off = 0; off < raw.length || off === 0; off += 65535) {
    const block = raw.subarray(off, Math.min(off + 65535, raw.length));
    const last = off + 65535 >= raw.length ? 1 : 0;
    zlib.push(last, block.length & 255, block.length >>> 8, ~block.length & 255, (~block.length >>> 8) & 255, ...block);
    if (raw.length === 0) break;
  }
  zlib.push(...u32(adler32(raw)));
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", new Uint8Array(zlib)),
    ...chunk("IEND", new Uint8Array()),
  ]);
}

const hex = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1], 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** 16x16 spawn-egg icon: egg in `base` colour with a darker rim and `spots`. */
export function spawnEggPng(base: string, spots: string): Uint8Array {
  const [r, g, b] = hex(base);
  const [sr, sg, sb] = hex(spots);
  const px = new Uint8Array(16 * 16 * 4);
  const inside = (x: number, y: number) => {
    const ry = 6.6, cy = 8.6;
    const rx = 5.2 * (y < cy ? 0.78 + 0.22 * Math.min(1, (y - 1.5) / (cy - 1.5)) : 1);
    return ((x + 0.5 - 8) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  };
  const SPOTS = new Set(["6,5", "7,5", "10,7", "5,9", "6,9", "9,11", "10,11", "7,13", "11,9", "8,8"]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    const i = (y * 16 + x) * 4;
    const [cr, cg, cb] = edge ? [r * 0.55, g * 0.55, b * 0.55] : SPOTS.has(`${x},${y}`) ? [sr, sg, sb] : [r, g, b];
    px[i] = Math.round(cr); px[i + 1] = Math.round(cg); px[i + 2] = Math.round(cb); px[i + 3] = 255;
  }
  return encodePng(16, 16, px);
}
