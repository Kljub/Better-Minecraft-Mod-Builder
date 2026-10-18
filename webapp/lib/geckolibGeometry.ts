/**
 * Builds a GeckoLib-compatible Bedrock geometry.json ("minecraft:geometry") from the same
 * engine-agnostic mesh description bbmodel.ts consumes. GeckoLib's runtime is Bedrock's
 * entity-geometry format, which is normally cuboid ("bones" of "cubes") — but it also supports a
 * `poly_mesh` per bone for arbitrary triangle geometry, which is exactly what an AI-generated
 * (non-cuboid) mesh needs, so no lossy voxelize-into-boxes step is required. All triangles land
 * in one root bone's poly_mesh, matching this tool's "flatten everything, one object" approach
 * for bbmodel.
 *
 * Unlike bbmodel/Blockbench cube UVs (pixel space), Bedrock poly_mesh UVs are normalized (0-1),
 * so the source glTF UVs are used as-is (`normalized_uvs: true`) — no texture-size lookup needed.
 *
 * GeckoLib geometry has exactly ONE shared texture per model (`description.texture_width/height`
 * plus the render controller's material) — there's no per-face texture reference like bbmodel's.
 * A GLB with multiple materials can't map onto that, so the caller picks a single `materialIndex`
 * and only triangles using it are included; anything else is silently dropped here (the caller is
 * expected to warn the user beforehand).
 */

import type { MeshInput, Vec3 } from "./meshTypes";
import { computeFit, projectPoint, type FitOptions } from "./meshFit";

export interface BuildGeckoLibGeometryOptions extends FitOptions {
  modelName: string;
  meshes: MeshInput[];
  /** Which material's triangles to include (GeckoLib supports only one texture per model). */
  materialIndex: number;
  textureWidth: number;
  textureHeight: number;
}

function sanitizeIdentifier(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "model";
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 1, 0];
}

export function buildGeckoLibGeometry(opts: BuildGeckoLibGeometryOptions): Record<string, unknown> {
  const fit = computeFit(opts.meshes, opts);
  const identifier = `geometry.${sanitizeIdentifier(opts.modelName)}`;

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: [number, number][] = [];
  const polys: number[][][] = [];

  for (const mesh of opts.meshes) {
    for (const tri of mesh.triangles) {
      if (tri.materialIndex !== opts.materialIndex) continue;
      const p = tri.positions.map((pos) => projectPoint(pos, fit)) as [Vec3, Vec3, Vec3];
      const normal = normalize(cross(subtract(p[1], p[0]), subtract(p[2], p[0])));

      const poly = tri.positions.map((_, i) => {
        const posIndex = positions.push(p[i]) - 1;
        const normIndex = normals.push(normal) - 1;
        const uvIndex = uvs.push(tri.uvs[i]) - 1;
        return [posIndex, normIndex, uvIndex];
      });
      polys.push(poly);
    }
  }

  const boundsWidth = Math.max(...positions.map((p) => Math.abs(p[0])), ...positions.map((p) => Math.abs(p[2])), 0) * 2 / 16 || 1;
  const boundsHeight = (positions.length > 0 ? Math.max(...positions.map((p) => p[1])) : 16) / 16 || 1;

  return {
    format_version: "1.12.0",
    "minecraft:geometry": [
      {
        description: {
          identifier,
          texture_width: opts.textureWidth,
          texture_height: opts.textureHeight,
          visible_bounds_width: boundsWidth,
          visible_bounds_height: boundsHeight,
          visible_bounds_offset: [0, boundsHeight / 2, 0],
        },
        bones: [
          {
            name: "root",
            pivot: [0, 0, 0],
            poly_mesh: {
              normalized_uvs: true,
              positions,
              normals,
              uvs,
              polys,
            },
          },
        ],
      },
    ],
  };
}
