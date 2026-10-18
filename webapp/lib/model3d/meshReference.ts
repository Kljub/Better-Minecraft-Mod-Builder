import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

/**
 * A plain 3D mesh (STL, OBJ, GLB/glTF, 3MF) as reference for the Entity Model Generator. The AI
 * can't read meshes, so the mesh is (1) voxelised into a few hundred boxes at most, given in the
 * mc-designer coordinates (pixels, ground at Y=0, mob faces north/-Z), and (2) rendered from the
 * front/back/sides/top — those renders go along as reference images.
 */
export const MESH_EXTENSIONS = ["stl", "obj", "glb", "gltf", "fbx", "3mf"] as const;
export type MeshExtension = (typeof MESH_EXTENSIONS)[number];

export interface MeshOrientation {
  /** which axis is "up" in the file — CAD/3D-print formats (STL, 3MF) are usually Z-up */
  up: "y" | "z";
  /** extra turn around the vertical axis, in quarter turns, until the front faces the camera */
  turns: number;
}

export interface MeshRender { view: "front" | "back" | "left" | "right" | "top"; dataUrl: string }

export interface MeshReference {
  name: string;
  summary: string;
  triangles: number;
  /** model size in pixels after scaling, [w, h, d] */
  size: [number, number, number];
  boxes: number;
  renders: MeshRender[];
}

/** Longest side of the scaled model in pixels — 32 px = 2 blocks, about zombie height. */
const TARGET_PX = 32;
const MAX_BOXES = 160;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export function meshExtension(fileName: string): MeshExtension | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return (MESH_EXTENSIONS as readonly string[]).includes(ext) ? (ext as MeshExtension) : null;
}

export function defaultOrientation(ext: MeshExtension): MeshOrientation {
  return { up: ext === "stl" || ext === "3mf" ? "z" : "y", turns: 0 };
}

/** Parses the file into a three.js object (loaders are loaded on demand). */
export async function loadMeshFile(file: File): Promise<THREE.Object3D> {
  return (await loadMeshAsset(file)).object;
}

/** The object plus its animation clips (GLB/glTF and FBX can carry a skeleton and animations). */
export async function loadMeshAsset(file: File): Promise<{ object: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const ext = meshExtension(file.name);
  if (!ext) throw new Error("Unsupported file — use STL, OBJ, GLB/glTF, FBX or 3MF.");
  if (file.size > MAX_FILE_BYTES) throw new Error("File is too large (max 100 MB).");
  try {
    switch (ext) {
      case "stl": {
        const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
        const geometry = new STLLoader().parse(await file.arrayBuffer());
        const colored = !!geometry.getAttribute("color");
        // The grey is only for the renders — it's not the model's colour (userData.placeholder).
        const material = new THREE.MeshStandardMaterial({ color: colored ? 0xffffff : 0xb0b0b0, vertexColors: colored });
        material.userData.placeholder = !colored;
        return { object: new THREE.Mesh(geometry, material), animations: [] };
      }
      case "obj": {
        const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
        return { object: new OBJLoader().parse(await file.text()), animations: [] };
      }
      case "glb":
      case "gltf": {
        const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
        const data = ext === "glb" ? await file.arrayBuffer() : await file.text();
        const gltf = await new GLTFLoader().parseAsync(data, "");
        return { object: gltf.scene, animations: gltf.animations };
      }
      case "fbx": {
        const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
        const object = new FBXLoader().parse(await file.arrayBuffer(), "");
        return { object, animations: object.animations ?? [] };
      }
      case "3mf": {
        const { ThreeMFLoader } = await import("three/addons/loaders/3MFLoader.js");
        return { object: new ThreeMFLoader().parse(await file.arrayBuffer()), animations: [] };
      }
    }
  } catch (e) {
    throw new Error(`Couldn't read the ${ext.toUpperCase()} file${e instanceof Error && e.message ? `: ${e.message}` : "."}`);
  }
}

export interface Tri { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; color: THREE.Color | null }

