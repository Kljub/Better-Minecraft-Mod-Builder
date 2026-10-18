import { FACE_KEYS, type EntityModel, type FaceKey, type ModelBone, type ModelCube, type ModelFace, type Vec3 } from "./types";
import { cubeSize, defaultFaces, effectiveFaceUvs, makeBone, makeCube, newId, uniqueName } from "./geometry";
import type { McVersion } from "@/lib/mcVersion";
import { fromBbmodelAnimations, toBbmodelAnimations } from "./animation";

/**
 * Import/export for entity models. Every conversion mirrors Blockbench's own codecs
 * (js/formats/bedrock/bedrock.js compileCube/compileGroup/parseCube/parseBone and
 * js/formats/java/modded_entity.ts "1.17" template), so files open in Blockbench, GeckoLib
 * and Minecraft exactly as they look here.
 */

/** Rounds to 4 decimals and turns -0 into 0 (negating X/rotations would otherwise write "-0"). */
const r = (n: number) => { const x = Math.round(n * 10000) / 10000; return x === 0 ? 0 : x; };
/** Negation without producing -0. */
const neg = (n: number) => (n === 0 ? 0 : -n);
const v3 = (a: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 =>
  Array.isArray(a) && a.length >= 3 ? [Number(a[0]) || 0, Number(a[1]) || 0, Number(a[2]) || 0] : [...fallback] as Vec3;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const allZero = (v: Vec3) => v[0] === 0 && v[1] === 0 && v[2] === 0;

/** Bone that root-level cubes are wrapped in on export (Bedrock/Java need every cube in a bone). */
const ROOT_BONE = "bb_main";

/** Bones ordered parents-before-children (export order), plus a synthetic root bone if needed. */
function exportBones(model: EntityModel): { bones: ModelBone[]; cubeBone: (c: ModelCube) => string } {
  const ordered: ModelBone[] = [];
  const seen = new Set<string>();
  const visit = (parent: string | null) => {
    for (const b of model.bones) if (b.parent === parent && !seen.has(b.id)) { seen.add(b.id); ordered.push(b); visit(b.id); }
  };
  visit(null);
  // Orphans (parent id missing) become roots rather than disappearing.
  for (const b of model.bones) if (!seen.has(b.id)) { seen.add(b.id); ordered.push({ ...b, parent: null }); visit(b.id); }
  const hasRootCubes = model.cubes.some((c) => !c.bone || !seen.has(c.bone));
  const rootName = uniqueName(ROOT_BONE, ordered.map((b) => b.name));
  const root: ModelBone | null = hasRootCubes ? { id: "__root__", name: rootName, parent: null, origin: [0, 0, 0], rotation: [0, 0, 0] } : null;
  return {
    bones: root ? [root, ...ordered] : ordered,
    cubeBone: (c) => (c.bone && seen.has(c.bone) ? c.bone : "__root__"),
  };
}

// ── Bedrock / GeckoLib geometry ───────────────────────────────────────────────

export interface GeoExportOptions {
  /** geometry identifier without the "geometry." prefix */
  identifier: string;
}

export function toBedrockGeo(model: EntityModel, opts: GeoExportOptions): Record<string, unknown> {
  const { bones, cubeBone } = exportBones(model);
  const nameOf = new Map(bones.map((b) => [b.id, b.name]));
  const outBones = bones.map((b) => {
    const bone: Record<string, unknown> = { name: b.name };
    if (b.parent) bone.parent = nameOf.get(b.parent);
    bone.pivot = [r(-b.origin[0]), r(b.origin[1]), r(b.origin[2])];
    if (!allZero(b.rotation)) bone.rotation = [r(-b.rotation[0]), r(-b.rotation[1]), r(b.rotation[2])];
    const cubes = model.cubes.filter((c) => cubeBone(c) === b.id).map(compileGeoCube);
    if (cubes.length) bone.cubes = cubes;
    return bone;
  });

  // Visible bounds, roughly like Blockbench's calculateVisibleBox: enough to never cull the model.
  let maxH = 0, maxY = 0;
  for (const c of model.cubes) {
    maxH = Math.max(maxH, Math.abs(c.from[0]), Math.abs(c.to[0]), Math.abs(c.from[2]), Math.abs(c.to[2]));
    maxY = Math.max(maxY, c.to[1], c.from[1]);
  }
  const width = Math.max(1, Math.ceil((maxH * 2) / 16) + 1);
  const height = Math.max(1, Math.ceil(maxY / 16) + 1);

  return {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: {
        identifier: `geometry.${opts.identifier}`,
        texture_width: model.textureWidth,
        texture_height: model.textureHeight,
        visible_bounds_width: width,
        visible_bounds_height: height,
        visible_bounds_offset: [0, height / 2, 0],
      },
      bones: outBones,
    }],
  };
}

