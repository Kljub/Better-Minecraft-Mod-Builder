import type { EntityModel, ModelBone, ModelCube, Vec3 } from "./types";
import { add3, boneSubtree, cubeSize, makeBone, makeCube, newId, translateBone, uniqueName } from "./geometry";

/** Pure model edits used by the editor UI (and later the AI tools). Every function returns a new model. */

export type ModelSelection = { type: "cube" | "bone"; id: string } | null;

const snapTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);
const snap3 = (v: Vec3, step: number): Vec3 => [snapTo(v[0], step), snapTo(v[1], step), snapTo(v[2], step)];

export function addBone(model: EntityModel, parent: string | null): { model: EntityModel; id: string } {
  const p = parent ? model.bones.find((b) => b.id === parent) : undefined;
  const bone = makeBone({ name: uniqueName("bone", model.bones.map((b) => b.name)), parent: p?.id ?? null, origin: p ? [...p.origin] as Vec3 : [0, 0, 0] });
  return { model: { ...model, bones: [...model.bones, bone] }, id: bone.id };
}

export function addCube(model: EntityModel, bone: string | null): { model: EntityModel; id: string } {
  const b = bone ? model.bones.find((x) => x.id === bone) : undefined;
  const o: Vec3 = b ? b.origin : [0, 0, 0];
  const cube = makeCube({
    name: "cube", bone: b?.id ?? null,
    from: [o[0] - 2, o[1], o[2] - 2], to: [o[0] + 2, o[1] + 4, o[2] + 2], origin: [...o] as Vec3,
  });
  return { model: { ...model, cubes: [...model.cubes, cube] }, id: cube.id };
}

