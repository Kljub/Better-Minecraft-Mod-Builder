import type { EntityModel, ModelBone, ModelCube, Vec3 } from "./types";
import { boneSubtree, cubeSize, makeBone, makeCube, newId, translateBone, uniqueName } from "./geometry";
import { deleteSelection, updateBone, updateCube } from "./edit";
import { makeAnimation, setKeyframe, type Channel, type ModelAnimation } from "./animation";

/**
 * Model operations the MCP tools call (and that are handy elsewhere): name-based lookup, bulk
 * creation, mirroring, UV packing, rig templates and generated base animations. All pure.
 */

/** "bone:arm" / "cube:arm" force the type when a bone and a cube share a name. */
function parseRef(ref: string): { type: "bone" | "cube" | null; name: string } {
  const m = /^(bone|cube):(.+)$/.exec(ref);
  return m ? { type: m[1] as "bone" | "cube", name: m[2] } : { type: null, name: ref };
}

export function findBone(model: EntityModel, refIn: string): ModelBone | undefined {
  const { type, name: ref } = parseRef(refIn);
  if (type === "cube") return undefined;
  return model.bones.find((b) => b.id === ref) ?? model.bones.find((b) => b.name === ref) ?? model.bones.find((b) => b.name.toLowerCase() === ref.toLowerCase());
}

export function findCube(model: EntityModel, refIn: string): ModelCube | undefined {
  const { type, name: ref } = parseRef(refIn);
  if (type === "bone") return undefined;
  return model.cubes.find((c) => c.id === ref) ?? model.cubes.find((c) => c.name === ref) ?? model.cubes.find((c) => c.name.toLowerCase() === ref.toLowerCase());
}

const need = <T>(v: T | undefined, what: string): T => {
  if (!v) throw new Error(`${what} not found`);
  return v;
};

export interface BoneInput { name: string; parent?: string; pivot?: Vec3; rotation?: Vec3 }
export interface CubeInput {
  name?: string; bone: string; from: Vec3; size: Vec3; pivot?: Vec3; rotation?: Vec3;
  uv?: [number, number]; inflate?: number; mirror?: boolean;
}

export function addBones(model: EntityModel, bones: BoneInput[]): EntityModel {
  let m = model;
  for (const b of bones) {
    const parent = b.parent ? need(findBone(m, b.parent), `parent bone "${b.parent}"`) : undefined;
    if (findBone(m, b.name)?.name === b.name) throw new Error(`bone "${b.name}" already exists`);
    const bone = makeBone({ name: uniqueName(b.name, m.bones.map((x) => x.name)), parent: parent?.id ?? null, origin: b.pivot ?? (parent ? [...parent.origin] as Vec3 : [0, 0, 0]), rotation: b.rotation ?? [0, 0, 0] });
    m = { ...m, bones: [...m.bones, bone] };
  }
  return m;
}

export function addCubes(model: EntityModel, cubes: CubeInput[]): EntityModel {
  const added: ModelCube[] = [];
  for (const c of cubes) {
    const bone = need(findBone(model, c.bone), `bone "${c.bone}"`);
    if (c.size.some((s) => s < 0)) throw new Error("cube size must not be negative");
    const to: Vec3 = [c.from[0] + c.size[0], c.from[1] + c.size[1], c.from[2] + c.size[2]];
    const center: Vec3 = [(c.from[0] + to[0]) / 2, (c.from[1] + to[1]) / 2, (c.from[2] + to[2]) / 2];
    added.push(makeCube({
      name: c.name || bone.name, bone: bone.id, from: [...c.from] as Vec3, to,
      origin: c.pivot ?? center, rotation: c.rotation ?? [0, 0, 0],
      uvOffset: c.uv ?? [0, 0], inflate: c.inflate ?? 0, mirror: c.mirror ?? false,
    }));
  }
  return { ...model, cubes: [...model.cubes, ...added] };
}