function compileGeoCube(c: ModelCube): Record<string, unknown> {
  const size = cubeSize(c);
  const cube: Record<string, unknown> = {
    origin: [r(-(c.from[0] + size[0])), r(c.from[1]), r(c.from[2])],
    size: size.map(r),
  };
  if (c.inflate) cube.inflate = r(c.inflate);
  if (!allZero(c.rotation)) {
    cube.pivot = [r(-c.origin[0]), r(c.origin[1]), r(c.origin[2])];
    cube.rotation = [r(-c.rotation[0]), r(-c.rotation[1]), r(c.rotation[2])];
  }
  if (c.boxUv) {
    cube.uv = [...c.uvOffset];
    if (c.mirror) cube.mirror = true;
  } else {
    const uv: Record<string, unknown> = {};
    for (const key of FACE_KEYS) {
      const f = c.faces[key];
      if (!f.enabled) continue;
      const face: { uv: [number, number]; uv_size: [number, number]; uv_rotation?: number } = {
        uv: [r(f.uv[0]), r(f.uv[1])],
        uv_size: [r(f.uv[2] - f.uv[0]), r(f.uv[3] - f.uv[1])],
      };
      if (f.rotation) face.uv_rotation = f.rotation;
      if (key === "up" || key === "down") {
        face.uv = [r(face.uv[0] + face.uv_size[0]), r(face.uv[1] + face.uv_size[1])];
        face.uv_size = [-face.uv_size[0], -face.uv_size[1]];
      }
      uv[key] = face;
    }
    cube.uv = uv;
  }
  return cube;
}

export interface ImportResult {
  model: EntityModel;
  warnings: string[];
  /** embedded texture (bbmodel only) to store as a custom texture */
  textureDataUrl?: string;
  textureName?: string;
  /** suggested element id from the file */
  name?: string;
}

