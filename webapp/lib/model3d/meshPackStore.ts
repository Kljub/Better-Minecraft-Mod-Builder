import type { JavaPart } from "./codecs";
import type { JavaAnimation } from "./animation";

/**
 * A Mesh Model's converted data ("mesh pack"): per-part OBJ meshes, materials, textures, the rig
 * as Java ModelParts and the baked animations — built in the browser (lib/model3d/meshPack.ts)
 * and stored as one JSON blob in lib/structureStore, so the project JSON stays small.
 *
 * Element `files`/`shared` are synchronous, so packs are parsed ahead of time into this cache:
 * by the editor when it loads one, and by the export (primeMeshPacks) before writing.
 */
export interface MeshPack {
  version: 1;
  target: "item" | "block" | "entity";
  /** model size in blocks [w, h, d] */
  size: [number, number, number];
  triangles: number;
  /** Java ModelParts of the rig (entity); a single "root" part for unrigged meshes */
  parts: JavaPart[];
  /** part name -> OBJ text (entity: in that part's Java space; item/block: block units 0..1) */
  meshes: Record<string, string>;
  /** material library shared by all meshes (map_Kd "#m<i>" → model texture slots) */
  mtl: string;
  /** texture slot -> PNG as base64 */
  textures: Record<string, string>;
  animations: JavaAnimation[];
  /** animation names as they came from the file (sanitised) */
  clips: string[];
  bones: number;
}

export const MESH_PACK_SUFFIX = ".meshpack.json";

const cache = new Map<string, MeshPack>();

export function cachedMeshPack(key: string | undefined): MeshPack | undefined {
  return key ? cache.get(key) : undefined;
}

export function cacheMeshPack(key: string, pack: MeshPack): void {
  cache.set(key, pack);
}

/** Parses the mesh packs among loaded element binaries into the cache. */
export async function primeMeshPacks(files: Record<string, Blob>): Promise<void> {
  for (const [key, blob] of Object.entries(files)) {
    if (!key.endsWith(MESH_PACK_SUFFIX) || cache.has(key)) continue;
    try {
      cache.set(key, JSON.parse(await blob.text()) as MeshPack);
    } catch {
      // a broken pack exports like a missing one (validate reports it)
    }
  }
}
