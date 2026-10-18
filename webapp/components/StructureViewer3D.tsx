"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { isEmptyBlock, type StructureBlockState, type StructureInfo } from "@/lib/nbt";

/**
 * Interactive 3D look at a structure template (.nbt) — for checking what a file contains and how
 * big it is before shipping it, not a pixel-exact Minecraft render: every block is a box (slabs,
 * carpets and snow layers get their real height), textured from the loaded pack when a matching
 * block texture exists, otherwise a stable per-block color. A Y slider cuts the structure open
 * layer by layer; hovering a block shows its id, position and block-state properties.
 */

type Faces = { top?: string; side?: string; bottom?: string };

/** Best-effort block id → pack texture keys ("block/oak_log_top.png"); vanilla's own naming patterns. */
export function blockTextureKeys(name: string, has: (key: string) => boolean): Faces {
  const path = name.includes(":") ? name.split(":")[1] : name;
  const k = (p: string) => `block/${p}.png`;
  const first = (...c: string[]) => c.map(k).find(has);
  // stairs/slabs/walls/fences/… borrow their full block's texture
  const base = path.replace(/_(stairs|slab|wall|fence_gate|fence|pressure_plate|button|carpet)$/, "");
  const bases = [base, `${base}_planks`, base.replace(/_brick$/, "_bricks"), base.replace(/_tile$/, "_tiles"), `${base}_block`];
  const side = first(path, `${path}_side`, `${path}_front`, ...bases, ...bases.map((b) => `${b}_side`));
  const top = first(`${path}_top`, `${base}_top`, path, ...bases) ?? side;
  const bottom = first(`${path}_bottom`, `${base}_bottom`) ?? top;
  return { top, side: side ?? top, bottom };
}

function hashColor(name: string): THREE.Color {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return new THREE.Color().setHSL(((h >>> 0) % 360) / 360, 0.45, 0.55);
}

/** Vanilla tints these grayscale textures by biome; a plains-ish green keeps them readable. */
const tinted = (name: string, face: "top" | "side" | "bottom") =>
  /(leaves|^minecraft:(short_grass|tall_grass|fern|large_fern|vine|lily_pad))/.test(name) || (name === "minecraft:grass_block" && face === "top");
const TRANSLUCENT = /(glass|ice|slime|honey_block)/;

/** Box height/offset for the block state (y from the block's bottom, in blocks). */
function shapeOf(state: StructureBlockState): { h: number; y: number } {
  const p = state.properties;
  if (state.name.endsWith("_slab")) return p.type === "double" ? { h: 1, y: 0 } : p.type === "top" ? { h: 0.5, y: 0.5 } : { h: 0.5, y: 0 };
  if (state.name.endsWith("_carpet") || state.name.endsWith("_pressure_plate")) return { h: 1 / 16, y: 0 };
  if (state.name === "minecraft:snow") return { h: Math.max(1, Number(p.layers) || 1) / 8, y: 0 };
  return { h: 1, y: 0 };
}

export interface HoveredBlock { x: number; y: number; z: number; state: StructureBlockState }