/** Parses Bedrock/GeckoLib geometry JSON (format 1.12+ "minecraft:geometry" or legacy 1.8 "geometry.x"). */
export function fromBedrockGeo(json: unknown): ImportResult {
  if (!isObj(json)) throw new Error("Not a geometry file.");
  const warnings: string[] = [];
  let geo: Record<string, unknown> | undefined;
  let identifier = "";
  let texW = 64, texH = 64;
  const list = json["minecraft:geometry"];
  if (Array.isArray(list) && isObj(list[0])) {
    geo = list[0];
    if (list.length > 1) warnings.push(`File has ${list.length} geometries — imported the first.`);
    const d = isObj(geo.description) ? geo.description : {};
    identifier = String(d.identifier ?? "");
    texW = Number(d.texture_width) || 64;
    texH = Number(d.texture_height) || 64;
  } else {
    const key = Object.keys(json).find((k) => k.startsWith("geometry.") && isObj(json[k]));
    if (!key) throw new Error("No geometry found (expected \"minecraft:geometry\").");
    geo = json[key] as Record<string, unknown>;
    identifier = key.split(":")[0];
    texW = Number(geo.texturewidth) || 64;
    texH = Number(geo.textureheight) || 64;
  }

  const bones: ModelBone[] = [];
  const cubes: ModelCube[] = [];
  const idByName = new Map<string, string>();
  const rawBones = Array.isArray(geo.bones) ? geo.bones.filter(isObj) : [];
  for (const b of rawBones) idByName.set(String(b.name), newId("bone"));
  for (const b of rawBones) {
    const id = idByName.get(String(b.name))!;
    const pivot = v3(b.pivot);
    const rot = v3(b.rotation);
    bones.push({
      id, name: String(b.name),
      parent: typeof b.parent === "string" ? idByName.get(b.parent) ?? null : null,
      origin: [neg(pivot[0]), pivot[1], pivot[2]],
      rotation: [neg(rot[0]), neg(rot[1]), rot[2]],
    });
    const boneMirror = b.mirror === true;
    for (const s of Array.isArray(b.cubes) ? b.cubes.filter(isObj) : []) {
      const size = v3(s.size, [1, 1, 1]);
      const o = v3(s.origin);
      const from: Vec3 = [neg(o[0] + size[0]), o[1], o[2]];
      const pivotC = v3(s.pivot);
      const rotC = v3(s.rotation);
      const cube = makeCube({
        name: String(s.name ?? b.name), bone: id,
        from, to: [from[0] + size[0], from[1] + size[1], from[2] + size[2]],
        origin: [neg(pivotC[0]), pivotC[1], pivotC[2]],
        rotation: [neg(rotC[0]), neg(rotC[1]), rotC[2]],
        inflate: typeof s.inflate === "number" ? s.inflate : typeof b.inflate === "number" ? b.inflate : 0,
        mirror: s.mirror === undefined ? boneMirror : s.mirror === true,
      });
      if (Array.isArray(s.uv)) {
        cube.boxUv = true;
        cube.uvOffset = [Number(s.uv[0]) || 0, Number(s.uv[1]) || 0];
      } else if (isObj(s.uv)) {
        cube.boxUv = false;
        const uvObj = s.uv;
        cube.faces = defaultFaces();
        for (const key of FACE_KEYS) {
          const f = uvObj[key];
          if (!isObj(f) || !Array.isArray(f.uv)) { cube.faces[key] = { uv: [0, 0, 0, 0], rotation: 0, enabled: false }; continue; }
          const sz = Array.isArray(f.uv_size) ? [Number(f.uv_size[0]) || 0, Number(f.uv_size[1]) || 0] : [0, 0];
          let uv: [number, number, number, number] = [Number(f.uv[0]) || 0, Number(f.uv[1]) || 0, (Number(f.uv[0]) || 0) + sz[0], (Number(f.uv[1]) || 0) + sz[1]];
          if (key === "up" || key === "down") uv = [uv[2], uv[3], uv[0], uv[1]];
          cube.faces[key] = { uv, rotation: Number(f.uv_rotation) || 0, enabled: true };
        }
      }
      cubes.push(cube);
    }
    if (Array.isArray(b.poly_mesh) || isObj(b.poly_mesh)) warnings.push(`Bone "${b.name}" has a poly_mesh — only cubes are supported, it was skipped.`);
  }
  return {
    model: { textureWidth: texW, textureHeight: texH, texture: "", bones, cubes },
    warnings,
    name: identifier.replace(/^geometry\./, ""),
  };
}

// ── Blockbench .bbmodel ───────────────────────────────────────────────────────

/** Blockbench project format ids this exporter can stamp into meta.model_format. */
export const BBMODEL_FORMATS = {
  bedrock: "Bedrock Entity",
  modded_entity: "Modded Entity (Java)",
  animated_entity_model: "GeckoLib Animated Model",
} as const;
export type BbmodelFormat = keyof typeof BBMODEL_FORMATS;

function uuid(): string {
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}