/**
 * Puts the object into editor space: up axis fixed, front (glTF convention +Z, or after the user's
 * turns) facing north (-Z), scaled so the longest side is TARGET_PX, standing on Y=0 centred on X/Z.
 */
export function placed(
  source: THREE.Object3D, o: MeshOrientation,
  /** "longest": longest side = px; "height": height = px */
  fit: { mode: "longest" | "height"; px: number } = { mode: "longest", px: TARGET_PX },
): { root: THREE.Group; scale: number; original: THREE.Vector3; model: THREE.Object3D } {
  const inner = new THREE.Group();
  // SkeletonUtils.clone keeps skinned meshes bound to the cloned bones.
  const model = cloneSkinned(source);
  inner.add(model);
  if (o.up === "z") inner.rotation.x = -Math.PI / 2;
  // +Z front → -Z: half a turn, plus the user's quarter turns.
  const turn = new THREE.Group();
  turn.add(inner);
  turn.rotation.y = Math.PI + (((o.turns % 4) + 4) % 4) * (Math.PI / 2);
  turn.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turn, true);
  if (box.isEmpty()) throw new Error("The file contains no geometry.");
  const original = box.getSize(new THREE.Vector3());
  const scale = fit.px / Math.max(fit.mode === "height" ? original.y : Math.max(original.x, original.y, original.z), 1e-6);
  const center = box.getCenter(new THREE.Vector3());
  const root = new THREE.Group();
  root.add(turn);
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  root.updateMatrixWorld(true);
  return { root, scale, original, model };
}

function triangles(root: THREE.Object3D): Tri[] {
  const out: Tri[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position");
    if (!pos) return;
    const col = mesh.geometry.getAttribute("color");
    const index = mesh.geometry.getIndex();
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
    // A textured material's own colour is usually just white — no colour beats a wrong one.
    const matColor = mat?.color && !mat.map && !mat.userData?.placeholder ? mat.color : null;
    const count = index ? index.count : pos.count;
    // getVertexPosition applies skinning and morphs, so rigged meshes come out in their rest pose.
    const v = (i: number) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    for (let t = 0; t + 2 < count; t += 3) {
      const [i0, i1, i2] = index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2];
      let color: THREE.Color | null = matColor;
      if (col) {
        color = new THREE.Color(
          (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3,
          (col.getY(i0) + col.getY(i1) + col.getY(i2)) / 3,
          (col.getZ(i0) + col.getZ(i1) + col.getZ(i2)) / 3,
        );
        if (matColor) color.multiply(matColor);
      }
      out.push({ a: v(i0), b: v(i1), c: v(i2), color });
    }
  });
  return out;
}

export interface MeshBox { from: [number, number, number]; size: [number, number, number]; color?: string }

