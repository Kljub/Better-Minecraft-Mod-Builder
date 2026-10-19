"use client";

import type { EntityModel, FaceKey } from "@/lib/model3d/types";
import { FACE_KEYS } from "@/lib/model3d/types";
import { effectiveFaceUvs } from "@/lib/model3d/geometry";
import { findBone, findCube } from "@/lib/model3d/aiOps";

/**
 * Texture painting for the AI tools (browser canvas). Works in the model's texture pixel space,
 * using the same face UV rectangles the viewport and exporters use.
 */

export interface PaintOp { x: number; y: number; w?: number; h?: number; color: string }

/** Shading per face like Minecraft's directional lighting baked into textures. */
const SHADE: Record<FaceKey, number> = { up: 1.08, north: 0.95, south: 0.92, east: 0.86, west: 0.86, down: 0.7 };

function rgb(hex: string): [number, number, number, number] {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) throw new Error(`bad colour "${hex}" (use #rrggbb)`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
}

/** Small deterministic PRNG so repainting gives the same grain. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

function canvasFor(model: EntityModel): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = model.textureWidth;
  canvas.height = model.textureHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

async function drawExisting(ctx: CanvasRenderingContext2D, url: string | undefined, model: EntityModel) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = "anonymous"; // pack textures can be GitHub URLs — keeps the canvas exportable
  img.src = url;
  await img.decode().catch(() => undefined);
  if (img.naturalWidth) ctx.drawImage(img, 0, 0, model.textureWidth, model.textureHeight);
}

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas export failed"))), "image/png"));

/** Integer pixel rect [x0, y0, x1, y1) of a face, plus whether it's flipped on each axis. */
function faceRect(uv: [number, number, number, number]) {
  const [u1, v1, u2, v2] = uv;
  return { x0: Math.floor(Math.min(u1, u2)), y0: Math.floor(Math.min(v1, v2)), x1: Math.ceil(Math.max(u1, u2)), y1: Math.ceil(Math.max(v1, v2)), flipX: u1 > u2, flipY: v1 > v2 };
}

/** Fills every cube face with its colour, face shading and optional grain. */
export async function paintCubes(model: EntityModel, opts: { defaultColor?: string; colors?: Record<string, string>; noise?: number }, existingUrl?: string): Promise<Blob> {
  const { canvas, ctx } = canvasFor(model);
  await drawExisting(ctx, existingUrl, model);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const colorOf = (cubeId: string) => {
    const cube = model.cubes.find((c) => c.id === cubeId)!;
    const byCube = Object.entries(opts.colors ?? {}).find(([k]) => findCube(model, k)?.id === cube.id)?.[1];
    if (byCube) return byCube;
    // Nearest bone (or ancestor) with a colour.
    let bone = cube.bone ? model.bones.find((b) => b.id === cube.bone) : undefined;
    while (bone) {
      const id = bone.id;
      const hit = Object.entries(opts.colors ?? {}).find(([k]) => findBone(model, k)?.id === id)?.[1];
      if (hit) return hit;
      bone = bone.parent ? model.bones.find((b) => b.id === bone!.parent) : undefined;
    }
    return opts.defaultColor ?? "#8a8a8a";
  };
  const noise = Math.max(0, Math.min(1, opts.noise ?? 0.12));
  model.cubes.forEach((cube, ci) => {
    const [r, g, b, a] = rgb(colorOf(cube.id));
    const uvs = effectiveFaceUvs(cube);
    const rand = rng(ci * 7919 + 17);
    for (const face of FACE_KEYS) {
      if (!cube.boxUv && !cube.faces[face].enabled) continue;
      const f = faceRect(uvs[face]);
      for (let y = Math.max(0, f.y0); y < Math.min(canvas.height, f.y1); y++) {
        for (let x = Math.max(0, f.x0); x < Math.min(canvas.width, f.x1); x++) {
          const k = SHADE[face] * (1 + (rand() - 0.5) * noise * 0.8);
          const i = (y * canvas.width + x) * 4;
          img.data[i] = Math.max(0, Math.min(255, Math.round(r * k)));
          img.data[i + 1] = Math.max(0, Math.min(255, Math.round(g * k)));
          img.data[i + 2] = Math.max(0, Math.min(255, Math.round(b * k)));
          img.data[i + 3] = a;
        }
      }
    }
  });
  ctx.putImageData(img, 0, 0);
  return toBlob(canvas);
}

function fill(ctx: CanvasRenderingContext2D, op: PaintOp) {
  const [r, g, b, a] = rgb(op.color);
  ctx.clearRect(op.x, op.y, op.w ?? 1, op.h ?? 1);
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.fillRect(op.x, op.y, op.w ?? 1, op.h ?? 1);
}

/** Rectangles/pixels in texture space, on top of the current texture. */
export async function paintTexture(model: EntityModel, ops: PaintOp[], existingUrl?: string): Promise<Blob> {
  const { canvas, ctx } = canvasFor(model);
  await drawExisting(ctx, existingUrl, model);
  for (const op of ops) fill(ctx, op);
  return toBlob(canvas);
}

/**
 * Paints one face of a cube: optional full fill, then ops whose x/y are relative to the face's
 * top-left as seen from outside the cube (flipped faces are handled).
 */
export async function paintFace(model: EntityModel, cubeRef: string, face: FaceKey, color: string | undefined, ops: PaintOp[] | undefined, existingUrl?: string): Promise<Blob> {
  const cube = findCube(model, cubeRef);
  if (!cube) throw new Error(`cube "${cubeRef}" not found`);
  const f = faceRect(effectiveFaceUvs(cube)[face]);
  const w = f.x1 - f.x0, h = f.y1 - f.y0;
  if (w <= 0 || h <= 0) throw new Error(`face ${face} of "${cube.name}" has no area`);
  const { canvas, ctx } = canvasFor(model);
  await drawExisting(ctx, existingUrl, model);
  if (color) fill(ctx, { x: f.x0, y: f.y0, w, h, color });
  for (const op of ops ?? []) {
    const ow = op.w ?? 1, oh = op.h ?? 1;
    if (op.x < 0 || op.y < 0 || op.x + ow > w || op.y + oh > h) throw new Error(`op at ${op.x},${op.y} is outside the ${w}x${h} face`);
    const x = f.flipX ? f.x1 - op.x - ow : f.x0 + op.x;
    const y = f.flipY ? f.y1 - op.y - oh : f.y0 + op.y;
    fill(ctx, { x, y, w: ow, h: oh, color: op.color });
  }
  return toBlob(canvas);
}