export function toBbmodel(model: EntityModel, opts: { name: string; format: BbmodelFormat; textureDataUrl?: string; textureName?: string }): Record<string, unknown> {
  const uuids = new Map<string, string>();
  const uid = (id: string) => { if (!uuids.has(id)) uuids.set(id, uuid()); return uuids.get(id)!; };
  const hasTexture = !!opts.textureDataUrl;

  const elements = model.cubes.map((c) => {
    const uvs = effectiveFaceUvs(c);
    const faces: Record<string, unknown> = {};
    for (const key of FACE_KEYS) {
      const enabled = c.boxUv || c.faces[key].enabled;
      faces[key] = { uv: uvs[key].map(r), ...(c.faces[key].rotation && !c.boxUv ? { rotation: c.faces[key].rotation } : {}), texture: enabled ? (hasTexture ? 0 : null) : null };
    }
    return {
      name: c.name, box_uv: c.boxUv, rescale: false, locked: false,
      from: c.from.map(r), to: c.to.map(r), autouv: 0, color: 0,
      origin: c.origin.map(r),
      ...(allZero(c.rotation) ? {} : { rotation: c.rotation.map(r) }),
      ...(c.inflate ? { inflate: c.inflate } : {}),
      ...(c.mirror ? { mirror_uv: true } : {}),
      uv_offset: [...c.uvOffset],
      faces, type: "cube", uuid: uid(c.id),
    };
  });

  // Outliner with groups inline (format 4.x) — Blockbench 4 and 5 both read this.
  const group = (b: ModelBone): Record<string, unknown> => ({
    name: b.name, origin: b.origin.map(r), rotation: b.rotation.map(r), color: 0,
    uuid: uid(b.id), export: true, mirror_uv: false, isOpen: true, locked: false, visibility: true, autouv: 0,
    children: [
      ...model.bones.filter((x) => x.parent === b.id).map(group),
      ...model.cubes.filter((c) => c.bone === b.id).map((c) => uid(c.id)),
    ],
  });
  const boneIds = new Set(model.bones.map((b) => b.id));
  const outliner = [
    ...model.bones.filter((b) => !b.parent || !boneIds.has(b.parent)).map(group),
    ...model.cubes.filter((c) => !c.bone || !boneIds.has(c.bone)).map((c) => uid(c.id)),
  ];

  return {
    meta: { format_version: "4.10", model_format: opts.format, box_uv: model.cubes.every((c) => c.boxUv) },
    name: opts.name,
    model_identifier: opts.name,
    visible_box: [1, 1, 0],
    variable_placeholders: "",
    variable_placeholder_buttons: [],
    timeline_setups: [],
    unhandled_root_fields: {},
    resolution: { width: model.textureWidth, height: model.textureHeight },
    elements,
    outliner,
    animations: toBbmodelAnimations(model.animations ?? [], model, uid),
    textures: hasTexture ? [{
      path: "", name: opts.textureName || `${opts.name}.png`, folder: "", namespace: "", id: "0",
      width: model.textureWidth, height: model.textureHeight, uv_width: model.textureWidth, uv_height: model.textureHeight,
      particle: false, layers_enabled: false, render_mode: "default", render_sides: "auto",
      frame_time: 1, frame_order_type: "loop", frame_interpolate: false, visible: true, internal: true,
      saved: false, uuid: uuid(), relative_path: "", source: opts.textureDataUrl,
    }] : [],
  };
}

