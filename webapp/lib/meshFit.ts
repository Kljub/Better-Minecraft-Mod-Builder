import type { MeshInput, Vec3 } from "./meshTypes";

export interface FitOptions {
  /** When true (default), uniformly scale the combined bounding box so its largest dimension
   * equals `targetSize`, and sit it centered on X/Z with its bottom at Y=0 — Minecraft's usual
   * ground-origin convention for entity/block models. When false, `scale` is applied as-is with
   * no re-centering, so the source file's own origin and units are preserved. */
  autoFit?: boolean;
  targetSize?: number;
  scale?: number;
}

export interface Fit {
  scale: number;
  offset: Vec3;
}

function boundingBox(meshes: MeshInput[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes) {
    for (const tri of mesh.triangles) {
      for (const p of tri.positions) {
        for (let i = 0; i < 3; i++) {
          if (p[i] < min[i]) min[i] = p[i];
          if (p[i] > max[i]) max[i] = p[i];
        }
      }
    }
  }
  return { min, max };
}

export function computeFit(meshes: MeshInput[], opts: FitOptions): Fit {
  const autoFit = opts.autoFit ?? true;
  const targetSize = opts.targetSize ?? 16;
  if (!autoFit) return { scale: opts.scale ?? 1, offset: [0, 0, 0] };

  const { min, max } = boundingBox(meshes);
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const maxDim = Math.max(size[0], size[1], size[2]);
  const scale = maxDim > 0 ? targetSize / maxDim : 1;
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  // Center X/Z, rest the bottom (min Y) on the ground plane.
  const offset: Vec3 = [-center[0] * scale, -min[1] * scale, -center[2] * scale];
  return { scale, offset };
}

export function projectPoint(p: Vec3, fit: Fit): Vec3 {
  return [p[0] * fit.scale + fit.offset[0], p[1] * fit.scale + fit.offset[1], p[2] * fit.scale + fit.offset[2]];
}
