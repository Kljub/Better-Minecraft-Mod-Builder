/**
 * Vanilla chest geometry (net.minecraft.client.model.object.chest.ChestModel, single chest) and
 * its box UVs exactly as ModelPart.Cube lays them out — so a chest skin (64×64, the layout of
 * vanilla entity/chest/normal.png) previews the way the game draws it. Coordinates in model
 * pixels, +Y up (the chest renderer draws the model unflipped); lid and lock are relative to the
 * lid pivot (0, 9, 1). UVs are normalized with v = 0 at the top of the image.
 */
export interface ChestVertex { x: number; y: number; z: number; u: number; v: number }

const BOXES = {
  bottom: { tex: [0, 19], from: [1, 0, 1], size: [14, 10, 14] },
  lid: { tex: [0, 0], from: [1, 0, 0], size: [14, 5, 14] },
  lock: { tex: [0, 0], from: [7, -2, 14], size: [2, 4, 1] },
} as const;

export const CHEST_TEXTURE_SIZE = 64;

/** The four corners of every face of one chest part, in ModelPart.Polygon's vertex order. */
export function chestQuads(part: keyof typeof BOXES): ChestVertex[][] {
  const { tex: [tu, tv], from: [x0, y0, z0], size: [w, h, d] } = BOXES[part];
  const [x1, y1, z1] = [x0 + w, y0 + h, z0 + d];
  const t0 = [x0, y0, z0], t1 = [x1, y0, z0], t2 = [x1, y1, z0], t3 = [x0, y1, z0];
  const l0 = [x0, y0, z1], l1 = [x1, y0, z1], l2 = [x1, y1, z1], l3 = [x0, y1, z1];
  const u0 = tu, u1 = tu + d, u2 = tu + d + w, u22 = tu + d + w + w, u3 = tu + d + w + d, u4 = tu + d + w + d + w;
  const v0 = tv, v1 = tv + d, v2 = tv + d + h;
  const S = CHEST_TEXTURE_SIZE;
  // Polygon(vertices, uA, vA, uB, vB): vertex 0 → (uB, vA), 1 → (uA, vA), 2 → (uA, vB), 3 → (uB, vB).
  const quad = (vs: number[][], ua: number, va: number, ub: number, vb: number): ChestVertex[] => {
    const uvs = [[ub, va], [ua, va], [ua, vb], [ub, vb]];
    return vs.map(([x, y, z], i) => ({ x, y, z, u: uvs[i][0] / S, v: uvs[i][1] / S }));
  };
  return [
    quad([l1, l0, t0, t1], u1, v0, u2, v1), // down
    quad([t2, t3, l3, l2], u2, v1, u22, v0), // up
    quad([t0, l0, l3, t3], u0, v1, u1, v2), // west
    quad([t1, t0, t3, t2], u1, v1, u2, v2), // north
    quad([l1, t1, t2, l2], u2, v1, u3, v2), // east
    quad([l0, l1, l2, l3], u3, v1, u4, v2), // south
  ];
}

/** Pack texture keys that are chest skins (vanilla's entity/chest/… folder). */
export function isChestSkinKey(key: string): boolean {
  return /(^|\/)entity\/chest\/[^/]+\.png$/i.test(key);
}