export default function StructureViewer3D({ info, packTextures, className }: {
  info: StructureInfo;
  packTextures: Record<string, string>;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [maxY, setMaxY] = useState(info.size[1] - 1);
  const [hovered, setHovered] = useState<HoveredBlock | null>(null);
  const applyCutRef = useRef<(maxY: number) => void>(() => {});

  // Solid blocks grouped by palette state — one InstancedMesh per state.
  const groups = useMemo(() => {
    const byState = new Map<number, { x: number; y: number; z: number }[]>();
    for (const b of info.blocks) {
      if (isEmptyBlock(info.palette[b.state].name)) continue;
      const list = byState.get(b.state) ?? [];
      list.push(b);
      byState.set(b.state, list);
    }
    return [...byState.entries()];
  }, [info]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const [sx, sy, sz] = info.size;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777788, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.6, 1, 0.35);
    scene.add(sun);

    const radius = Math.max(sx, sy, sz);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, radius * 20 + 100);
    camera.position.set(sx * 1.4 + 4, sy * 1.2 + 4, sz * 1.6 + 4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(sx / 2, sy / 3, sz / 2);
    controls.enableDamping = true;
    controls.update();

    // Outline of the full template volume, with 1-block ground grid.
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)),
      new THREE.LineBasicMaterial({ color: 0x4f8cff }),
    );
    outline.position.set(sx / 2, sy / 2, sz / 2);
    scene.add(outline);
    const grid = new THREE.GridHelper(Math.max(sx, sz), Math.max(sx, sz), 0x888888, 0x444444);
    grid.position.set(Math.max(sx, sz) / 2, 0, Math.max(sx, sz) / 2);
    (grid.material as THREE.Material).opacity = 0.35;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    const loader = new THREE.TextureLoader();
    const texCache = new Map<string, THREE.Texture>();
    const textureFor = (key: string | undefined) => {
      if (!key || !packTextures[key]) return undefined;
      let tex = texCache.get(key);
      if (!tex) {
        tex = loader.load(packTextures[key], (t) => {
          // animated textures are vertical strips — show the first frame
          const img = t.image as { width: number; height: number };
          if (img.height > img.width) { t.repeat.set(1, img.width / img.height); t.offset.set(0, 1 - img.width / img.height); }
          t.needsUpdate = true;
        });
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        texCache.set(key, tex);
      }
      return tex;
    };

    const has = (key: string) => !!packTextures[key];
    const meshes: { mesh: THREE.InstancedMesh; blocks: { x: number; y: number; z: number }[]; state: StructureBlockState; shape: { h: number; y: number } }[] = [];
    const disposables: { dispose(): void }[] = [];
    for (const [stateIdx, blocks] of groups) {
      const state = info.palette[stateIdx];
      const faces = blockTextureKeys(state.name, has);
      const translucent = TRANSLUCENT.test(state.name);
      const mat = (face: "top" | "side" | "bottom") => {
        const map = textureFor(faces[face]);
        const m = new THREE.MeshLambertMaterial({
          map,
          color: map ? (tinted(state.name, face) ? new THREE.Color(0x7fb238) : 0xffffff) : hashColor(state.name),
          transparent: translucent,
          opacity: translucent ? 0.6 : 1,
          alphaTest: map && !translucent ? 0.5 : 0,
        });
        disposables.push(m);
        return m;
      };
      const side = mat("side");
      const materials = [side, side, mat("top"), mat("bottom"), side, side];
      const shape = shapeOf(state);
      const geo = new THREE.BoxGeometry(1, shape.h, 1);
      disposables.push(geo);
      const mesh = new THREE.InstancedMesh(geo, materials, blocks.length);
      scene.add(mesh);
      meshes.push({ mesh, blocks, state, shape });
    }

    const m4 = new THREE.Matrix4();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const applyCut = (cutY: number) => {
      for (const { mesh, blocks, shape } of meshes) {
        blocks.forEach((b, i) => {
          mesh.setMatrixAt(i, b.y <= cutY ? m4.makeTranslation(b.x + 0.5, b.y + shape.y + shape.h / 2, b.z + 0.5) : hidden);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    };
    applyCut(sy - 1);
    applyCutRef.current = applyCut;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let lastHover = "";
    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes.map((m) => m.mesh), false)[0];
      const entry = hit && hit.instanceId !== undefined ? meshes.find((m) => m.mesh === hit.object) : undefined;
      const b = entry && hit.instanceId !== undefined ? entry.blocks[hit.instanceId] : undefined;
      const sig = b ? `${b.x},${b.y},${b.z}` : "";
      if (sig === lastHover) return;
      lastHover = sig;
      setHovered(b && entry ? { ...b, state: entry.state } : null);
    };
    const onLeave = () => { lastHover = ""; setHovered(null); };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      for (const { mesh } of meshes) mesh.dispose();
      disposables.forEach((d) => d.dispose());
      texCache.forEach((t) => t.dispose());
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      applyCutRef.current = () => {};
    };
  }, [info, groups, packTextures]);

  useEffect(() => { applyCutRef.current(maxY); }, [maxY, groups]);

  const [sx, sy, sz] = info.size;
  return (
    <div className={`relative flex flex-col overflow-hidden rounded-sm border border-input bg-[var(--rail)] ${className ?? ""}`}>
      <div ref={mountRef} className="min-h-0 flex-1" />
      <div className="pointer-events-none absolute left-2 top-2 rounded-sm bg-background/80 px-2 py-1 text-[11px] font-mono leading-tight">
        <div>{sx} × {sy} × {sz} <span className="text-muted-foreground">(W × H × D)</span></div>
        <div className="text-muted-foreground">{info.solidCount.toLocaleString()} blocks · {Object.keys(info.counts).length} types{info.entityCount ? ` · ${info.entityCount} entities` : ""}</div>
      </div>
      {hovered && (
        <div className="pointer-events-none absolute right-2 top-2 max-w-[60%] rounded-sm bg-background/90 px-2 py-1 text-[11px] font-mono leading-tight">
          <div className="font-semibold">{hovered.state.name.replace(/^minecraft:/, "")}</div>
          <div className="text-muted-foreground">x {hovered.x} · y {hovered.y} · z {hovered.z}</div>
          {Object.entries(hovered.state.properties).map(([k, v]) => <div key={k} className="text-muted-foreground">{k}={v}</div>)}
        </div>
      )}
      <label className="flex items-center gap-2 border-t border-input bg-background/60 px-2 py-1 text-[11px]">
        <span className="shrink-0 text-muted-foreground">Show up to Y</span>
        <input type="range" min={0} max={Math.max(0, sy - 1)} value={maxY} onChange={(e) => setMaxY(Number(e.target.value))} className="min-w-0 flex-1" />
        <span className="w-12 shrink-0 text-right font-mono">{maxY + 1}/{sy}</span>
      </label>
    </div>
  );
}
