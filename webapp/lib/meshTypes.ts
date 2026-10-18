/**
 * Engine-agnostic mesh description shared by every `.glb` conversion target (bbmodel.ts,
 * geckolibGeometry.ts, …). No three.js/DOM here so it stays usable from plain Node tests.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface MeshTriangleInput {
  /** World-space positions, one per vertex. */
  positions: [Vec3, Vec3, Vec3];
  /** Normalized (0-1) UV per vertex, glTF convention: origin top-left, v increasing downward. */
  uvs: [Vec2, Vec2, Vec2];
  materialIndex: number;
}

export interface MeshInput {
  name: string;
  triangles: MeshTriangleInput[];
}
