import * as THREE from "three";
import type { EntityModel, Vec3 } from "./types";
import { javaParts } from "./codecs";
import { javaAnimations, type AnimKeyframe, type ModelAnimation } from "./animation";
import { placed, type MeshOrientation } from "./meshReference";
import type { AiRig } from "./aiRig";
import type { MeshPack } from "./meshPackStore";

/**
 * Converts a loaded mesh (STL/OBJ/GLB/FBX/3MF) into a MeshPack the mod can use as-is through
 * NeoForge's OBJ loader — no re-modelling into cubes.
 *
 * Entities: Minecraft can't deform (skin) meshes, so the mesh is cut into rigid parts, one per
 * bone — like vanilla mobs. The bones come from the file's skeleton (GLB/FBX: every triangle goes
 * to the bone with the most skin weight) or from an AI rig (aiRig.ts: smallest region containing
 * the triangle, else the nearest bone). The rig becomes Java ModelParts with identity rest
 * rotations (pivots only), animations are sampled per bone at 20 fps into keyframes relative to
 * that rest pose, and both go through the same javaParts/javaAnimations conversion the cube
 * models use. Each part's OBJ is written in that part's Java model space (blocks).
 *
 * Items/blocks: one OBJ in block units (0..1), fitted into one block.
 */
export interface MeshBuildOptions {
  target: MeshPack["target"];
  orientation: MeshOrientation;
  /** entity height in blocks */
  height: number;
  /** "file": the file's skeleton; "ai": `aiRig`; "none": one rigid part */
  rig: "file" | "ai" | "none";
  aiRig?: AiRig;
  /** height (blocks) the AI rig's pixel positions were made for — scaled to `height` */
  aiRigHeight?: number;
  /** animations for the AI rig (bone ids = bone names) */
  aiAnimations?: ModelAnimation[];
}

export interface MeshAsset { object: THREE.Object3D; animations: THREE.AnimationClip[] }

/** Triangles per bone in editor space, for the rig preview. */
export interface MeshPartPreview { bone: string; positions: Float32Array }
export interface RigBonePreview { name: string; parent: string | null; pivot: Vec3 }

const FPS = 20;
const MAX_TEXTURE = 1024;

interface Bone {
  name: string;
  parent: number;
  pivot: THREE.Vector3;
  /** the file's bone object (file rig) */
  obj?: THREE.Object3D;
  region?: THREE.Box3;
}

