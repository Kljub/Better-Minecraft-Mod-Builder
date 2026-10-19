"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { EntityModel, Vec3 } from "@/lib/model3d/types";
import type { BonePose } from "@/lib/model3d/animation";
import { cubeSize, effectiveFaceUvs, faceVertexUvs } from "@/lib/model3d/geometry";

export type Selection = { type: "cube" | "bone"; id: string } | null;
export type GizmoMode = "translate" | "rotate" | "scale";
export type ViewPreset = "perspective" | "front" | "back" | "left" | "right" | "top";

/** Result of a finished gizmo drag, in model units (relative to the start of the drag). */
export type TransformResult =
  | { kind: "translate"; delta: Vec3 }
  | { kind: "rotate"; rotation: Vec3 }
  | { kind: "scale"; scale: Vec3 }
  /** one face of a cube moved outward by `delta` px (negative = inward) along its own `axis` */
  | { kind: "resize"; axis: 0 | 1 | 2; side: 1 | -1; delta: number };

/** How long a resize handle stays on a pixel step after snapping to it (the "lock"). */
const RESIZE_LOCK_MS = 90;
const AXIS_COLORS = [0xe0443e, 0x5fbf3f, 0x3f7fe0];

export interface ModelViewportHandle {
  /** PNG data URL of the current view (rendered on demand, so no preserveDrawingBuffer cost). */
  screenshot: () => string;
  setView: (preset: ViewPreset) => void;
  /** Animation pose offsets per bone id on top of the rest pose; null = rest pose. */
  applyPose: (pose: Map<string, BonePose> | null) => void;
}

const DEG = Math.PI / 180;
// three.js BoxGeometry face order (+x, -x, +y, -y, +z, -z) = Blockbench/Minecraft east, west, up, down, south, north.
const BOX_FACE_ORDER = ["east", "west", "up", "down", "south", "north"] as const;

/** A pixel checkerboard at the model's texture size, so untextured models still show their UV layout. */
function checkerTexture(w: number, h: number): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.min(w, 512));
  canvas.height = Math.max(1, Math.min(h, 512));
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#8d8d8d" : "#a6a6a6";
    ctx.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function setEuler(obj: THREE.Object3D, rot: Vec3) {
  // Minecraft/Blockbench apply Z, then Y, then X.
  obj.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, "ZYX");
}

interface Built {
  root: THREE.Group;
  bones: Map<string, THREE.Group>;
  cubePivots: Map<string, THREE.Group>;
  meshes: THREE.Mesh[];
}

