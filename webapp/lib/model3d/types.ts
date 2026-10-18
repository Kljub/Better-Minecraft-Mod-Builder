import type { ModelAnimation } from "./animation";

/**
 * Entity model document — cuboids in a bone hierarchy, stored in Blockbench's own internal
 * coordinate convention (the one .bbmodel files use): 1 unit = 1 texture pixel = 1/16 block,
 * +Y up, absolute ("unrotated") coordinates for every cube and pivot regardless of nesting.
 * Using Blockbench's convention means .bbmodel round-trips 1:1, and the Bedrock/GeckoLib and
 * Java exporters apply the exact conversions Blockbench's own codecs use (see codecs.ts).
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export const FACE_KEYS = ["north", "east", "south", "west", "up", "down"] as const;
export type FaceKey = (typeof FACE_KEYS)[number];

export interface ModelFace {
  /** texture-pixel rect [u1, v1, u2, v2] — u2 < u1 / v2 < v1 means flipped */
  uv: [number, number, number, number];
  /** 0 | 90 | 180 | 270 */
  rotation: number;
  /** false = face not rendered/exported */
  enabled: boolean;
}

export interface ModelBone {
  id: string;
  name: string;
  /** parent bone id, or null for a root bone */
  parent: string | null;
  /** pivot point */
  origin: Vec3;
  /** degrees, applied Z then Y then X around `origin` (Minecraft/Blockbench order) */
  rotation: Vec3;
}

export interface ModelCube {
  id: string;
  name: string;
  /** owning bone id, or null (exporters then wrap it in a "bb_main" bone like Blockbench does) */
  bone: string | null;
  from: Vec3;
  to: Vec3;
  /** cube's own rotation pivot */
  origin: Vec3;
  rotation: Vec3;
  /** grows the box on every side without changing its UV size */
  inflate: number;
  /** true: faces laid out automatically from `uvOffset` (vanilla box UV); false: `faces[].uv` */
  boxUv: boolean;
  uvOffset: Vec2;
  /** box UV mirrored horizontally (vanilla `mirror()`) */
  mirror: boolean;
  faces: Record<FaceKey, ModelFace>;
}

export interface EntityModel {
  textureWidth: number;
  textureHeight: number;
  /** pack texture key ("custom/foo.png") or "" */
  texture: string;
  bones: ModelBone[];
  cubes: ModelCube[];
  /** keyframe animations (see animation.ts) */
  animations?: ModelAnimation[];
}