const sanitize = (s: string) => {
  const n = s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "bone";
  return /^[a-z]/.test(n) ? n : `b_${n}`;
};
function uniqueNamer() {
  const taken = new Set<string>();
  return (raw: string) => {
    const base = sanitize(raw);
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base}_${i}`;
    taken.add(name);
    return name;
  };
}

/** Bones of the file's skeleton(s), parents first. */
function fileBones(root: THREE.Object3D): Bone[] {
  const set = new Set<THREE.Object3D>();
  root.traverse((o) => {
    const sk = (o as THREE.SkinnedMesh).isSkinnedMesh ? (o as THREE.SkinnedMesh).skeleton : null;
    sk?.bones.forEach((b) => set.add(b));
  });
  if (!set.size) return [];
  const name = uniqueNamer();
  const bones: Bone[] = [];
  const index = new Map<THREE.Object3D, number>();
  const visit = (b: THREE.Object3D, parent: number) => {
    index.set(b, bones.length);
    bones.push({ name: name(b.name || "bone"), parent, pivot: b.getWorldPosition(new THREE.Vector3()), obj: b });
    const me = bones.length - 1;
    for (const c of b.children) if (set.has(c)) visit(c, me);
  };
  for (const b of set) {
    let p = b.parent;
    while (p && !set.has(p)) p = p.parent;
    if (!p) visit(b, -1);
  }
  return bones;
}

function aiBones(rig: AiRig, scale: number): Bone[] {
  const name = uniqueNamer();
  const names = rig.bones.map((b) => name(b.name));
  return rig.bones.map((b, i) => ({
    name: names[i],
    parent: b.parent ? rig.bones.findIndex((x) => x.name === b.parent) : -1,
    pivot: new THREE.Vector3(...b.pivot).multiplyScalar(scale),
    region: new THREE.Box3(
      new THREE.Vector3(...b.region.from).multiplyScalar(scale),
      new THREE.Vector3(...b.region.from).add(new THREE.Vector3(...b.region.size)).multiplyScalar(scale),
    ),
  }));
}

/** Distance from p to the bone's segment (pivot → each child pivot, or its region centre for leaves). */
function boneDistance(bones: Bone[], i: number, p: THREE.Vector3): number {
  const kids = bones.filter((b) => b.parent === i).map((b) => b.pivot);
  const ends = kids.length ? kids : bones[i].region && !bones[i].region!.isEmpty() ? [bones[i].region!.getCenter(new THREE.Vector3())] : [bones[i].pivot];
  const seg = new THREE.Line3();
  let best = Infinity;
  for (const e of ends) best = Math.min(best, seg.set(bones[i].pivot, e).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p));
  return best;
}

async function texturePng(tex: THREE.Texture | null | undefined): Promise<string | null> {
  const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || !img.width || !img.height) return null;
  const scale = Math.min(1, MAX_TEXTURE / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png").split(",")[1];
}

/** 16×16 opaque white PNG — the texture of untextured materials (their colour comes from Kd). */
const WHITE_PNG = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVR42mP4TyFgGDVg1IBRA4aLAQBdePwurSGpXgAAAABJRU5ErkJggg==";

const f = (n: number) => (Math.round(n * 1e5) / 1e5).toString();

/** Drops keyframes that linear interpolation between their neighbours already reproduces. */
function reduce(keys: { t: number; v: Vec3 }[], tol: number): { t: number; v: Vec3 }[] {
  if (keys.length <= 2) return keys;
  const out = [keys[0]];
  for (let i = 1; i < keys.length - 1; i++) {
    const a = out[out.length - 1], b = keys[i + 1];
    const k = (keys[i].t - a.t) / (b.t - a.t || 1);
    if (keys[i].v.some((v, j) => Math.abs(a.v[j] + (b.v[j] - a.v[j]) * k - v) > tol)) out.push(keys[i]);
  }
  out.push(keys[keys.length - 1]);
  return out;
}

const clipName = uniqueNamer;

/** File animation clips → editor-format animations (rotation degrees ZYX, position px) on the rest pose. */
function sampleClips(model: THREE.Object3D, root: THREE.Object3D, bones: Bone[], clips: THREE.AnimationClip[]): ModelAnimation[] {
  if (!clips.length || !bones.some((b) => b.obj)) return [];
  const restQ = bones.map((b) => b.obj!.getWorldQuaternion(new THREE.Quaternion()));
  const restP = bones.map((b) => b.pivot.clone());
  const named = clipName();
  const mixer = new THREE.AnimationMixer(model);
  const out: ModelAnimation[] = [];
  for (const clip of clips.slice(0, 24)) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    const length = Math.max(0.05, clip.duration);
    const frames = Math.min(1200, Math.ceil(length * FPS));
    const rot = bones.map(() => [] as { t: number; v: Vec3 }[]);
    const pos = bones.map(() => [] as { t: number; v: Vec3 }[]);
    for (let fi = 0; fi <= frames; fi++) {
      const t = Math.min(length, fi / FPS);
      // A looping action wraps to 0 at exactly its duration — sample the last frame just before.
      mixer.setTime(Math.min(t, length - 1e-4));
      root.updateMatrixWorld(true);
      const D = bones.map((b, i) => b.obj!.getWorldQuaternion(new THREE.Quaternion()).multiply(restQ[i].clone().invert()));
      const P = bones.map((b) => b.obj!.getWorldPosition(new THREE.Vector3()));
      bones.forEach((b, i) => {
        const parentInv = b.parent >= 0 ? D[b.parent].clone().invert() : new THREE.Quaternion();
        const local = parentInv.clone().multiply(D[i]);
        const e = new THREE.Euler().setFromQuaternion(local, "ZYX");
        let v: Vec3 = [e.x, e.y, e.z].map((r) => (r * 180) / Math.PI) as Vec3;
        // Unwrap ±180° jumps so interpolation takes the short way.
        const prev = rot[i].at(-1)?.v;
        if (prev) v = v.map((x, j) => x + 360 * Math.round((prev[j] - x) / 360)) as Vec3;
        rot[i].push({ t, v });
        const offset = b.parent >= 0
          ? P[i].clone().sub(P[b.parent]).applyQuaternion(parentInv).sub(restP[i].clone().sub(restP[b.parent]))
          : P[i].clone().sub(restP[i]);
        pos[i].push({ t, v: [offset.x, offset.y, offset.z] });
      });
    }
    action.stop();
    const track = (keys: { t: number; v: Vec3 }[]): AnimKeyframe[] =>
      keys.map((k, i) => ({ id: `k${i}`, time: Math.round(k.t * 1000) / 1000, value: k.v.map((x) => Math.round(x * 1000) / 1000) as Vec3, interpolation: "linear" }));
    const animBones: ModelAnimation["bones"] = {};
    bones.forEach((b, i) => {
      const r = reduce(rot[i], 0.5);
      const p = reduce(pos[i], 0.05);
      const moves = (k: { v: Vec3 }[], tol: number) => k.some((x) => x.v.some((v) => Math.abs(v) > tol));
      if (!moves(r, 0.5) && !moves(p, 0.05)) return;
      animBones[b.name] = { rotation: moves(r, 0.5) ? track(r) : [], position: moves(p, 0.05) ? track(p) : [], scale: [] };
    });
    out.push({ id: `anim_${out.length}`, name: named(clip.name || `animation_${out.length + 1}`), length: Math.round(length * 1000) / 1000, loop: "loop", bones: animBones });
  }
  mixer.stopAllAction();
  mixer.setTime(0);
  mixer.uncacheRoot(model);
  root.updateMatrixWorld(true);
  return out;
}

export interface BuiltMesh { pack: MeshPack; preview: MeshPartPreview[]; bones: RigBonePreview[]; animations: ModelAnimation[] }

export async function buildMeshPack(asset: MeshAsset, o: MeshBuildOptions): Promise<BuiltMesh> {
  const entity = o.target === "entity";
  const height = Math.max(0.1, o.height || 2);
  const { root, model } = placed(asset.object, o.orientation, entity ? { mode: "height", px: height * 16 } : { mode: "longest", px: 16 });
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3());

  let bones: Bone[] = [];
  if (entity && o.rig === "file") bones = fileBones(root);
  else if (entity && o.rig === "ai" && o.aiRig?.bones.length) bones = aiBones(o.aiRig, height / Math.max(0.1, o.aiRigHeight ?? height));
  if (!bones.length) bones = [{ name: "root", parent: -1, pivot: new THREE.Vector3() }];
  const boneOf = new Map(bones.flatMap((b, i) => (b.obj ? [[b.obj, i] as const] : [])));

  // Materials → texture slots m0, m1, … (untextured ones share "white" and only tint with Kd).
  const slots = new Map<THREE.Material, string>();
  const mtl: string[] = [];
  const textures: Record<string, string> = {};
  const materialSlot = async (m: THREE.Material | undefined): Promise<string> => {
    const key = m ?? (null as unknown as THREE.Material);
    if (slots.has(key)) return slots.get(key)!;
    const slot = `m${slots.size}`;
    slots.set(key, slot);
    const std = m as THREE.MeshStandardMaterial | undefined;
    const png = await texturePng(std?.map);
    if (png) textures[slot] = png;
    else textures.white ??= WHITE_PNG;
    const c = std?.color ?? new THREE.Color(1, 1, 1);
    mtl.push(`newmtl ${slot}`, `Kd ${f(c.r)} ${f(c.g)} ${f(c.b)}`, `d ${f(std?.opacity ?? 1)}`, `map_Kd #${png ? slot : "white"}`, "");
    return slot;
  };

  // Per bone: OBJ vertex lists and faces per material.
  interface PartData { v: string[]; vt: string[]; vc: string[]; faces: Map<string, string[]>; seen: Map<string, number>; preview: number[] }
  const parts = bones.map((): PartData => ({ v: [], vt: [], vc: [], faces: new Map(), seen: new Map(), preview: [] }));
  let triangles = 0;
  const meshes: THREE.Mesh[] = [];
  root.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh && m.geometry?.getAttribute("position")) meshes.push(m); });

  for (const [mi, mesh] of meshes.entries()) {
    const g = mesh.geometry;
    const pos = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    const col = g.getAttribute("color");
    const index = g.getIndex();
    const count = index ? index.count : pos.count;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? (mesh as THREE.SkinnedMesh) : null;
    const skinIndex = skinned ? g.getAttribute("skinIndex") : null;
    const skinWeight = skinned ? g.getAttribute("skinWeight") : null;
    // Non-skinned meshes follow their nearest ancestor bone (a sword parented to a hand).
    let staticBone = 0;
    for (let p: THREE.Object3D | null = mesh.parent; p; p = p.parent) if (boneOf.has(p)) { staticBone = boneOf.get(p)!; break; }
    const world = (i: number) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const groupOf = (t: number) => g.groups.find((gr) => t >= gr.start && t < gr.start + gr.count)?.materialIndex ?? 0;
    const flipV = !!(mats[0] as THREE.MeshStandardMaterial | undefined)?.map?.flipY;

    for (let t = 0; t + 2 < count; t += 3) {
      const ids = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k));
      const ps = ids.map(world);
      let bone = staticBone;
      if (o.rig === "file" && skinned && skinIndex && skinWeight) {
        const sum = new Map<number, number>();
        for (const id of ids) for (let k = 0; k < 4; k++) {
          const w = skinWeight.getComponent(id, k);
          if (w > 0) { const bi = boneOf.get(skinned.skeleton.bones[skinIndex.getComponent(id, k)]); if (bi !== undefined) sum.set(bi, (sum.get(bi) ?? 0) + w); }
        }
        let best = -1;
        for (const [bi, w] of sum) if (w > best) { best = w; bone = bi; }
      } else if (o.rig === "ai" && bones.length > 1) {
        const c = ps[0].clone().add(ps[1]).add(ps[2]).divideScalar(3);
        let bestVol = Infinity;
        bone = -1;
        bones.forEach((b, i) => {
          if (!b.region || !b.region.containsPoint(c)) return;
          const s = b.region.getSize(new THREE.Vector3());
          const vol = s.x * s.y * s.z;
          if (vol < bestVol) { bestVol = vol; bone = i; }
        });
        if (bone < 0) {
          let bestD = Infinity;
          bones.forEach((_, i) => { const d = boneDistance(bones, i, c); if (d < bestD) { bestD = d; bone = i; } });
        }
      } else if (o.rig !== "file") bone = 0;
      const part = parts[bone];
      const slot = await materialSlot(mats[groupOf(t)] ?? mats[0]);
      const pivot = bones[bone].pivot;
      const refs = ids.map((id, k) => {
        const key = `${mi}:${id}`;
        let n = part.seen.get(key);
        if (n === undefined) {
          const p = ps[k];
          // entity: the part's Java space (X/Y flipped, relative to the pivot); item/block: block units 0..1
          const v = entity ? [-(p.x - pivot.x) / 16, -(p.y - pivot.y) / 16, (p.z - pivot.z) / 16] : [(p.x + 8) / 16, p.y / 16, (p.z + 8) / 16];
          part.v.push(`v ${v.map(f).join(" ")}`);
          const u = uv ? Math.min(1, Math.max(0, uv.getX(id))) : 0;
          const vv = uv ? Math.min(1, Math.max(0, uv.getY(id))) : 0;
          part.vt.push(`vt ${f(u)} ${f(flipV ? 1 - vv : vv)}`);
          if (col) part.vc.push(`vc ${f(col.getX(id))} ${f(col.getY(id))} ${f(col.getZ(id))} 1`);
          n = part.v.length;
          part.seen.set(key, n);
        }
        return col ? `${n}/${n}//${n}` : `${n}/${n}`;
      });
      const list = part.faces.get(slot) ?? [];
      list.push(`f ${refs.join(" ")}`);
      part.faces.set(slot, list);
      part.preview.push(...ps.flatMap((p) => [p.x, p.y, p.z]));
      triangles++;
    }
  }
  if (!triangles) throw new Error("The file contains no triangles.");

  const objs: Record<string, string> = {};
  bones.forEach((b, i) => {
    const p = parts[i];
    if (!p.faces.size) return;
    objs[b.name] = [
      "# Made with MC Screen Designer", "mtllib mesh.mtl", ...p.v, ...p.vt, ...p.vc,
      ...[...p.faces].flatMap(([slot, faces]) => [`usemtl ${slot}`, ...faces]), "",
    ].join("\n");
  });

  // The rig as a cube-less entity model → the same Java parts/animation conversion as cube models.
  const rigModel: EntityModel = {
    textureWidth: 16, textureHeight: 16, texture: "",
    bones: bones.map((b) => ({ id: b.name, name: b.name, parent: b.parent >= 0 ? bones[b.parent].name : null, origin: [b.pivot.x, b.pivot.y, b.pivot.z].map((v) => Math.round(v * 1000) / 1000) as Vec3, rotation: [0, 0, 0] })),
    cubes: [],
  };
  const anims = !entity ? [] : o.rig === "file" ? sampleClips(model, root, bones, asset.animations) : o.rig === "ai" ? (o.aiAnimations ?? []) : [];

  const pack: MeshPack = {
    version: 1,
    target: o.target,
    size: [size.x, size.y, size.z].map((v) => Math.round((v / 16) * 1000) / 1000) as Vec3,
    triangles,
    parts: entity ? javaParts(rigModel) : [],
    meshes: entity ? objs : { root: mergedRoot(objs) },
    mtl: mtl.join("\n"),
    textures,
    animations: entity ? javaAnimations(rigModel, anims) : [],
    clips: anims.map((a) => a.name),
    bones: entity ? bones.length : 0,
  };
  return {
    pack,
    preview: bones.flatMap((b, i) => (parts[i].preview.length ? [{ bone: b.name, positions: new Float32Array(parts[i].preview) }] : [])),
    bones: bones.map((b) => ({ name: b.name, parent: b.parent >= 0 ? bones[b.parent].name : null, pivot: [b.pivot.x, b.pivot.y, b.pivot.z] as Vec3 })),
    animations: anims,
  };
}

/** Items/blocks have a single part — "root" already holds every triangle. */
function mergedRoot(objs: Record<string, string>): string {
  return objs.root ?? Object.values(objs)[0] ?? "";
}

/** What the AI needs to rig a mesh: size, voxel boxes and renders, at the entity's height. */
export { buildMeshReference as rigInputs } from "./meshReference";