export function fromBbmodel(json: unknown): ImportResult {
  if (!isObj(json) || !isObj(json.meta)) throw new Error("Not a .bbmodel file.");
  const warnings: string[] = [];
  const res = isObj(json.resolution) ? json.resolution : {};
  const texW = Number(res.width) || 64, texH = Number(res.height) || 64;

  const cubeById = new Map<string, Record<string, unknown>>();
  let skipped = 0;
  for (const el of Array.isArray(json.elements) ? json.elements.filter(isObj) : []) {
    if ((el.type ?? "cube") !== "cube") { skipped++; continue; }
    cubeById.set(String(el.uuid), el);
  }
  if (skipped) warnings.push(`${skipped} non-cube element(s) (meshes, locators, …) were skipped.`);
  const groupTemplates = new Map<string, Record<string, unknown>>();
  for (const g of Array.isArray(json.groups) ? json.groups.filter(isObj) : []) groupTemplates.set(String(g.uuid), g);

  const bones: ModelBone[] = [];
  const cubes: ModelCube[] = [];
  const usedNames: string[] = [];
  const boneByUuid = new Map<string, string>();
  const toCube = (el: Record<string, unknown>, bone: string | null): ModelCube => {
    const boxUv = el.box_uv === true || (el.box_uv === undefined && (json.meta as Record<string, unknown>).box_uv === true);
    const faces = defaultFaces();
    const rawFaces = isObj(el.faces) ? el.faces : {};
    for (const key of FACE_KEYS) {
      const f = rawFaces[key];
      if (!isObj(f)) continue;
      const uv = Array.isArray(f.uv) ? f.uv.map((n) => Number(n) || 0) : [0, 0, 0, 0];
      faces[key] = { uv: [uv[0], uv[1], uv[2], uv[3]] as ModelFace["uv"], rotation: Number(f.rotation) || 0, enabled: f.texture !== null };
    }
    const off = Array.isArray(el.uv_offset) ? el.uv_offset : [0, 0];
    return makeCube({
      name: String(el.name ?? "cube"), bone,
      from: v3(el.from), to: v3(el.to, [1, 1, 1]), origin: v3(el.origin), rotation: v3(el.rotation),
      inflate: Number(el.inflate) || 0, boxUv, uvOffset: [Number(off[0]) || 0, Number(off[1]) || 0],
      mirror: el.mirror_uv === true, faces,
    });
  };
  const walk = (items: unknown[], parent: string | null) => {
    for (const item of items) {
      if (typeof item === "string") {
        const el = cubeById.get(item);
        if (el) cubes.push(toCube(el, parent));
        continue;
      }
      if (!isObj(item)) continue;
      const template = isObj(item) && item.name !== undefined ? item : groupTemplates.get(String(item.uuid)) ?? item;
      const name = uniqueName(String(template.name ?? "bone"), usedNames);
      usedNames.push(name);
      const bone = makeBone({ name, parent, origin: v3(template.origin), rotation: v3(template.rotation) });
      bones.push(bone);
      if (item.uuid) boneByUuid.set(String(item.uuid), bone.id);
      walk(Array.isArray(item.children) ? item.children : [], bone.id);
    }
  };
  walk(Array.isArray(json.outliner) ? json.outliner : [...cubeById.keys()], null);

  const tex = Array.isArray(json.textures) ? json.textures.find((t) => isObj(t) && typeof t.source === "string" && t.source.startsWith("data:")) as Record<string, unknown> | undefined : undefined;
  if (Array.isArray(json.textures) && json.textures.length > 1) warnings.push(`File has ${json.textures.length} textures — only the first is used.`);
  const animations = fromBbmodelAnimations(json.animations, boneByUuid);
  return {
    model: { textureWidth: texW, textureHeight: texH, texture: "", bones, cubes, animations },
    warnings,
    textureDataUrl: tex ? String(tex.source) : undefined,
    textureName: tex ? String(tex.name ?? "texture.png") : undefined,
    name: typeof json.name === "string" ? json.name : typeof json.model_identifier === "string" ? json.model_identifier : undefined,
  };
}

// ── Java (Mojang mappings, Minecraft 26.x / NeoForge) ─────────────────────────

const f = (n: number) => {
  const x = r(n);
  return `${Number.isInteger(x) ? x.toFixed(1) : String(x)}F`;
};
const deg2rad = (d: number) => (d * Math.PI) / 180;
const javaIdent = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");