/** Surface voxels by sampling every triangle, interior filled (everything the outside can't reach), then greedy-merged into boxes. */
export function voxelBoxes(tris: Tri[], res: number): MeshBox[] {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const t of tris) for (const p of [t.a, t.b, t.c]) { min.min(p); max.max(p); }
  const nx = Math.max(1, Math.ceil((max.x - min.x) / res - 1e-6));
  const ny = Math.max(1, Math.ceil((max.y - min.y) / res - 1e-6));
  const nz = Math.max(1, Math.ceil((max.z - min.z) / res - 1e-6));
  const idx = (x: number, y: number, z: number) => (y * nz + z) * nx + x;
  const n = nx * ny * nz;
  const surface = new Uint8Array(n);
  const rgb = new Float32Array(n * 3);
  const weight = new Float32Array(n);
  const cell = (v: number, lo: number, cells: number) => Math.min(cells - 1, Math.max(0, Math.floor((v - lo) / res)));
  const p = new THREE.Vector3();
  for (const t of tris) {
    const longest = Math.max(t.a.distanceTo(t.b), t.b.distanceTo(t.c), t.c.distanceTo(t.a));
    const steps = Math.min(64, Math.max(1, Math.ceil((longest / res) * 2)));
    const ab = t.b.clone().sub(t.a), ac = t.c.clone().sub(t.a);
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; i + j <= steps; j++) {
        p.copy(t.a).addScaledVector(ab, i / steps).addScaledVector(ac, j / steps);
        const k = idx(cell(p.x, min.x, nx), cell(p.y, min.y, ny), cell(p.z, min.z, nz));
        surface[k] = 1;
        if (t.color) { rgb[k * 3] += t.color.r; rgb[k * 3 + 1] += t.color.g; rgb[k * 3 + 2] += t.color.b; weight[k]++; }
      }
    }
  }
  // Flood the outside from every border cell; whatever stays unreached is solid.
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  const visit = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return;
    const k = idx(x, y, z);
    if (surface[k] || outside[k]) return;
    outside[k] = 1;
    stack.push(k);
  };
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) { visit(0, y, z); visit(nx - 1, y, z); }
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) { visit(x, 0, z); visit(x, ny - 1, z); }
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) { visit(x, y, 0); visit(x, y, nz - 1); }
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % nx, z = Math.floor(k / nx) % nz, y = Math.floor(k / (nx * nz));
    visit(x + 1, y, z); visit(x - 1, y, z); visit(x, y + 1, z); visit(x, y - 1, z); visit(x, y, z + 1); visit(x, y, z - 1);
  }
  const used = new Uint8Array(n);
  const free = (x: number, y: number, z: number) => { const k = idx(x, y, z); return !outside[k] && !used[k]; };
  const boxes: MeshBox[] = [];
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    if (!free(x, y, z)) continue;
    let w = 1; while (x + w < nx && free(x + w, y, z)) w++;
    let d = 1; while (z + d < nz && [...Array(w).keys()].every((i) => free(x + i, y, z + d))) d++;
    let h = 1;
    while (y + h < ny && [...Array(w * d).keys()].every((i) => free(x + (i % w), y + h, z + Math.floor(i / w)))) h++;
    let r = 0, g = 0, b = 0, wt = 0;
    for (let yy = y; yy < y + h; yy++) for (let zz = z; zz < z + d; zz++) for (let xx = x; xx < x + w; xx++) {
      const k = idx(xx, yy, zz);
      used[k] = 1;
      r += rgb[k * 3]; g += rgb[k * 3 + 1]; b += rgb[k * 3 + 2]; wt += weight[k];
    }
    const round = (v: number) => Math.round(v * 100) / 100;
    boxes.push({
      from: [round(min.x + x * res), round(min.y + y * res), round(min.z + z * res)],
      size: [w * res, h * res, d * res],
      ...(wt ? { color: `#${new THREE.Color(r / wt, g / wt, b / wt).getHexString()}` } : {}),
    });
  }
  return boxes;
}

const VIEWS: { view: MeshRender["view"]; dir: [number, number, number]; up?: [number, number, number] }[] = [
  // The mob faces north (-Z): its front is seen from -Z, its right side (east) from +X.
  { view: "front", dir: [0, 0, -1] },
  { view: "back", dir: [0, 0, 1] },
  { view: "right", dir: [1, 0, 0] },
  { view: "left", dir: [-1, 0, 0] },
  { view: "top", dir: [0, 1, 0], up: [0, 0, -1] },
];

/** Orthographic renders of the placed model (original materials and textures, plain grey for untextured STL). */
/** Render background — opaque and light, so the AI sees clean silhouettes (transparency often arrives as black). */
export const RENDER_BACKGROUND = 0xe8eaee;