/** Applies tool-style changes (size/uv/pivot names) to a bone or cube found by name/id. */
export function editTarget(model: EntityModel, target: string, changes: Record<string, unknown>): EntityModel {
  // Cube first, unless the change only makes sense for a bone.
  if ("parent" in changes && findBone(model, target) && !/^cube:/.test(target)) target = `bone:${target.replace(/^bone:/, "")}`;
  const v3 = (v: unknown, key: string): Vec3 => {
    if (!Array.isArray(v) || v.length !== 3 || v.some((n) => typeof n !== "number")) throw new Error(`${key} must be [x, y, z]`);
    return v as Vec3;
  };
  const cube = findCube(model, target);
  if (cube) {
    const patch: Partial<ModelCube> = {};
    let from = cube.from, size = cubeSize(cube);
    for (const [k, v] of Object.entries(changes)) {
      if (k === "name") patch.name = String(v);
      else if (k === "bone") patch.bone = need(findBone(model, String(v)), `bone "${v}"`).id;
      else if (k === "from") from = v3(v, k);
      else if (k === "size") size = v3(v, k);
      else if (k === "pivot") patch.origin = v3(v, k);
      else if (k === "rotation") patch.rotation = v3(v, k);
      else if (k === "uv") { if (!Array.isArray(v) || v.length !== 2) throw new Error("uv must be [u, v]"); patch.uvOffset = [Number(v[0]), Number(v[1])]; }
      else if (k === "inflate") patch.inflate = Number(v);
      else if (k === "mirror") patch.mirror = v === true;
      else throw new Error(`unknown cube field "${k}"`);
    }
    if ("from" in changes || "size" in changes) {
      patch.from = from;
      patch.to = [from[0] + size[0], from[1] + size[1], from[2] + size[2]];
      if ("from" in changes && !("pivot" in changes)) {
        const d = [from[0] - cube.from[0], from[1] - cube.from[1], from[2] - cube.from[2]];
        patch.origin = [cube.origin[0] + d[0], cube.origin[1] + d[1], cube.origin[2] + d[2]];
      }
    }
    return updateCube(model, cube.id, patch);
  }
  const bone = need(findBone(model, target), `bone or cube "${target}"`);
  const patch: Partial<ModelBone> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (k === "name") patch.name = String(v);
    else if (k === "parent") {
      const p = v === null || v === "" ? null : need(findBone(model, String(v)), `bone "${v}"`).id;
      if (p && boneSubtree(model, bone.id).includes(p)) throw new Error("a bone can't be parented to its own child");
      patch.parent = p;
    } else if (k === "pivot") patch.origin = v3(v, k);
    else if (k === "rotation") patch.rotation = v3(v, k);
    else throw new Error(`unknown bone field "${k}"`);
  }
  return updateBone(model, bone.id, patch);
}

export function moveBone(model: EntityModel, bone: string, offset: Vec3): EntityModel {
  return translateBone(model, need(findBone(model, bone), `bone "${bone}"`).id, offset);
}

/**
 * Puts a held item (weapon, tool, staff, shield…) into a hand: finds the item's handle (its
 * longest thin cube) and the hand (the far end of the arm bone's main cube from its pivot), turns
 * the item in 90° steps so its head points `direction`, moves it so the grip point sits in the hand,
 * makes the hand the item bone's pivot and parents the item to the arm — so arm animations swing it.
 * `grip` is how far up the handle the hand holds it (0 = pommel end, 1 = head end).
 */