/**
 * Java model class in the shape Blockbench's "Modded Entity" codec writes, for the target
 * Minecraft version's API (checked against each version's own mappings/sources):
 *  - 1.21.1: EntityModel<T extends Entity>, setupAnim(entity, 5 floats), renderToBuffer(…, int color), ResourceLocation
 *  - 26.x:   EntityModel<S extends EntityRenderState>, super(root), setupAnim(state), Identifier
 * Cubes with their own rotation get a generated child part (Java parts rotate, cubes can't).
 */
/** One Java ModelPart: pose relative to its parent part (Java model space), box-UV cubes. */
export interface JavaPart {
  name: string;
  parent: string | null;
  /** PartPose offset (px) and rotation (radians) */
  pose: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  cubes: { u: number; v: number; mirror: boolean; x: number; y: number; z: number; w: number; h: number; d: number; inflate: number }[];
}

/**
 * The model as Java ModelParts — Blockbench's "Modded Entity" conversion (flip X/Y, +24 for root
 * parts, rotated cubes in their own child part). Shared by the Java class exporter and the
 * runtime manifest neoforge-runtime builds its LayerDefinition from, so both are identical.
 */
export function javaParts(model: EntityModel): JavaPart[] {
  const { bones, cubeBone } = exportBones(model);
  const byId = new Map(bones.map((b) => [b.id, b]));
  const names = new Map(bones.map((b) => [b.id, javaIdent(b.name)]));
  const takenNames = [...names.values()];
  const parts: JavaPart[] = [];
  const cube = (c: ModelCube, pivot: Vec3) => {
    const s = cubeSize(c);
    return {
      u: Math.round(c.uvOffset[0]), v: Math.round(c.uvOffset[1]), mirror: c.mirror,
      x: r(pivot[0] - c.to[0]), y: r(-c.from[1] - s[1] + pivot[1]), z: r(c.from[2] - pivot[2]),
      w: r(s[0]), h: r(s[1]), d: r(s[2]), inflate: r(c.inflate),
    };
  };
  const pose = (origin: Vec3, rotation: Vec3, parentOrigin: Vec3 | null): JavaPart["pose"] => {
    const o: Vec3 = parentOrigin ? [origin[0] - parentOrigin[0], origin[1] - parentOrigin[1], origin[2] - parentOrigin[2]] : [...origin] as Vec3;
    return {
      x: r(-o[0]), y: r(-o[1] + (parentOrigin ? 0 : 24)), z: r(o[2]),
      rx: r(deg2rad(-rotation[0])), ry: r(deg2rad(-rotation[1])), rz: r(deg2rad(rotation[2])),
    };
  };
  for (const b of bones) {
    const name = names.get(b.id)!;
    const parent = b.parent ? byId.get(b.parent) : undefined;
    const own = model.cubes.filter((c) => cubeBone(c) === b.id);
    parts.push({
      name, parent: parent ? names.get(parent.id)! : null,
      pose: pose(b.origin, b.rotation, parent ? parent.origin : null),
      cubes: own.filter((c) => allZero(c.rotation)).map((c) => cube(c, b.origin)),
    });
    for (const c of own.filter((x) => !allZero(x.rotation))) {
      const sub = uniqueName(`${name}_r`, takenNames);
      takenNames.push(sub);
      parts.push({ name: sub, parent: name, pose: pose(c.origin, c.rotation, b.origin), cubes: [cube(c, c.origin)] });
    }
  }
  return parts;
}

