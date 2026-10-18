"use client";

/**
 * Browser-only glue: parses a .glb ArrayBuffer with three's GLTFLoader, walks the resulting
 * scene graph, and reshapes it into the engine-agnostic `MeshInput`/material description that
 * both bbmodel.ts and geckolibGeometry.ts build their output from. Kept separate from those
 * because it needs three.js math/loaders plus DOM canvas APIs to rasterize glTF textures into
 * data URLs — none of which run in the Node test env.
 */

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { MeshInput, Vec2, Vec3 } from "./meshTypes";
import type { BbmodelMaterialInput } from "./bbmodel";

export interface GlbMeshData {
  meshes: MeshInput[];
  materials: BbmodelMaterialInput[];
  stats: { meshCount: number; triangleCount: number; textureCount: number };
  /** The parsed scene, handed back so the caller can render a preview of what was actually read. */
  scene: THREE.Object3D;
}

export async function parseGlb(buffer: ArrayBuffer): Promise<GLTF> {
  const loader = new GLTFLoader();
  return loader.parseAsync(buffer, "");
}

/** Draws a three.js texture's decoded image onto an offscreen canvas and reads it back as a PNG data URL. */
function textureToDataUrl(texture: THREE.Texture): { url: string; width: number; height: number } | null {
  const image = texture.image as { width?: number; height?: number } | undefined;
  if (!image || !image.width || !image.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image as CanvasImageSource, 0, 0);
  return { url: canvas.toDataURL("image/png"), width: image.width, height: image.height };
}

function materialInput(material: THREE.Material, index: number): BbmodelMaterialInput {
  const name = material.name || `material_${index}`;
  const map = (material as THREE.MeshStandardMaterial).map;
  if (map) {
    const extracted = textureToDataUrl(map);
    if (extracted) return { name, textureDataUrl: extracted.url, width: extracted.width, height: extracted.height };
  }
  const color = (material as THREE.MeshStandardMaterial).color;
  return { name, color: color ? color.getHex() : 0xcccccc };
}

export function extractGlbMeshData(gltf: GLTF): GlbMeshData {
  const scene = gltf.scene;
  scene.updateWorldMatrix(true, true);

  const materialIndexByRef = new Map<THREE.Material, number>();
  const materials: BbmodelMaterialInput[] = [];
  const meshes: MeshInput[] = [];
  let triangleCount = 0;

  const resolveMaterialIndex = (material: THREE.Material): number => {
    const existing = materialIndexByRef.get(material);
    if (existing !== undefined) return existing;
    const index = materials.length;
    materials.push(materialInput(material, index));
    materialIndexByRef.set(material, index);
    return index;
  };

  scene.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    if (!position) return;
    const uvAttr = geometry.attributes.uv;
    const materials_ = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count: geometry.index ? geometry.index.count : position.count, materialIndex: 0 }];

    const readVertex = (vertexIndex: number): { pos: Vec3; uv: Vec2 } => {
      const local = new THREE.Vector3(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));
      local.applyMatrix4(mesh.matrixWorld);
      const uv: Vec2 = uvAttr ? [uvAttr.getX(vertexIndex), uvAttr.getY(vertexIndex)] : [0, 0];
      return { pos: [local.x, local.y, local.z], uv };
    };

    const triangles: MeshInput["triangles"] = [];
    for (const group of groups) {
      const groupMaterial = materials_[group.materialIndex ?? 0] ?? materials_[0];
      const materialIndex = resolveMaterialIndex(groupMaterial);
      const indices: number[] = [];
      if (geometry.index) {
        for (let i = group.start; i < group.start + group.count; i++) indices.push(geometry.index.getX(i));
      } else {
        for (let i = group.start; i < group.start + group.count; i++) indices.push(i);
      }
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const a = readVertex(indices[i]);
        const b = readVertex(indices[i + 1]);
        const c = readVertex(indices[i + 2]);
        triangles.push({ positions: [a.pos, b.pos, c.pos], uvs: [a.uv, b.uv, c.uv], materialIndex });
      }
    }

    if (triangles.length > 0) {
      meshes.push({ name: mesh.name, triangles });
      triangleCount += triangles.length;
    }
  });

  return {
    meshes,
    materials,
    stats: { meshCount: meshes.length, triangleCount, textureCount: materials.length },
    scene,
  };
}
