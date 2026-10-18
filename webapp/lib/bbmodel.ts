/**
 * Builds a Blockbench `.bbmodel` JSON document from an already-parsed, engine-agnostic mesh
 * description. Kept free of three.js / DOM APIs (canvas, Image, WebGL) so it can run in a plain
 * Node test environment — the browser-only glTF/GLB parsing and texture-to-dataURL extraction
 * live in `glbMeshData.ts` and feed this function their output.
 *
 * Vertices are NOT welded across triangles: every triangle contributes its own 3 mesh vertices,
 * even where positions coincide with a neighboring triangle. This trades a larger file (and less
 * convenient "move one vertex, drag all attached faces" editing) for a conversion with no vertex-
 * matching edge cases. Blockbench's own merge/weld tools can clean this up post-import if needed.
 */

import type { Vec2, Vec3, MeshInput, MeshTriangleInput } from "./meshTypes";
import { computeFit, projectPoint, type FitOptions } from "./meshFit";

export type { Vec2, Vec3 };
export type BbmodelMeshInput = MeshInput;
export type BbmodelTriangleInput = MeshTriangleInput;

export interface BbmodelMaterialInput {
  name: string;
  /** PNG/JPEG data URL. Omitted -> a flat-color fallback texture is synthesized from `color`. */
  textureDataUrl?: string;
  width?: number;
  height?: number;
  /** Fallback flat color (0xRRGGBB), used only when `textureDataUrl` is absent. */
  color?: number;
}

export interface BuildBbmodelOptions extends FitOptions {
  modelName: string;
  meshes: MeshInput[];
  materials: BbmodelMaterialInput[];
}

const FALLBACK_TEXTURE_SIZE = 16;

/** Base64-encodes a UTF-8 string in both browser (btoa) and Node (Buffer, used by unit tests). */
function base64(input: string): string {
  if (typeof btoa === "function") return btoa(input);
  return Buffer.from(input, "utf-8").toString("base64");
}

function flatColorDataUrl(color: number, size: number): string {
  // Tiny hand-rolled PNG-free fallback: a solid-color data URL built from an SVG rect, which
  // every browser (and Blockbench, which just assigns it to an <img> src) can decode.
  const hex = `#${color.toString(16).padStart(6, "0")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${hex}"/></svg>`;
  return `data:image/svg+xml;base64,${base64(svg)}`;
}

let idCounter = 0;
function shortId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

/** RFC4122 v4 UUID. `crypto.randomUUID()` only exists in secure contexts (https/localhost), and
 * this tool is also opened over plain http from a LAN IP, so it's rolled by hand from
 * `crypto.getRandomValues` (unrestricted) with a Math.random fallback for older environments. */
function uuidv4(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function buildBbmodel(opts: BuildBbmodelOptions): Record<string, unknown> {
  const { modelName, meshes, materials } = opts;
  const fit = computeFit(meshes, opts);
  const project = (p: Vec3): Vec3 => projectPoint(p, fit);

  const textureEntries = materials.map((mat, i) => {
    const width = mat.width ?? FALLBACK_TEXTURE_SIZE;
    const height = mat.height ?? FALLBACK_TEXTURE_SIZE;
    const source = mat.textureDataUrl ?? flatColorDataUrl(mat.color ?? 0xcccccc, FALLBACK_TEXTURE_SIZE);
    return {
      path: "",
      name: `${mat.name || `material_${i}`}.png`,
      folder: "",
      namespace: "",
      id: String(i),
      particle: i === 0,
      render_mode: "default",
      render_sides: "auto",
      frame_time: 1,
      frame_order_type: "loop",
      frame_interpolate: false,
      visible: true,
      uuid: uuidv4(),
      layers_enabled: false,
      uv_width: width,
      uv_height: height,
      width,
      height,
      source,
      relative_path: "",
    };
  });

  const elements: Record<string, unknown>[] = [];
  const outliner: string[] = [];

  meshes.forEach((mesh, meshIdx) => {
    if (mesh.triangles.length === 0) return;
    const elementUuid = uuidv4();
    const vertices: Record<string, Vec3> = {};
    const faces: Record<string, unknown> = {};

    mesh.triangles.forEach((tri) => {
      const mat = materials[tri.materialIndex];
      const texWidth = mat?.width ?? FALLBACK_TEXTURE_SIZE;
      const texHeight = mat?.height ?? FALLBACK_TEXTURE_SIZE;
      const vertexIds = tri.positions.map((p) => {
        const id = shortId("v");
        vertices[id] = project(p);
        return id;
      });
      const uv: Record<string, Vec2> = {};
      vertexIds.forEach((id, i) => {
        uv[id] = [tri.uvs[i][0] * texWidth, tri.uvs[i][1] * texHeight];
      });
      const faceId = shortId("f");
      faces[faceId] = {
        uv,
        vertices: vertexIds,
        texture: tri.materialIndex,
      };
    });

    elements.push({
      name: mesh.name || `mesh_${meshIdx}`,
      type: "mesh",
      uuid: elementUuid,
      rescale: false,
      locked: false,
      light_emission: 0,
      vertices,
      faces,
      origin: [0, 0, 0],
    });
    outliner.push(elementUuid);
  });

  const resolution = textureEntries.length > 0
    ? { width: textureEntries[0].width, height: textureEntries[0].height }
    : { width: FALLBACK_TEXTURE_SIZE, height: FALLBACK_TEXTURE_SIZE };

  return {
    meta: {
      format_version: "4.10",
      model_format: "free",
      box_uv: false,
    },
    name: modelName,
    model_identifier: "",
    resolution,
    elements,
    outliner,
    textures: textureEntries,
  };
}