function buildModel(model: EntityModel, material: THREE.Material, hidden: THREE.Material): Built {
  const root = new THREE.Group();
  const bones = new Map<string, THREE.Group>();
  const cubePivots = new Map<string, THREE.Group>();
  const meshes: THREE.Mesh[] = [];
  const byId = new Map(model.bones.map((b) => [b.id, b]));

  // Parents before children so every bone's parent group already exists.
  const pending = [...model.bones];
  let guard = pending.length * pending.length + 1;
  while (pending.length && guard-- > 0) {
    const b = pending.shift()!;
    const parent = b.parent ? byId.get(b.parent) : undefined;
    if (parent && !bones.has(parent.id)) { pending.push(b); continue; }
    const g = new THREE.Group();
    const po: Vec3 = parent ? parent.origin : [0, 0, 0];
    g.position.set(b.origin[0] - po[0], b.origin[1] - po[1], b.origin[2] - po[2]);
    setEuler(g, b.rotation);
    g.userData = { boneId: b.id, restPos: g.position.clone(), restRot: [...b.rotation] };
    (parent ? bones.get(parent.id)! : root).add(g);
    bones.set(b.id, g);
  }

  for (const c of model.cubes) {
    const bone = c.bone ? byId.get(c.bone) : undefined;
    const parentGroup = bone ? bones.get(bone.id) ?? root : root;
    const bo: Vec3 = bone ? bone.origin : [0, 0, 0];
    const pivot = new THREE.Group();
    pivot.position.set(c.origin[0] - bo[0], c.origin[1] - bo[1], c.origin[2] - bo[2]);
    setEuler(pivot, c.rotation);
    pivot.userData = { cubeId: c.id };

    const size = cubeSize(c);
    const geo = new THREE.BoxGeometry(
      Math.abs(size[0]) + c.inflate * 2, Math.abs(size[1]) + c.inflate * 2, Math.abs(size[2]) + c.inflate * 2,
    );
    const uvs = effectiveFaceUvs(c);
    const uvAttr = geo.getAttribute("uv") as THREE.BufferAttribute;
    BOX_FACE_ORDER.forEach((face, fi) => {
      const vs = faceVertexUvs(uvs[face], c.boxUv ? 0 : c.faces[face].rotation, model.textureWidth, model.textureHeight, c.boxUv);
      vs.forEach((uv, vi) => uvAttr.setXY(fi * 4 + vi, uv[0], uv[1]));
      geo.groups[fi].materialIndex = c.boxUv || c.faces[face].enabled ? 0 : 1;
    });
    uvAttr.needsUpdate = true;

    const mesh = new THREE.Mesh(geo, [material, hidden]);
    const center: Vec3 = [(c.from[0] + c.to[0]) / 2, (c.from[1] + c.to[1]) / 2, (c.from[2] + c.to[2]) / 2];
    mesh.position.set(center[0] - c.origin[0], center[1] - c.origin[1], center[2] - c.origin[2]);
    mesh.userData = { cubeId: c.id };
    pivot.add(mesh);
    parentGroup.add(pivot);
    cubePivots.set(c.id, pivot);
    meshes.push(mesh);
  }
  return { root, bones, cubePivots, meshes };
}

/** Six face handles (in the cube pivot, so they follow the cube's rotation); faces of a flat axis get none. */
function makeHandles(mesh: THREE.Mesh): THREE.Mesh[] {
  const geo = mesh.geometry as THREE.BoxGeometry;
  const dims = [geo.parameters.width, geo.parameters.height, geo.parameters.depth];
  const handles: THREE.Mesh[] = [];
  for (const axis of [0, 1, 2] as const) {
    if (dims[axis] <= 0) continue;
    for (const side of [1, -1] as const) {
      const h = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.4, 1.4),
        new THREE.MeshBasicMaterial({ color: AXIS_COLORS[axis], depthTest: false, transparent: true, opacity: 0.95 }),
      );
      h.renderOrder = 4;
      h.userData = { axis, side, mesh, resizeHandle: true };
      mesh.parent!.add(h);
      handles.push(h);
    }
  }
  placeHandles(handles, mesh);
  return handles;
}

/** Puts each handle just outside the centre of its face. */
function placeHandles(handles: THREE.Mesh[], mesh: THREE.Mesh) {
  const geo = mesh.geometry as THREE.BoxGeometry;
  const dims = [geo.parameters.width * mesh.scale.x, geo.parameters.height * mesh.scale.y, geo.parameters.depth * mesh.scale.z];
  for (const h of handles) {
    const { axis, side } = h.userData as { axis: 0 | 1 | 2; side: 1 | -1 };
    h.position.copy(mesh.position);
    h.position.setComponent(axis, mesh.position.getComponent(axis) + side * (dims[axis] / 2 + 1.2));
  }
}

function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

/** Rest pose + animation offsets (rotation added per axis, position added, scale multiplied — like Blockbench). */
function poseBones(built: Built, pose: Map<string, BonePose> | null) {
  for (const [id, g] of built.bones) {
    const p = pose?.get(id);
    const restPos = g.userData.restPos as THREE.Vector3;
    const restRot = g.userData.restRot as Vec3;
    g.position.copy(restPos);
    if (p) g.position.add(new THREE.Vector3(p.position[0], p.position[1], p.position[2]));
    setEuler(g, p ? [restRot[0] + p.rotation[0], restRot[1] + p.rotation[1], restRot[2] + p.rotation[2]] : restRot);
    g.scale.set(p ? p.scale[0] || 1e-5 : 1, p ? p.scale[1] || 1e-5 : 1, p ? p.scale[2] || 1e-5 : 1);
  }
}