export function toJavaModel(model: EntityModel, opts: { className: string; modId: string; layer: string; mcVersion: McVersion }): string {
  const parts = javaParts(model);
  const lines = parts.map((p) => {
    const cubes = p.cubes.map((c) => `\t.texOffs(${c.u}, ${c.v})${c.mirror ? ".mirror()" : ""}.addBox(${f(c.x)}, ${f(c.y)}, ${f(c.z)}, ${f(c.w)}, ${f(c.h)}, ${f(c.d)}, new CubeDeformation(${f(c.inflate)}))${c.mirror ? ".mirror(false)" : ""}`);
    const builder = ["CubeListBuilder.create()", ...cubes].join("\n\t\t\t");
    const { x, y, z, rx, ry, rz } = p.pose;
    const poseStr = rx === 0 && ry === 0 && rz === 0
      ? `PartPose.offset(${f(x)}, ${f(y)}, ${f(z)})`
      : `PartPose.offsetAndRotation(${f(x)}, ${f(y)}, ${f(z)}, ${f(rx)}, ${f(ry)}, ${f(rz)})`;
    return `PartDefinition ${p.name} = ${p.parent ?? "partdefinition"}.addOrReplaceChild("${p.name}", ${builder}, ${poseStr});`;
  });
  // Fields only for the model's own bones (generated rotated-cube parts stay internal).
  const { bones } = exportBones(model);
  const boneNames = new Set(bones.map((b) => javaIdent(b.name)));
  const named = parts.filter((p) => boneNames.has(p.name));
  const roots = named.filter((p) => !p.parent);
  const fields = named.map((p) => `\tprivate final ModelPart ${p.name};`).join("\n");
  // Parts are parent-first, so every child's getChild() runs after its parent is assigned.
  const assigns = named.map((p) => (p.parent ? `\t\tthis.${p.name} = this.${p.parent}.getChild("${p.name}");` : `\t\tthis.${p.name} = root.getChild("${p.name}");`));

  const body = `\tpublic static LayerDefinition createBodyLayer() {
\t\tMeshDefinition meshdefinition = new MeshDefinition();
\t\tPartDefinition partdefinition = meshdefinition.getRoot();

\t\t${lines.join("\n\n\t\t")}

\t\treturn LayerDefinition.create(meshdefinition, ${model.textureWidth}, ${model.textureHeight});
\t}`;
  const geomImports = `import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;`;

  if (opts.mcVersion === "1.21.1") {
    const renders = roots.map((p) => `\t\t${p.name}.render(poseStack, vertexConsumer, packedLight, packedOverlay, color);`).join("\n");
    return `// Made with MC Screen Designer — Minecraft 1.21.1 (Mojang mappings)
// Paste this class into your mod and add the imports below.

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
${geomImports}
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;

public class ${opts.className}<T extends Entity> extends EntityModel<T> {
\tpublic static final ModelLayerLocation LAYER_LOCATION = new ModelLayerLocation(ResourceLocation.fromNamespaceAndPath("${opts.modId}", "${opts.layer}"), "main");
${fields}

\tpublic ${opts.className}(ModelPart root) {
${assigns.join("\n")}
\t}

${body}

\t@Override
\tpublic void setupAnim(T entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
\t}

\t@Override
\tpublic void renderToBuffer(PoseStack poseStack, VertexConsumer vertexConsumer, int packedLight, int packedOverlay, int color) {
${renders}
\t}
}
`;
  }

  return `// Made with MC Screen Designer — Minecraft 26.x (Mojang mappings)
// Paste this class into your mod and add the imports below.

${geomImports}
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.resources.Identifier;

public class ${opts.className} extends EntityModel<LivingEntityRenderState> {
\tpublic static final ModelLayerLocation LAYER_LOCATION = new ModelLayerLocation(Identifier.fromNamespaceAndPath("${opts.modId}", "${opts.layer}"), "main");
${fields}

\tpublic ${opts.className}(ModelPart root) {
\t\tsuper(root);
${assigns.join("\n")}
\t}

${body}

\t@Override
\tpublic void setupAnim(LivingEntityRenderState state) {
\t\tsuper.setupAnim(state);
\t}
}
`;
}

/** Ensures every bone name is unique and identifier-safe (all export formats key parts by name). */
export function sanitizeBoneNames(model: EntityModel): EntityModel {
  const taken: string[] = [];
  const bones = model.bones.map((b) => {
    const name = uniqueName(b.name, taken);
    taken.push(name);
    return name === b.name ? b : { ...b, name };
  });
  return { ...model, bones };
}

export const faceKeys: readonly FaceKey[] = FACE_KEYS;