export function renderViews(root: THREE.Object3D, size = 512): MeshRender[] {
  const canvas = document.createElement("canvas");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return []; // no WebGL — the voxel boxes still go along
  }
  try {
    renderer.setSize(size, size, false);
    renderer.setClearColor(RENDER_BACKGROUND, 1);
    const scene = new THREE.Scene();
    scene.add(root);
    // Strong key light + weaker fill: readable depth/shape on grey, untextured meshes.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    scene.add(sun);
    const box = new THREE.Box3().setFromObject(root, true);
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
    const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, radius * 8);
    return VIEWS.map(({ view, dir, up }) => {
      const d = new THREE.Vector3(...dir);
      cam.position.copy(center).addScaledVector(d, radius * 3);
      cam.up.set(...(up ?? [0, 1, 0]));
      cam.lookAt(center);
      cam.updateProjectionMatrix();
      sun.position.copy(cam.position).add(new THREE.Vector3(radius, radius * 2, 0));
      renderer.render(scene, cam);
      return { view, dataUrl: canvas.toDataURL("image/png") };
    });
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** Voxel summary + renders of an already loaded mesh in the given orientation. */
export function buildMeshReference(
  object: THREE.Object3D, fileName: string, orientation: MeshOrientation, render = true,
  fit?: { mode: "longest" | "height"; px: number },
): MeshReference {
  const { root, scale, original } = placed(object, orientation, fit);
  const tris = triangles(root);
  if (!tris.length) throw new Error("The file contains no triangles.");
  const sized = new THREE.Box3().setFromObject(root, true).getSize(new THREE.Vector3());
  const size: [number, number, number] = [sized.x, sized.y, sized.z].map((v) => Math.round(v * 100) / 100) as [number, number, number];
  let res = 1;
  let boxes = voxelBoxes(tris, res);
  while (boxes.length > MAX_BOXES && res < 8) boxes = voxelBoxes(tris, ++res);
  const summary = JSON.stringify({
    source: fileName,
    triangles: tris.length,
    original_size: [original.x, original.y, original.z].map((v) => +v.toPrecision(4)),
    scaled_to_px: size,
    scale: +scale.toPrecision(4),
    voxel_px: res,
    note: "Voxel approximation in editor pixels (ground Y=0, faces north/-Z). Colours only where the mesh has material/vertex colours.",
    boxes,
  });
  return {
    name: fileName.replace(/\.[^.]+$/, ""),
    summary,
    triangles: tris.length,
    size,
    boxes: boxes.length,
    renders: render ? renderViews(root) : [],
  };
}

/** The voxel boxes of a reference, e.g. to build an entity model from them directly. */
export function meshBoxes(ref: MeshReference): MeshBox[] {
  return (JSON.parse(ref.summary) as { boxes: MeshBox[] }).boxes;
}

/** Element id from a file name: lowercase registry path. */
export function meshModelId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "mesh_mob";
}

/** STL references are simplified above this many polygons (quads count once). */
export const STL_MAX_POLYGONS = 15000;

export interface QuadTopology { triangles: number; quads: number; leftover: number; polygons: number }

/**
 * STL only stores triangles, so quads are recovered: two triangles that share an edge and lie in
 * one plane form a quad. Exporters write a quad's two triangles one after the other, so those
 * pairs are tried first, then any remaining neighbours. `leftover` = triangles that pair with none.
 */