export function holdItem(model: EntityModel, itemRef: string, handRef: string, opts: { direction?: "keep" | "forward" | "up" | "down"; grip?: number } = {}): { model: EntityModel; hand: Vec3; grip: Vec3 } {
  const item = need(findBone(model, itemRef), `item bone "${itemRef}"`);
  const arm = need(findBone(model, handRef), `hand/arm bone "${handRef}"`);
  const subtree = new Set(boneSubtree(model, item.id));
  if (subtree.has(arm.id)) throw new Error(`"${arm.name}" is part of the item — pick the arm that holds it`);
  const itemCubes = model.cubes.filter((c) => c.bone && subtree.has(c.bone));
  if (!itemCubes.length) throw new Error(`item bone "${item.name}" has no cubes`);
  const armCubes = model.cubes.filter((c) => c.bone === arm.id);
  if (!armCubes.length) throw new Error(`arm bone "${arm.name}" has no cubes of its own`);

  const lo = (c: ModelCube): Vec3 => [0, 1, 2].map((i) => Math.min(c.from[i], c.to[i])) as Vec3;
  const hi = (c: ModelCube): Vec3 => [0, 1, 2].map((i) => Math.max(c.from[i], c.to[i])) as Vec3;
  const dims = (c: ModelCube) => [0, 1, 2].map((i) => hi(c)[i] - lo(c)[i]);
  const axisOf = (c: ModelCube) => { const d = dims(c); return d.indexOf(Math.max(...d)); };
  const center = (c: ModelCube): Vec3 => [0, 1, 2].map((i) => (lo(c)[i] + hi(c)[i]) / 2) as Vec3;

  // Hand: far end of the arm's biggest cube along its long axis, a little inside the cube.
  const main = [...armCubes].sort((a, b) => dims(b).reduce((x, y) => x * y, 1) - dims(a).reduce((x, y) => x * y, 1))[0];
  const ax = axisOf(main);
  const hand = center(main);
  const far = Math.abs(lo(main)[ax] - arm.origin[ax]) > Math.abs(hi(main)[ax] - arm.origin[ax]) ? lo(main)[ax] : hi(main)[ax];
  const inset = Math.min(1.5, dims(main)[ax] / 4);
  hand[ax] = far + (far < center(main)[ax] ? inset : -inset);

  // Handle: the cube that's longest relative to its thickness.
  const handle = [...itemCubes].sort((a, b) => {
    const r = (c: ModelCube) => { const d = [...dims(c)].sort((x, y) => y - x); return d[0] / Math.max(0.5, d[1]); };
    return r(b) - r(a) || Math.max(...dims(b)) - Math.max(...dims(a));
  })[0];
  const hax = axisOf(handle);
  // Pommel = the handle end farther from the rest of the item (blade / axe head / staff top).
  const rest = itemCubes.filter((c) => c !== handle);
  const restCenter = rest.length ? rest.map(center).reduce((s, c) => s + c[hax], 0) / rest.length : hi(handle)[hax];
  const pommelLow = Math.abs(lo(handle)[hax] - restCenter) >= Math.abs(hi(handle)[hax] - restCenter);
  const len = dims(handle)[hax];
  const g = Math.max(0, Math.min(1, opts.grip ?? (len > 16 ? 0.35 : 0.2)));
  let grip = center(handle);
  grip[hax] = pommelLow ? lo(handle)[hax] + len * g : hi(handle)[hax] - len * g;

  // Turn in 90° steps so the head (pommel → head) points the requested way.
  let m = model;
  const want: Record<string, Vec3> = { forward: [0, 0, -1], up: [0, 1, 0], down: [0, -1, 0] };
  const dir = opts.direction && opts.direction !== "keep" ? want[opts.direction] : null;
  if (dir) {
    const cur: Vec3 = [0, 0, 0];
    cur[hax] = pommelLow ? 1 : -1;
    const rot = rotationBetween(cur, dir);
    if (rot) {
      const p = (v: Vec3): Vec3 => { const d = [v[0] - grip[0], v[1] - grip[1], v[2] - grip[2]]; return [0, 1, 2].map((i) => grip[i] + rot[i][0] * d[0] + rot[i][1] * d[1] + rot[i][2] * d[2]) as Vec3; };
      m = {
        ...m,
        bones: m.bones.map((b) => (subtree.has(b.id) ? { ...b, origin: p(b.origin) } : b)),
        cubes: m.cubes.map((c) => {
          if (!c.bone || !subtree.has(c.bone)) return c;
          const a = p(c.from), b = p(c.to);
          return { ...c, from: [0, 1, 2].map((i) => Math.min(a[i], b[i])) as Vec3, to: [0, 1, 2].map((i) => Math.max(a[i], b[i])) as Vec3, origin: p(c.origin) };
        }),
      };
    }
  }
  const offset: Vec3 = [hand[0] - grip[0], hand[1] - grip[1], hand[2] - grip[2]];
  m = translateBone(m, item.id, offset);
  m = updateBone(m, item.id, { origin: hand, parent: arm.id });
  grip = hand;
  return { model: m, hand, grip };
}

