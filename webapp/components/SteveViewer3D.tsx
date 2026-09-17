"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

type ArmorSlotKey = "helmet" | "chestplate" | "leggings" | "boots";
const ArmorSlotKeys: ArmorSlotKey[] = ["helmet", "chestplate", "leggings", "boots"];

interface Props {
  /** Single-piece mode (existing Item "armor" category preview) — shorthand for
   * `textures={{[armorSlot]: textureUrl}}`. Ignored when `textures` is given directly. */
  armorSlot?: ArmorSlotKey;
  textureUrl?: string;
  /** Full-set mode (Armor tab) — one texture per slot, worn simultaneously; slots left out stay
   * skin-colored (unworn). Takes priority over armorSlot/textureUrl when present. */
  textures?: Partial<Record<ArmorSlotKey, string>>;
}

// 1 scene unit = 16 Minecraft skin-pixels, so proportions match vanilla Steve without needing
// the real skin/armor UV layout — a fixed-topology viewer, not the editable cuboid modeler
// (that stays a separate, much larger "Blockbench-style" phase; see the plan notes).
const PX = 1 / 16;
const SKIN_COLOR = 0xc9a27a;
const ARMOR_FALLBACK_COLOR = 0x4a90d9;

interface PartDef { w: number; h: number; d: number; x: number; y: number; z?: number }

// Local pixel space: y=0 at the feet, head top at y=32 (standard 32px-tall humanoid).
const PARTS: Record<string, PartDef> = {
  head: { w: 8, h: 8, d: 8, x: 0, y: 28 },
  body: { w: 8, h: 12, d: 4, x: 0, y: 18 },
  armL: { w: 4, h: 12, d: 4, x: -6, y: 18 },
  armR: { w: 4, h: 12, d: 4, x: 6, y: 18 },
  legUpperL: { w: 4, h: 8, d: 4, x: -2, y: 8 },
  legUpperR: { w: 4, h: 8, d: 4, x: 2, y: 8 },
  footL: { w: 4, h: 4, d: 4, x: -2, y: 2 },
  footR: { w: 4, h: 4, d: 4, x: 2, y: 2 },
};

const ARMOR_PART_KEYS: Record<ArmorSlotKey, (keyof typeof PARTS)[]> = {
  helmet: ["head"],
  chestplate: ["body", "armL", "armR"],
  leggings: ["legUpperL", "legUpperR"],
  boots: ["footL", "footR"],
};

/**
 * Fixed-topology 3D "Steve" viewer — orbit-rotatable boxes in vanilla humanoid proportions, with
 * the chosen armor piece's texture applied to the matching body part(s). Not an editable model
 * builder: geometry is fixed, only the armor-part material changes. A real cuboid editor
 * (add/move/UV-map arbitrary boxes, à la Blockbench) is a separate, much bigger follow-up.
 */
export default function SteveViewer3D({ armorSlot, textureUrl, textures }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const effectiveTextures: Partial<Record<ArmorSlotKey, string>> =
    textures ?? (armorSlot ? { [armorSlot]: textureUrl } : {});
  // Stable key so the effect only re-runs when the actual texture set changes, not on every
  // render (effectiveTextures is a fresh object literal each render otherwise).
  const texturesKey = ArmorSlotKeys.map((k) => `${k}:${effectiveTextures[k] ?? ""}`).join("|");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 160;
    const height = container.clientHeight || 200;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // no WebGL available in this environment — caller falls back to the flat preview
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(2.4, 1.6, 3.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enablePan = false;
    controls.minDistance = 1.8;
    controls.maxDistance = 6;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);

    const group = new THREE.Group();
    const meshes: Record<string, THREE.Mesh> = {};
    for (const [key, part] of Object.entries(PARTS)) {
      const geo = new THREE.BoxGeometry(part.w * PX, part.h * PX, part.d * PX);
      const mat = new THREE.MeshStandardMaterial({ color: SKIN_COLOR });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(part.x * PX, part.y * PX, part.z ? part.z * PX : 0);
      meshes[key] = mesh;
      group.add(mesh);
    }
    scene.add(group);

    let disposed = false;
    const loadedTextures: THREE.Texture[] = [];

    function applySlotLook(slot: ArmorSlotKey, texture: THREE.Texture | undefined) {
      for (const key of ARMOR_PART_KEYS[slot]) {
        const mat = meshes[key].material as THREE.MeshStandardMaterial;
        if (texture) {
          mat.map = texture;
          mat.color.set(0xffffff);
        } else {
          mat.map = null;
          mat.color.set(ARMOR_FALLBACK_COLOR);
        }
        mat.needsUpdate = true;
      }
    }

    for (const slot of ArmorSlotKeys) {
      const url = effectiveTextures[slot];
      if (!url) continue;
      new THREE.TextureLoader().load(url, (tex) => {
        if (disposed) return;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        loadedTextures.push(tex);
        applySlotLook(slot, tex);
      });
    }

    let frame: number;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      group.rotation.y += 0.004;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      controls.dispose();
      for (const tex of loadedTextures) tex.dispose();
      for (const mesh of Object.values(meshes)) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texturesKey]);

  return <div ref={containerRef} style={{ width: 160, height: 200 }} />;
}