export function quadTopology(object: THREE.Object3D): QuadTopology {
  object.updateMatrixWorld(true);
  const tris: THREE.Vector3[][] = [];
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const pos = mesh.isMesh ? mesh.geometry?.getAttribute("position") : null;
    if (!pos) return;
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : pos.count;
    for (let t = 0; t + 2 < count; t += 3) {
      tris.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(t + k) : t + k).applyMatrix4(mesh.matrixWorld)));
    }
  });
  const scale = new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3()).length() || 1;
  const key = (v: THREE.Vector3) => [v.x, v.y, v.z].map((c) => Math.round((c / scale) * 1e5)).join(",");
  const keys = tris.map((t) => t.map(key));
  const normals = tris.map(([a, b, c]) => new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize());
  const edge = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const byEdge = new Map<string, number[]>();
  keys.forEach((k, i) => [[0, 1], [1, 2], [2, 0]].forEach(([x, y]) => {
    const e = edge(k[x], k[y]);
    byEdge.set(e, [...(byEdge.get(e) ?? []), i]);
  }));
  const pairs = (i: number, j: number) => {
    if (normals[i].dot(normals[j]) < 0.999) return false;
    const shared = keys[i].filter((k) => keys[j].includes(k)).length;
    return shared === 2;
  };
  const used = new Uint8Array(tris.length);
  let quads = 0;
  for (let i = 0; i + 1 < tris.length; i += 2) {
    if (pairs(i, i + 1)) { used[i] = used[i + 1] = 1; quads++; }
  }
  for (let i = 0; i < tris.length; i++) {
    if (used[i]) continue;
    for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) {
      const j = (byEdge.get(edge(keys[i][x], keys[i][y])) ?? []).find((n) => n !== i && !used[n] && pairs(i, n));
      if (j !== undefined) { used[i] = used[j] = 1; quads++; break; }
    }
  }
  const leftover = tris.length - quads * 2;
  return { triangles: tris.length, quads, leftover, polygons: quads + leftover };
}

/**
 * Vertex clustering: snaps every vertex to a grid of `cell` units and drops triangles that
 * collapse. Crude, but fast on any size, and the reference is voxelised to ~1 px anyway.
 */
function clustered(tris: THREE.Vector3[][], cell: number): THREE.Vector3[][] {
  const snap = (v: THREE.Vector3) => new THREE.Vector3(Math.round(v.x / cell) * cell, Math.round(v.y / cell) * cell, Math.round(v.z / cell) * cell);
  return tris.flatMap((t) => {
    const [a, b, c] = t.map(snap);
    return a.equals(b) || b.equals(c) || c.equals(a) ? [] : [[a, b, c]];
  });
}

function worldTriangles(object: THREE.Object3D): THREE.Vector3[][] {
  object.updateMatrixWorld(true);
  const out: THREE.Vector3[][] = [];
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const pos = mesh.isMesh ? mesh.geometry?.getAttribute("position") : null;
    if (!pos) return;
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : pos.count;
    for (let t = 0; t + 2 < count; t += 3) {
      out.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(t + k) : t + k).applyMatrix4(mesh.matrixWorld)));
    }
  });
  return out;
}

function meshOf(tris: THREE.Vector3[][], material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(tris.flatMap((t) => t.flatMap((v) => [v.x, v.y, v.z])), 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export interface PreparedStl { object: THREE.Object3D; topology: QuadTopology; note: string }

/**
 * Makes any STL usable instead of rejecting it: triangles are paired into quads where they can be
 * (like Blender's Tris to Quads, the rest stays triangles), and a mesh over STL_MAX_POLYGONS is
 * simplified until it fits.
 */
export function prepareStl(object: THREE.Object3D): PreparedStl {
  let topology = quadTopology(object);
  const converted = topology.leftover < topology.triangles ? `${topology.quads.toLocaleString("en")} quads + ${topology.leftover.toLocaleString("en")} triangles` : `${topology.triangles.toLocaleString("en")} triangles`;
  if (topology.polygons <= STL_MAX_POLYGONS) {
    return { object, topology, note: topology.leftover ? `converted to ${converted}` : "all quads" };
  }
  const tris = worldTriangles(object);
  const diag = new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3()).length() || 1;
  const first = (object as THREE.Mesh).isMesh ? (object as THREE.Mesh).material : null;
  const material = (Array.isArray(first) ? first[0] : first) ?? new THREE.MeshStandardMaterial({ color: 0xb0b0b0 });
  let result = object;
  for (let cell = diag / 1000; cell < diag; cell *= 1.3) {
    result = meshOf(clustered(tris, cell), material);
    topology = quadTopology(result);
    if (topology.polygons <= STL_MAX_POLYGONS) break;
  }
  return { object: result, topology, note: `simplified from ${tris.length.toLocaleString("en")} triangles to ${topology.polygons.toLocaleString("en")} polygons (${topology.quads.toLocaleString("en")} quads)` };
}