/** Steve-sized boxes (vanilla player skeleton, +X = his right) drawn see-through, for fitting armor. */
function playerMannequin(): THREE.Group {
  const group = new THREE.Group();
  group.name = "reference";
  const mat = new THREE.MeshBasicMaterial({ color: 0x9aa7b8, transparent: true, opacity: 0.18, depthWrite: false });
  const edge = new THREE.LineBasicMaterial({ color: 0x9aa7b8, transparent: true, opacity: 0.45 });
  const box = (from: Vec3, to: Vec3) => {
    const geo = new THREE.BoxGeometry(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
    mesh.renderOrder = -1;
    mesh.raycast = () => {};
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge);
    lines.raycast = () => {};
    mesh.add(lines);
    group.add(mesh);
  };
  box([-4, 24, -4], [4, 32, 4]);
  box([-4, 12, -2], [4, 24, 2]);
  box([4, 12, -2], [8, 24, 2]);
  box([-8, 12, -2], [-4, 24, 2]);
  box([-0.1, 0, -2], [3.9, 12, 2]);
  box([-3.9, 0, -2], [0.1, 12, 2]);
  return group;
}

const ModelViewport = forwardRef<ModelViewportHandle, {
  model: EntityModel;
  textureUrl?: string;
  selection: Selection;
  mode: GizmoMode;
  /** translate/scale snap in model pixels; rotation snaps to `rotationSnap` degrees */
  snap: number;
  rotationSnap: number;
  onSelect: (sel: Selection) => void;
  onTransformEnd: (sel: NonNullable<Selection>, result: TransformResult) => void;
  /** right-click without dragging (right-drag still pans the camera) */
  onContextMenu?: (sel: Selection, clientX: number, clientY: number) => void;
  /** Skin painting: left-drag on the model paints at the hit texture pixel (orbit with right/middle drag). */
  onPaint?: (pixel: [number, number], phase: "start" | "move" | "end") => void;
  /** live texture source (Skin tab) — takes precedence over textureUrl */
  textureCanvas?: HTMLCanvasElement | null;
  /** bump after drawing on textureCanvas to upload it to the GPU */
  textureVersion?: number;
  /** "player": a see-through player body to model armor around (not pickable) */
  reference?: "player";
  /** mode "scale" on a cube: one handle per face that moves only that face (instead of the
   * symmetric scale gizmo) — the Design tab */
  resizeHandles?: boolean;
  /** a second click on the same cube/bone right after the first */
  onDoubleSelect?: (sel: NonNullable<Selection>) => void;
}>(function ModelViewport({ model, textureUrl, selection, mode, snap, rotationSnap, onSelect, onTransformEnd, onContextMenu, onPaint, textureCanvas, textureVersion, reference, resizeHandles, onDoubleSelect }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [gpu, setGpu] = useState<{ name: string; software: boolean } | null>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
    orbit: OrbitControls; gizmo: TransformControls; material: THREE.MeshLambertMaterial; hidden: THREE.Material;
    built: Built | null; outline: THREE.LineSegments | null; requestRender: () => void;
    /** resize handles of the selected cube (children of its pivot), see `resizeHandles` */
    handles: THREE.Mesh[];
  } | null>(null);
  // Latest callbacks/props for the long-lived three.js event handlers.
  const live = useRef({ onSelect, onTransformEnd, onContextMenu, onPaint, onDoubleSelect, selection, model, snap });
  useEffect(() => { live.current = { onSelect, onTransformEnd, onContextMenu, onPaint, onDoubleSelect, selection, model, snap }; });
  const poseRef = useRef<Map<string, BonePose> | null>(null);

  // ── one-time setup ──
  useEffect(() => {
    const host = hostRef.current!;
    // "high-performance" asks the browser for the discrete GPU on dual-GPU machines.
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x252525);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    setGpu({ name: gpuName, software: /llvmpipe|swiftshader|software|softpipe|basic render/i.test(gpuName) });

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(20, 40, 30);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-30, 10, -20);
    scene.add(fill);

    // 1 block = 16 px grid on the ground, plus the origin axes.
    const grid = new THREE.GridHelper(48, 3, 0x5a5a5a, 0x5a5a5a);
    scene.add(grid);
    const fine = new THREE.GridHelper(48, 48, 0x333333, 0x333333);
    fine.position.y = -0.01;
    scene.add(fine);
    const axes = new THREE.AxesHelper(4);
    (axes.material as THREE.Material).depthTest = false;
    axes.renderOrder = 2;
    scene.add(axes);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
    camera.position.set(-36, 34, -52);

    let frame = 0;
    const requestRender = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; renderer.render(scene, camera); });
    };

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 10, 0);
    orbit.enableDamping = false;
    orbit.addEventListener("change", requestRender);
    orbit.update();

    const gizmo = new TransformControls(camera, renderer.domElement);
    gizmo.setSize(0.8);
    gizmo.setSpace("local");
    gizmo.addEventListener("change", requestRender);
    gizmo.addEventListener("dragging-changed", (e) => { orbit.enabled = !(e as unknown as { value: boolean }).value; });
    scene.add(gizmo.getHelper());

    // Drag start/end bookkeeping → one onTransformEnd per finished drag.
    let start: { pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3 } | null = null;
    gizmo.addEventListener("mouseDown", () => {
      const o = gizmo.object;
      if (o) start = { pos: o.position.clone(), rot: o.rotation.clone(), scale: o.scale.clone() };
    });
    gizmo.addEventListener("mouseUp", () => {
      const o = gizmo.object;
      const sel = live.current.selection;
      if (!o || !start || !sel) return;
      const m = gizmo.getMode();
      if (m === "translate") {
        const d = o.position.clone().sub(start.pos);
        if (d.lengthSq() > 1e-9) live.current.onTransformEnd(sel, { kind: "translate", delta: [d.x, d.y, d.z] });
      } else if (m === "rotate") {
        const e = new THREE.Euler().setFromQuaternion(o.quaternion, "ZYX");
        live.current.onTransformEnd(sel, { kind: "rotate", rotation: [e.x / DEG, e.y / DEG, e.z / DEG] });
      } else {
        live.current.onTransformEnd(sel, { kind: "scale", scale: [o.scale.x, o.scale.y, o.scale.z] });
      }
      start = null;
    });

    const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, alphaTest: 0.05, transparent: false });
    const hidden = new THREE.MeshBasicMaterial({ visible: false });

    // Click (not drag) picks a cube; empty space clears the selection. Right-click without
    // dragging opens the context menu (right-drag keeps panning the camera).
    const raycaster = new THREE.Raycaster();
    let downAt: [number, number, number] | null = null;
    const pick = (e: MouseEvent): Selection => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const built = three.current?.built;
      const hit = built ? raycaster.intersectObjects(built.meshes, false).find((h) => (h.face?.materialIndex ?? 0) === 0) : undefined;
      return hit ? { type: "cube", id: hit.object.userData.cubeId } : null;
    };
    // Skin painting: ray → hit UV → texture pixel.
    let painting = false;
    const pixelAt = (e: PointerEvent): [number, number] | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const built = three.current?.built;
      const hit = built ? raycaster.intersectObjects(built.meshes, false).find((h) => (h.face?.materialIndex ?? 0) === 0 && h.uv) : undefined;
      if (!hit?.uv) return null;
      const m = live.current.model;
      return [Math.min(m.textureWidth - 1, Math.max(0, Math.floor(hit.uv.x * m.textureWidth))), Math.min(m.textureHeight - 1, Math.max(0, Math.floor((1 - hit.uv.y) * m.textureHeight)))];
    };
    // Resize: drag a face handle along its axis; the size snaps to `snap` px and holds each step
    // for RESIZE_LOCK_MS. Only that face moves — the opposite one stays where it is.
    let resizing: {
      handle: THREE.Mesh; mesh: THREE.Mesh; axis: 0 | 1 | 2; side: 1 | -1; origin: THREE.Vector3; dir: THREE.Vector3;
      s0: number; scale: number; dim: number; base: number; pos0: number; shown: number; lockUntil: number;
    } | null = null;
    const rayAt = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      return raycaster.ray;
    };
    /** position along the handle's axis line closest to the pointer ray (world units) */
    const along = (origin: THREE.Vector3, dir: THREE.Vector3, e: PointerEvent) => {
      const ray = rayAt(e);
      const w0 = origin.clone().sub(ray.origin);
      const b = dir.dot(ray.direction), denom = 1 - b * b;
      if (denom < 1e-6) return null;
      return (b * ray.direction.dot(w0) - dir.dot(w0)) / denom;
    };
    const handleAt = (e: PointerEvent) => {
      const handles = three.current?.handles ?? [];
      return handles.length ? (rayAt(e) && raycaster.intersectObjects(handles, false)[0]?.object as THREE.Mesh | undefined) : undefined;
    };
    const onMove = (e: PointerEvent) => {
      if (resizing) {
        const r = resizing;
        const s1 = along(r.origin, r.dir, e);
        if (s1 === null) return;
        const step = live.current.snap > 0 ? live.current.snap : 0.25;
        const minSize = Math.min(step, r.base);
        const snapped = Math.max(minSize - r.base, Math.round((s1 - r.s0) / r.scale / step) * step);
        const now = performance.now();
        if (snapped === r.shown || now < r.lockUntil) return;
        r.shown = snapped;
        r.lockUntil = now + RESIZE_LOCK_MS;
        const axisKey = (["x", "y", "z"] as const)[r.axis];
        r.mesh.scale[axisKey] = (r.dim + snapped) / r.dim;
        r.mesh.position[axisKey] = r.pos0 + r.side * snapped / 2;
        placeHandles(three.current?.handles ?? [], r.mesh);
        requestRender();
        return;
      }
      if (painting) {
        const px = pixelAt(e);
        if (px) live.current.onPaint?.(px, "move");
        return;
      }
      if (e.buttons === 0) {
        const over = handleAt(e);
        renderer.domElement.style.cursor = over ? "grab" : "";
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) {
        const handle = handleAt(e);
        if (handle) {
          const mesh = handle.userData.mesh as THREE.Mesh;
          const { axis, side } = handle.userData as { axis: 0 | 1 | 2; side: 1 | -1 };
          const geo = mesh.geometry as THREE.BoxGeometry;
          const dim = [geo.parameters.width, geo.parameters.height, geo.parameters.depth][axis];
          const origin = handle.getWorldPosition(new THREE.Vector3());
          const q = mesh.getWorldQuaternion(new THREE.Quaternion());
          const dir = new THREE.Vector3(axis === 0 ? side : 0, axis === 1 ? side : 0, axis === 2 ? side : 0).applyQuaternion(q).normalize();
          const s0 = along(origin, dir, e);
          if (s0 !== null) {
            const c = live.current.model.cubes.find((x) => x.id === mesh.userData.cubeId);
            resizing = {
              handle, mesh, axis, side, origin, dir, s0, dim,
              scale: mesh.parent!.getWorldScale(new THREE.Vector3()).x || 1,
              base: c ? Math.abs(cubeSize(c)[axis]) : dim,
              pos0: mesh.position.getComponent(axis), shown: 0, lockUntil: 0,
            };
            orbit.enabled = false;
            renderer.domElement.style.cursor = "grabbing";
            renderer.domElement.setPointerCapture(e.pointerId);
            downAt = null;
            return;
          }
        }
      }
      downAt = [e.clientX, e.clientY, e.button];
      if (live.current.onPaint && e.button === 0) {
        const px = pixelAt(e);
        if (px) {
          painting = true;
          orbit.enabled = false;
          renderer.domElement.setPointerCapture(e.pointerId);
          live.current.onPaint(px, "start");
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      if (resizing) {
        const r = resizing;
        resizing = null;
        orbit.enabled = true;
        renderer.domElement.style.cursor = "";
        const sel = live.current.selection;
        if (r.shown !== 0 && sel) live.current.onTransformEnd(sel, { kind: "resize", axis: r.axis, side: r.side, delta: r.shown });
        return;
      }
      if (painting) {
        painting = false;
        orbit.enabled = true;
        downAt = null;
        live.current.onPaint?.([0, 0], "end");
        return;
      }
      if (!downAt || gizmo.dragging) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      const button = downAt[2];
      downAt = null;
      if (moved > 4 || button !== e.button) return;
      if (e.button === 0) live.current.onSelect(pick(e));
      else if (e.button === 2 && live.current.onContextMenu) {
        const sel = pick(e);
        if (sel) live.current.onSelect(sel);
        live.current.onContextMenu(sel ?? live.current.selection, e.clientX, e.clientY);
      }
    };
    // Double-click (the system's double-click timing) on a part: after the click that selected it.
    const onDouble = (e: MouseEvent) => {
      if (live.current.onPaint || gizmo.dragging) return;
      const sel = pick(e);
      if (sel) live.current.onDoubleSelect?.(sel);
    };
    const noMenu = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("contextmenu", noMenu);
    renderer.domElement.addEventListener("dblclick", onDouble);

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      requestRender();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    three.current = { renderer, scene, camera, orbit, gizmo, material, hidden, built: null, outline: null, requestRender, handles: [] };
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("contextmenu", noMenu);
      renderer.domElement.removeEventListener("dblclick", onDouble);
      gizmo.detach();
      gizmo.dispose();
      orbit.dispose();
      if (three.current?.built) disposeTree(three.current.built.root);
      material.map?.dispose();
      material.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // ── texture ──
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    let cancelled = false;
    const apply = (tex: THREE.Texture) => {
      if (cancelled) { tex.dispose(); return; }
      t.material.map?.dispose();
      t.material.map = tex;
      t.material.needsUpdate = true;
      t.requestRender();
    };
    if (textureCanvas) {
      const tex = new THREE.CanvasTexture(textureCanvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      apply(tex);
    } else if (textureUrl) {
      new THREE.TextureLoader().load(textureUrl, (tex) => {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        apply(tex);
      }, undefined, () => apply(checkerTexture(model.textureWidth, model.textureHeight)));
    } else {
      apply(checkerTexture(model.textureWidth, model.textureHeight));
    }
    return () => { cancelled = true; };
  }, [textureUrl, textureCanvas, model.textureWidth, model.textureHeight]);

  // Re-upload the live canvas after each brush step.
  useEffect(() => {
    const t = three.current;
    if (!t || !textureCanvas || !t.material.map) return;
    t.material.map.needsUpdate = true;
    t.requestRender();
  }, [textureVersion, textureCanvas]);

  // ── model (rebuilt on every change; cheap at entity-model sizes, and only renders once) ──
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    if (t.built) {
      t.gizmo.detach();
      t.scene.remove(t.built.root);
      disposeTree(t.built.root);
    }
    t.built = buildModel(model, t.material, t.hidden);
    poseBones(t.built, poseRef.current);
    t.scene.add(t.built.root);
    t.requestRender();
  }, [model]);

  // ── reference mannequin (armor) ──
  useEffect(() => {
    const t = three.current;
    if (!t || reference !== "player") return;
    const group = playerMannequin();
    t.scene.add(group);
    t.requestRender();
    return () => { t.scene.remove(group); disposeTree(group); t.requestRender(); };
  }, [reference]);

  // ── selection outline + gizmo ──
  useEffect(() => {
    const t = three.current;
    if (!t || !t.built) return;
    if (t.outline) {
      t.outline.parent?.remove(t.outline);
      t.outline.geometry.dispose();
      t.outline = null;
    }
    t.gizmo.detach();
    for (const h of t.handles) { h.parent?.remove(h); h.geometry.dispose(); (h.material as THREE.Material).dispose(); }
    t.handles = [];
    if (selection && !onPaint) {
      const target = selection.type === "cube" ? t.built.cubePivots.get(selection.id) : t.built.bones.get(selection.id);
      const faceHandles = resizeHandles && mode === "scale" && selection.type === "cube";
      if (target && faceHandles) {
        const mesh = target.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
        if (mesh) t.handles = makeHandles(mesh);
      }
      if (target) {
        if (!faceHandles) t.gizmo.attach(target);
        const lineMat = new THREE.LineBasicMaterial({ color: selection.type === "cube" ? 0xf5b301 : 0x4fa3e0, depthTest: false, transparent: true });
        if (selection.type === "cube") {
          const mesh = target.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
          if (mesh) {
            const outline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), lineMat);
            outline.renderOrder = 3;
            mesh.add(outline);
            t.outline = outline;
          }
        } else {
          // Bone: mark its pivot with a small cross.
          const g = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-1.5, 0, 0), new THREE.Vector3(1.5, 0, 0),
            new THREE.Vector3(0, -1.5, 0), new THREE.Vector3(0, 1.5, 0),
            new THREE.Vector3(0, 0, -1.5), new THREE.Vector3(0, 0, 1.5),
          ]);
          const cross = new THREE.LineSegments(g, lineMat);
          cross.renderOrder = 3;
          target.add(cross);
          t.outline = cross;
        }
      }
    }
    t.requestRender();
  }, [selection, model, onPaint, mode, resizeHandles]);

  // ── gizmo mode / snapping ──
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.gizmo.setMode(mode);
    t.gizmo.setTranslationSnap(snap > 0 ? snap : null);
    t.gizmo.setRotationSnap(rotationSnap > 0 ? rotationSnap * DEG : null);
    t.gizmo.setScaleSnap(null);
    t.gizmo.setSpace(mode === "translate" ? "local" : "local");
    t.requestRender();
  }, [mode, snap, rotationSnap]);

  useImperativeHandle(ref, () => ({
    screenshot: () => {
      const t = three.current;
      if (!t) return "";
      const helper = t.gizmo.getHelper();
      const was = helper.visible;
      helper.visible = false;
      t.renderer.render(t.scene, t.camera);
      const url = t.renderer.domElement.toDataURL("image/png");
      helper.visible = was;
      t.requestRender();
      return url;
    },
    applyPose: (pose) => {
      poseRef.current = pose;
      const t = three.current;
      if (!t?.built) return;
      poseBones(t.built, pose);
      t.requestRender();
    },
    setView: (preset) => {
      const t = three.current;
      if (!t) return;
      const target = new THREE.Vector3(0, 10, 0);
      const d = 64;
      const pos: Record<ViewPreset, [number, number, number]> = {
        perspective: [-36, 34, -52], front: [0, 10, -d], back: [0, 10, d], left: [d, 10, 0], right: [-d, 10, 0], top: [0, d + 10, 0.001],
      };
      t.camera.position.set(...pos[preset]);
      t.orbit.target.copy(target);
      t.orbit.update();
      t.requestRender();
    },
  }), []);

  return (
    <div className="relative h-full w-full overflow-hidden" data-testid="model-viewport">
      <div ref={hostRef} className="absolute inset-0" />
      {gpu && (
        <div
          className={`pointer-events-none absolute bottom-1.5 left-2 max-w-[60%] truncate rounded-sm px-1.5 py-0.5 text-[10px] ${gpu.software ? "bg-amber-500/20 text-amber-200" : "bg-black/40 text-muted-foreground"}`}
          title={gpu.name}
          data-testid="gpu-info"
        >
          {gpu.software ? "⚠ Software rendering — enable hardware acceleration in your browser · " : "GPU: "}{gpu.name}
        </div>
      )}
    </div>
  );
});

export default ModelViewport;