/** 90°/180° rotation matrix turning axis unit vector a into b (null if equal). */
function rotationBetween(a: Vec3, b: Vec3): number[][] | null {
  if (a.every((v, i) => v === b[i])) return null;
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const opposite = a.every((v, i) => v === -b[i]);
  // Rotation axis: a × b, or any axis perpendicular to a for a half turn.
  const k: Vec3 = opposite ? (a[0] === 0 ? [1, 0, 0] : [0, 1, 0]) : [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  const K2 = K.map((r) => [0, 1, 2].map((j) => r[0] * K[0][j] + r[1] * K[1][j] + r[2] * K[2][j]));
  // Rodrigues: R = I + sinθ K + (1 − cosθ) K²; θ = 90° → I + K + K², θ = 180° → I + 2K².
  return I.map((r, i) => r.map((v, j) => v + (opposite ? 0 : K[i][j]) + (opposite ? 2 : 1) * K2[i][j]));
}

/**
 * Plain-words check of an animation's rotations for the AI: for every rotated bone, where the tip
 * of its own geometry (the cube corner farthest from the pivot) moves at the biggest keyframe —
 * so a sign mistake ("arms swing backwards") is visible in the tool result, not only on screen.
 */
export function describeMotion(model: EntityModel, anim: ModelAnimation): string[] {
  const out: string[] = [];
  const rad = Math.PI / 180;
  const rotate = (v: Vec3, r: Vec3): Vec3 => {
    // Euler ZYX (= Rz · Ry · Rx applied to v), the same as the viewport and Minecraft.
    const [x, y, z] = v, [a, b, c] = r.map((d) => d * rad);
    const y1 = y * Math.cos(a) - z * Math.sin(a), z1 = y * Math.sin(a) + z * Math.cos(a);
    const x2 = x * Math.cos(b) + z1 * Math.sin(b), z2 = -x * Math.sin(b) + z1 * Math.cos(b);
    return [x2 * Math.cos(c) - y1 * Math.sin(c), x2 * Math.sin(c) + y1 * Math.cos(c), z2];
  };
  for (const [boneId, track] of Object.entries(anim.bones)) {
    const bone = model.bones.find((b) => b.id === boneId);
    if (!bone || !track.rotation.length) continue;
    const corners = model.cubes.filter((c) => c.bone === boneId).flatMap((c) => [0, 1, 2, 3, 4, 5, 6, 7].map((i): Vec3 => [
      (i & 1 ? c.to : c.from)[0] - bone.origin[0], (i & 2 ? c.to : c.from)[1] - bone.origin[1], (i & 4 ? c.to : c.from)[2] - bone.origin[2],
    ]));
    if (!corners.length) continue;
    const tip = corners.reduce((best, v) => (Math.hypot(...v) > Math.hypot(...best) ? v : best));
    const key = track.rotation.reduce((best, k) => (Math.hypot(...k.value) > Math.hypot(...best.value) ? k : best));
    if (Math.hypot(...key.value) < 5) continue;
    const rest = rotate(tip, bone.rotation);
    const moved = rotate(tip, [bone.rotation[0] + key.value[0], bone.rotation[1] + key.value[1], bone.rotation[2] + key.value[2]]);
    const d = moved.map((v, i) => v - rest[i]);
    const parts: [number, string][] = [
      [d[2], d[2] < 0 ? "forward (-Z, towards the face)" : "backward (+Z)"],
      [d[1], d[1] > 0 ? "up" : "down"],
      [d[0], d[0] < 0 ? "to the mob's left (-X)" : "to the mob's right (+X)"],
    ];
    const words = parts.filter(([v]) => Math.abs(v) >= 1).sort((p, q) => Math.abs(q[0]) - Math.abs(p[0])).map(([v, w]) => `${Math.round(Math.abs(v))}px ${w}`);
    if (words.length) out.push(`${bone.name} @${key.time}s rotation [${key.value.join(", ")}]: its tip moves ${words.join(", ")}`);
  }
  return out;
}

export function deleteTargets(model: EntityModel, targets: string[]): EntityModel {
  let m = model;
  for (const t of targets) {
    // A bone wins over a same-named cube (templates name cubes after their bone).
    const bone = findBone(m, t);
    if (bone) { m = deleteSelection(m, { type: "bone", id: bone.id }); continue; }
    const cube = need(findCube(m, t), `bone or cube "${t}"`);
    m = deleteSelection(m, { type: "cube", id: cube.id });
  }
  return m;
}

const mirrorName = (n: string) => {
  const swapped = n.replace(/left|right|Left|Right|LEFT|RIGHT/g, (w) => ({ left: "right", right: "left", Left: "Right", Right: "Left", LEFT: "RIGHT", RIGHT: "LEFT" } as Record<string, string>)[w]);
  return swapped !== n ? swapped : `${n}_mirror`;
};
const mx = (v: Vec3): Vec3 => [v[0] === 0 ? 0 : -v[0], v[1], v[2]];
const mrot = (v: Vec3): Vec3 => [v[0], v[1] === 0 ? 0 : -v[1], v[2] === 0 ? 0 : -v[2]];
const mirrorCube = (c: ModelCube, bone: string | null): ModelCube => ({
  ...c, id: newId("cube"), name: mirrorName(c.name), bone,
  from: [c.to[0] === 0 ? 0 : -c.to[0], c.from[1], c.from[2]], to: [c.from[0] === 0 ? 0 : -c.from[0], c.to[1], c.to[2]],
  origin: mx(c.origin), rotation: mrot(c.rotation), mirror: !c.mirror, faces: structuredClone(c.faces),
});

/** Copy of a cube or bone subtree mirrored across X=0 (left↔right names, flipped box UV). */
export function mirrorTarget(model: EntityModel, target: string): EntityModel {
  // A bone wins over a same-named cube (templates name cubes after their bone).
  const bone = findBone(model, target);
  if (!bone) {
    const cube = need(findCube(model, target), `bone or cube "${target}"`);
    return { ...model, cubes: [...model.cubes, mirrorCube(cube, cube.bone)] };
  }
  const ids = boneSubtree(model, bone.id);
  const idMap = new Map(ids.map((id) => [id, newId("bone")]));
  const names = model.bones.map((b) => b.name);
  const newBones = model.bones.filter((b) => idMap.has(b.id)).map((b) => {
    const name = uniqueName(mirrorName(b.name), names);
    names.push(name);
    return { ...b, id: idMap.get(b.id)!, name, parent: b.parent && idMap.has(b.parent) ? idMap.get(b.parent)! : b.parent, origin: mx(b.origin), rotation: mrot(b.rotation) };
  });
  const newCubes = model.cubes.filter((c) => c.bone && idMap.has(c.bone)).map((c) => mirrorCube(c, idMap.get(c.bone!)!));
  return { ...model, bones: [...model.bones, ...newBones], cubes: [...model.cubes, ...newCubes] };
}

/**
 * Box-UV layout without overlaps: each cube needs (2d+2w) x (d+h) pixels; shelf-packed largest
 * first into the smallest power-of-two texture (width ≥ height, up to 512) that fits.
 */
export function packUv(model: EntityModel): EntityModel {
  const boxes = model.cubes.map((c) => {
    const [w, h, d] = cubeSize(c).map((s) => Math.floor(Math.abs(s) + 1e-6));
    return { id: c.id, w: Math.max(1, 2 * d + 2 * w), h: Math.max(1, d + h) };
  }).sort((a, b) => b.h - a.h || b.w - a.w);
  for (let size = 16; size <= 1024; size *= 2) {
    for (const [tw, th] of [[size, size / 2], [size, size]] as [number, number][]) {
      if (tw < 16 || th < 16) continue;
      const placed = new Map<string, [number, number]>();
      let x = 0, y = 0, rowH = 0, ok = true;
      for (const b of boxes) {
        if (b.w > tw) { ok = false; break; }
        if (x + b.w > tw) { y += rowH; x = 0; rowH = 0; }
        if (y + b.h > th) { ok = false; break; }
        placed.set(b.id, [x, y]);
        x += b.w;
        rowH = Math.max(rowH, b.h);
      }
      if (ok) {
        return {
          ...model, textureWidth: tw, textureHeight: th,
          cubes: model.cubes.map((c) => ({ ...c, boxUv: true, uvOffset: placed.get(c.id) ?? [0, 0] })),
        };
      }
    }
  }
  throw new Error("Too many/large cubes to fit a 1024x1024 texture.");
}

/** Vanilla-like starting rigs (pivots/cube sizes from the vanilla humanoid / cow models). */
export function templateModel(kind: "humanoid" | "quadruped"): EntityModel {
  let m: EntityModel = { textureWidth: 64, textureHeight: 64, texture: "", bones: [], cubes: [], animations: [] };
  if (kind === "humanoid") {
    m = addBones(m, [
      { name: "body", pivot: [0, 24, 0] }, { name: "head", parent: "body", pivot: [0, 24, 0] },
      // The mob faces north (-Z), so its left side is -X.
      { name: "left_arm", parent: "body", pivot: [-5, 22, 0] }, { name: "right_arm", parent: "body", pivot: [5, 22, 0] },
      { name: "left_leg", parent: "body", pivot: [-2, 12, 0] }, { name: "right_leg", parent: "body", pivot: [2, 12, 0] },
    ]);
    m = addCubes(m, [
      { name: "body", bone: "body", from: [-4, 12, -2], size: [8, 12, 4] },
      { name: "head", bone: "head", from: [-4, 24, -4], size: [8, 8, 8] },
      { name: "left_arm", bone: "left_arm", from: [-8, 12, -2], size: [4, 12, 4] },
      { name: "right_arm", bone: "right_arm", from: [4, 12, -2], size: [4, 12, 4] },
      { name: "left_leg", bone: "left_leg", from: [-4, 0, -2], size: [4, 12, 4] },
      { name: "right_leg", bone: "right_leg", from: [0, 0, -2], size: [4, 12, 4] },
    ]);
  } else {
    m = addBones(m, [
      { name: "body", pivot: [0, 19, 2] }, { name: "head", parent: "body", pivot: [0, 20, -8] },
      { name: "left_front_leg", parent: "body", pivot: [-4, 12, -6] }, { name: "right_front_leg", parent: "body", pivot: [4, 12, -6] },
      { name: "left_hind_leg", parent: "body", pivot: [-4, 12, 7] }, { name: "right_hind_leg", parent: "body", pivot: [4, 12, 7] },
    ]);
    m = addCubes(m, [
      { name: "body", bone: "body", from: [-6, 12, -8], size: [12, 10, 18] },
      { name: "head", bone: "head", from: [-4, 16, -14], size: [8, 8, 6] },
      { name: "left_front_leg", bone: "left_front_leg", from: [-6, 0, -8], size: [4, 12, 4] },
      { name: "right_front_leg", bone: "right_front_leg", from: [2, 0, -8], size: [4, 12, 4] },
      { name: "left_hind_leg", bone: "left_hind_leg", from: [-6, 0, 5], size: [4, 12, 4] },
      { name: "right_hind_leg", bone: "right_hind_leg", from: [2, 0, 5], size: [4, 12, 4] },
    ]);
  }
  return packUv(m);
}

type Role = "leg_l" | "leg_r" | "arm_l" | "arm_r" | "head" | "tail" | "wing_l" | "wing_r" | "body";

/** Guesses each bone's role from its name. */
export function boneRoles(model: EntityModel): Map<string, Role> {
  const out = new Map<string, Role>();
  for (const b of model.bones) {
    const n = b.name.toLowerCase();
    // Facing north (-Z): the mob's left is -X.
    const side = /left|_l$|^l_|\.l$/.test(n) ? "l" : /right|_r$|^r_|\.r$/.test(n) ? "r" : b.origin[0] < -0.5 ? "l" : b.origin[0] > 0.5 ? "r" : null;
    if (/leg|foot|paw/.test(n)) out.set(b.id, side === "r" ? "leg_r" : "leg_l");
    else if (/arm|hand|claw/.test(n)) out.set(b.id, side === "r" ? "arm_r" : "arm_l");
    else if (/wing/.test(n)) out.set(b.id, side === "r" ? "wing_r" : "wing_l");
    else if (/head|skull|neck/.test(n)) out.set(b.id, "head");
    else if (/tail/.test(n)) out.set(b.id, "tail");
    else if (/body|torso|chest/.test(n)) out.set(b.id, "body");
  }
  return out;
}

/** Base animation from bone roles: walk / idle / attack / fly. */
export function generateAnimation(model: EntityModel, kind: "walk" | "idle" | "attack" | "fly", opts: { name?: string; speed?: number; intensity?: number } = {}): ModelAnimation {
  const roles = boneRoles(model);
  const k = opts.intensity ?? 1;
  const speed = opts.speed ?? 1;
  const length = { walk: 1, idle: 3, attack: 0.5, fly: 0.6 }[kind] / speed;
  let anim = makeAnimation(opts.name ?? kind, { length: Math.round(length * 100) / 100, loop: kind === "attack" ? "once" : "loop" });
  const key = (bone: string, ch: Channel, t: number, v: Vec3, interp: "linear" | "catmullrom" = "catmullrom") => {
    anim = setKeyframe(anim, bone, ch, Math.round(t * 1000) / 1000, v.map((x) => Math.round(x * 100) / 100 + 0) as Vec3, interp);
  };
  const L = anim.length;
  // The mob faces north (-Z). In these (Blockbench/three.js) rotations a hanging limb swings
  // towards the face with +X, and a head pitches down with -X.
  const front = (b: ModelBone) => b.origin[2] < 0;
  for (const b of model.bones) {
    const role = roles.get(b.id);
    if (!role) continue;
    if (kind === "walk") {
      const a = 35 * k;
      let phase = role === "leg_l" || role === "arm_r" ? 1 : role === "leg_r" || role === "arm_l" ? -1 : 0;
      if ((role === "leg_l" || role === "leg_r") && roles.size && [...roles.values()].filter((r) => r.startsWith("leg")).length >= 4 && !front(b)) phase *= -1;
      if (phase) [0, 0.25, 0.5, 0.75, 1].forEach((f, i) => key(b.id, "rotation", f * L, [[a, 0, -a, 0, a][i] * phase * (role.startsWith("arm") ? 0.8 : 1), 0, 0]));
      if (role === "head") [0, 0.5, 1].forEach((f, i) => key(b.id, "rotation", f * L, [[0, 4 * k, 0][i], 0, 0]));
      if (role === "tail") [0, 0.5, 1].forEach((f, i) => key(b.id, "rotation", f * L, [0, [-12 * k, 12 * k, -12 * k][i], 0]));
    } else if (kind === "idle") {
      if (role === "body") [0, 0.5, 1].forEach((f, i) => key(b.id, "scale", f * L, [1, [1, 1 + 0.02 * k, 1][i], 1]));
      if (role === "head") [0, 0.5, 1].forEach((f, i) => key(b.id, "rotation", f * L, [[0, -4 * k, 0][i], [0, 6 * k, 0][i], 0]));
      if (role === "arm_l" || role === "arm_r") [0, 0.5, 1].forEach((f, i) => key(b.id, "rotation", f * L, [0, 0, [0, (role === "arm_l" ? -3 : 3) * k, 0][i]]));
      if (role === "tail") [0, 0.5, 1].forEach((f, i) => key(b.id, "rotation", f * L, [0, [-8 * k, 8 * k, -8 * k][i], 0]));
    } else if (kind === "attack") {
      if (role === "arm_l" || role === "arm_r") { key(b.id, "rotation", 0, [0, 0, 0]); key(b.id, "rotation", 0.4 * L, [110 * k, 0, 0]); key(b.id, "rotation", L, [0, 0, 0]); }
      if (role === "head") { key(b.id, "rotation", 0, [0, 0, 0]); key(b.id, "rotation", 0.4 * L, [-15 * k, 0, 0]); key(b.id, "rotation", L, [0, 0, 0]); }
      if (role === "body") { key(b.id, "position", 0, [0, 0, 0]); key(b.id, "position", 0.4 * L, [0, 0, -2 * k]); key(b.id, "position", L, [0, 0, 0]); }
    } else {
      if (role === "wing_l" || role === "wing_r") {
        const s = role === "wing_l" ? -1 : 1;
        [0, 0.5, 1].forEach((f, i) => key(b.id, "rotation", f * L, [0, 0, [40 * k * s, -30 * k * s, 40 * k * s][i]]));
      }
      if (role === "body") [0, 0.5, 1].forEach((f, i) => key(b.id, "position", f * L, [0, [0, 1.5 * k, 0][i], 0]));
      if (role === "leg_l" || role === "leg_r") key(b.id, "rotation", 0, [-25 * k, 0, 0], "linear"); // legs trail backwards
    }
  }
  if (!Object.keys(anim.bones).length) throw new Error(`No bones with recognisable names (legs/arms/head/tail/wings/body) for a ${kind} animation.`);
  return anim;
}

/** Compact model description for the AI (names instead of ids). */
export function describeModel(model: EntityModel): Record<string, unknown> {
  const boneName = new Map(model.bones.map((b) => [b.id, b.name]));
  return {
    texture: { width: model.textureWidth, height: model.textureHeight, set: !!model.texture },
    bones: model.bones.map((b) => ({ name: b.name, parent: b.parent ? boneName.get(b.parent) ?? null : null, pivot: b.origin, rotation: b.rotation })),
    cubes: model.cubes.map((c) => ({
      name: c.name, bone: c.bone ? boneName.get(c.bone) ?? null : null, from: c.from, size: cubeSize(c),
      pivot: c.origin, rotation: c.rotation, uv: c.uvOffset, inflate: c.inflate, mirror: c.mirror, boxUv: c.boxUv,
    })),
    animations: (model.animations ?? []).map((a) => ({
      name: a.name, length: a.length, loop: a.loop,
      bones: Object.fromEntries(Object.entries(a.bones).map(([id, tr]) => [boneName.get(id) ?? id, {
        rotation: tr.rotation.map((k) => ({ t: k.time, v: k.value, i: k.interpolation })),
        position: tr.position.map((k) => ({ t: k.time, v: k.value, i: k.interpolation })),
        scale: tr.scale.map((k) => ({ t: k.time, v: k.value, i: k.interpolation })),
      }])),
    })),
  };
}