export function updateCube(model: EntityModel, id: string, patch: Partial<ModelCube>): EntityModel {
  return { ...model, cubes: model.cubes.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function updateBone(model: EntityModel, id: string, patch: Partial<ModelBone>): EntityModel {
  if (patch.name !== undefined) {
    patch = { ...patch, name: uniqueName(patch.name, model.bones.filter((b) => b.id !== id).map((b) => b.name)) };
  }
  return { ...model, bones: model.bones.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}

/** Sets a cube's size keeping `from` fixed. */
export function resizeCube(model: EntityModel, id: string, size: Vec3): EntityModel {
  const c = model.cubes.find((x) => x.id === id);
  if (!c) return model;
  return updateCube(model, id, { to: add3(c.from, size) });
}

/** Moves a cube (and its pivot) to a new position of its `from` corner. */
export function moveCubeTo(model: EntityModel, id: string, from: Vec3): EntityModel {
  const c = model.cubes.find((x) => x.id === id);
  if (!c) return model;
  const d: Vec3 = [from[0] - c.from[0], from[1] - c.from[1], from[2] - c.from[2]];
  return updateCube(model, id, { from, to: add3(c.to, d), origin: add3(c.origin, d) });
}

/** Moves a bone's pivot only (children stay where they are). */
export function setBonePivot(model: EntityModel, id: string, origin: Vec3): EntityModel {
  return updateBone(model, id, { origin });
}

/** Re-parents a bone; refuses to create a cycle. */
export function reparentBone(model: EntityModel, id: string, parent: string | null): EntityModel {
  if (parent && boneSubtree(model, id).includes(parent)) return model;
  return updateBone(model, id, { parent });
}

export function deleteSelection(model: EntityModel, sel: ModelSelection): EntityModel {
  if (!sel) return model;
  if (sel.type === "cube") return { ...model, cubes: model.cubes.filter((c) => c.id !== sel.id) };
  const ids = new Set(boneSubtree(model, sel.id));
  return { ...model, bones: model.bones.filter((b) => !ids.has(b.id)), cubes: model.cubes.filter((c) => !c.bone || !ids.has(c.bone)) };
}

export function duplicateSelection(model: EntityModel, sel: ModelSelection): { model: EntityModel; selection: ModelSelection } {
  if (!sel) return { model, selection: sel };
  if (sel.type === "cube") {
    const c = model.cubes.find((x) => x.id === sel.id);
    if (!c) return { model, selection: sel };
    const copy = { ...c, id: newId("cube"), name: `${c.name}`, faces: structuredClone(c.faces) };
    const idx = model.cubes.indexOf(c);
    return { model: { ...model, cubes: [...model.cubes.slice(0, idx + 1), copy, ...model.cubes.slice(idx + 1)] }, selection: { type: "cube", id: copy.id } };
  }
  const subtree = boneSubtree(model, sel.id);
  const idMap = new Map(subtree.map((id) => [id, newId("bone")]));
  const names = model.bones.map((b) => b.name);
  const newBones = model.bones.filter((b) => idMap.has(b.id)).map((b) => {
    const name = uniqueName(b.name, names);
    names.push(name);
    return { ...b, id: idMap.get(b.id)!, name, parent: b.parent && idMap.has(b.parent) ? idMap.get(b.parent)! : b.parent };
  });
  const newCubes = model.cubes.filter((c) => c.bone && idMap.has(c.bone)).map((c) => ({ ...c, id: newId("cube"), bone: idMap.get(c.bone!)!, faces: structuredClone(c.faces) }));
  return {
    model: { ...model, bones: [...model.bones, ...newBones], cubes: [...model.cubes, ...newCubes] },
    selection: { type: "bone", id: idMap.get(sel.id)! },
  };
}

export type GizmoResult =
  | { kind: "translate"; delta: Vec3 }
  | { kind: "rotate"; rotation: Vec3 }
  | { kind: "scale"; scale: Vec3 };

/** Applies a finished gizmo drag. Translation/size snap to `snap` px, rotation to 0.01°. */
export function applyGizmo(model: EntityModel, sel: NonNullable<ModelSelection>, result: GizmoResult, snap: number): EntityModel {
  const rot = (v: Vec3): Vec3 => v.map((x) => Math.round(x * 100) / 100 + 0) as Vec3;
  if (sel.type === "bone") {
    if (result.kind === "translate") return translateBone(model, sel.id, snap3(result.delta, snap));
    if (result.kind === "rotate") return updateBone(model, sel.id, { rotation: rot(result.rotation) });
    return model;
  }
  const c = model.cubes.find((x) => x.id === sel.id);
  if (!c) return model;
  if (result.kind === "translate") {
    const d = snap3(result.delta, snap);
    return updateCube(model, c.id, { from: add3(c.from, d), to: add3(c.to, d), origin: add3(c.origin, d) });
  }
  if (result.kind === "rotate") return updateCube(model, c.id, { rotation: rot(result.rotation) });
  // Scale about the cube's centre, size snapped (min one snap step, or 0 for planes on that axis).
  const size = cubeSize(c);
  const center: Vec3 = [(c.from[0] + c.to[0]) / 2, (c.from[1] + c.to[1]) / 2, (c.from[2] + c.to[2]) / 2];
  const newSize = size.map((s, i) => {
    const scaled = snapTo(Math.abs(s * result.scale[i]), snap || 0.0001);
    return s === 0 ? 0 : Math.max(snap || 0.25, scaled);
  }) as Vec3;
  const from: Vec3 = [center[0] - newSize[0] / 2, center[1] - newSize[1] / 2, center[2] - newSize[2] / 2];
  return updateCube(model, c.id, { from: snap3(from, snap / 2), to: add3(snap3(from, snap / 2), newSize) });
}

/** Copied cubes/bones — module-level so it also pastes into a different model. */
export interface ModelClip {
  bones: ModelBone[];
  cubes: ModelCube[];
  /** bone ids in `bones` whose parent wasn't copied (they get attached to the paste target) */
  roots: string[];
}

let clipboard: ModelClip | null = null;
export const hasClipboard = () => clipboard !== null;

export function copySelection(model: EntityModel, sel: ModelSelection): boolean {
  if (!sel) return false;
  if (sel.type === "cube") {
    const c = model.cubes.find((x) => x.id === sel.id);
    if (!c) return false;
    clipboard = { bones: [], cubes: [structuredClone(c)], roots: [] };
    return true;
  }
  const ids = new Set(boneSubtree(model, sel.id));
  clipboard = {
    bones: structuredClone(model.bones.filter((b) => ids.has(b.id))),
    cubes: structuredClone(model.cubes.filter((c) => c.bone && ids.has(c.bone))),
    roots: [sel.id],
  };
  return true;
}

/** Pastes the clipboard into `target` bone (or the root): fresh ids, unique bone names, same positions. */
export function pasteClipboard(model: EntityModel, target: string | null): { model: EntityModel; selection: ModelSelection } {
  if (!clipboard) return { model, selection: null };
  const clip = clipboard;
  const idMap = new Map(clip.bones.map((b) => [b.id, newId("bone")]));
  const names = model.bones.map((b) => b.name);
  const bones = clip.bones.map((b) => {
    const name = uniqueName(b.name, names);
    names.push(name);
    return { ...b, id: idMap.get(b.id)!, name, parent: clip.roots.includes(b.id) ? target : idMap.get(b.parent ?? "") ?? target };
  });
  const cubes = clip.cubes.map((c) => ({
    ...c, id: newId("cube"), faces: structuredClone(c.faces),
    bone: c.bone && idMap.has(c.bone) ? idMap.get(c.bone)! : target,
  }));
  const selection: ModelSelection = clip.roots.length ? { type: "bone", id: idMap.get(clip.roots[0])! } : cubes[0] ? { type: "cube", id: cubes[0].id } : null;
  return { model: { ...model, bones: [...model.bones, ...bones], cubes: [...model.cubes, ...cubes] }, selection };
}
