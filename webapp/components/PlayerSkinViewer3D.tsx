"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// 1 scene unit = 16 skin pixels, feet at y=0.
const PX = 1 / 16;

interface Part {
  /** box size in skin pixels */
  size: [number, number, number];
  /** box centre in skin pixels */
  pos: [number, number, number];
  /** top-left of the box-UV net in the 64×64 skin */
  uv: [number, number];
  /** second-layer (hat/jacket/sleeve/pants) net, rendered 0.5px larger with alpha */
  overlay: [number, number];
}

// Classic (4px-arm) model. "Right" is the player's right, i.e. -x when facing +z.
const PARTS: Part[] = [
  { size: [8, 8, 8], pos: [0, 28, 0], uv: [0, 0], overlay: [32, 0] },
  { size: [8, 12, 4], pos: [0, 18, 0], uv: [16, 16], overlay: [16, 32] },
  { size: [4, 12, 4], pos: [-6, 18, 0], uv: [40, 16], overlay: [40, 32] },
  { size: [4, 12, 4], pos: [6, 18, 0], uv: [32, 48], overlay: [48, 48] },
  { size: [4, 12, 4], pos: [-2, 6, 0], uv: [0, 16], overlay: [0, 32] },
  { size: [4, 12, 4], pos: [2, 6, 0], uv: [16, 48], overlay: [0, 48] },
];

/** Box UVs in BoxGeometry face order (+x, -x, +y, -y, +z, -z) as [x, y, w, h] skin-pixel rects. */
function boxUvRects([w, h, d]: [number, number, number], [u, v]: [number, number]) {
  return [
    [u + d + w, v + d, d, h], // +x: player's left side
    [u, v + d, d, h], // -x: player's right side
    [u + d, v, w, d], // top
    [u + d + w, v, w, d], // bottom
    [u + d, v + d, w, h], // front
    [u + 2 * d + w, v + d, w, h], // back
  ];
}

/**
 * @param inflate added to every dimension (vanilla's CubeDeformation is per side, so twice that)
 * @param texH 64 for skins, 32 for the legacy-layout armor layers
 * @param mirror vanilla's mirrored box UV (left limbs reusing the right limbs' net): the side faces
 *   swap and every face is flipped horizontally
 */
function skinBox(size: [number, number, number], uv: [number, number], inflate: number, texH = 64, mirror = false): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry((size[0] + inflate) * PX, (size[1] + inflate) * PX, (size[2] + inflate) * PX);
  const attr = geo.getAttribute("uv") as THREE.BufferAttribute;
  const rects = boxUvRects(size, uv);
  if (mirror) [rects[0], rects[1]] = [rects[1], rects[0]];
  // BoxGeometry writes each face's 4 vertices as top-left, top-right, bottom-left, bottom-right
  // (as seen from outside), which is also how the skin net is laid out — so a plain rect maps.
  rects.forEach(([x, y, w, h], face) => {
    let u0 = x / 64, u1 = (x + w) / 64;
    if (mirror) [u0, u1] = [u1, u0];
    const vTop = 1 - y / texH, vBot = 1 - (y + h) / texH;
    const corners = [[u0, vTop], [u1, vTop], [u0, vBot], [u1, vBot]];
    corners.forEach(([cu, cv], k) => attr.setXY(face * 4 + k, cu, cv));
  });
  attr.needsUpdate = true;
  return geo;
}

// Worn armor in the legacy 64×32 layout (vanilla HumanoidArmorModel): layer 1 is inflated by 1px
// per side (hat 1.5), layer 2 by 0.5px. Left limbs reuse the right limbs' net, mirrored.
interface ArmorPart { size: [number, number, number]; pos: [number, number, number]; uv: [number, number]; inflate: number; mirror?: boolean }
const ARMOR_LAYER_1: ArmorPart[] = [
  { size: [8, 8, 8], pos: [0, 28, 0], uv: [0, 0], inflate: 2 },
  { size: [8, 8, 8], pos: [0, 28, 0], uv: [32, 0], inflate: 3 },
  { size: [8, 12, 4], pos: [0, 18, 0], uv: [16, 16], inflate: 2 },
  { size: [4, 12, 4], pos: [-6, 18, 0], uv: [40, 16], inflate: 2 },
  { size: [4, 12, 4], pos: [6, 18, 0], uv: [40, 16], inflate: 2, mirror: true },
  { size: [4, 12, 4], pos: [-2, 6, 0], uv: [0, 16], inflate: 2 },
  { size: [4, 12, 4], pos: [2, 6, 0], uv: [0, 16], inflate: 2, mirror: true },
];
const ARMOR_LAYER_2: ArmorPart[] = [
  { size: [8, 12, 4], pos: [0, 18, 0], uv: [16, 16], inflate: 1 },
  { size: [4, 12, 4], pos: [-2, 6, 0], uv: [0, 16], inflate: 1 },
  { size: [4, 12, 4], pos: [2, 6, 0], uv: [0, 16], inflate: 1, mirror: true },
];
const BARE_SKIN = 0xb08f74;

function loadTexture(url: string, onLoad: (tex: THREE.Texture) => void) {
  new THREE.TextureLoader().load(url, (tex) => {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    onLoad(tex);
  });
}

/**
 * Orbit-rotatable player model (classic arms): wearing a 64×64 skin with its second layer, or —
 * without a skin — a plain body; optionally with worn armor layers (64×32 each) on top.
 */
export default function PlayerSkinViewer3D({ skinUrl, armor, className }: {
  skinUrl?: string;
  armor?: { layer1?: string; layer2?: string };
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 256;
    const height = container.clientHeight || 320;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // no WebGL — the flat skin next to it still shows
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(1.6, 1.7, 3.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 7;
    controls.update();
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(2, 4, 3);
    scene.add(light);

    let disposed = false;
    const group = new THREE.Group();
    scene.add(group);
    const owned: { dispose(): void }[] = [];

    const addBox = (geo: THREE.BoxGeometry, mat: THREE.Material, pos: [number, number, number]) => {
      owned.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos[0] * PX, pos[1] * PX, pos[2] * PX);
      group.add(mesh);
    };

    if (skinUrl) {
      loadTexture(skinUrl, (tex) => {
        if (disposed) { tex.dispose(); return; }
        const base = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
        const layer = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
        owned.push(tex, base, layer);
        for (const p of PARTS) {
          addBox(skinBox(p.size, p.uv, 0), base, p.pos);
          addBox(skinBox(p.size, p.overlay, p.size[0] === 8 && p.size[1] === 8 ? 1 : 0.5), layer, p.pos);
        }
      });
    } else {
      const bare = new THREE.MeshLambertMaterial({ color: BARE_SKIN });
      owned.push(bare);
      for (const p of PARTS) addBox(skinBox(p.size, p.uv, 0), bare, p.pos);
    }

    for (const [url, parts] of [[armor?.layer1, ARMOR_LAYER_1], [armor?.layer2, ARMOR_LAYER_2]] as const) {
      if (!url) continue;
      loadTexture(url, (tex) => {
        if (disposed) { tex.dispose(); return; }
        const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.1, side: THREE.DoubleSide });
        owned.push(tex, mat);
        for (const a of parts) addBox(skinBox(a.size, a.uv, a.inflate, 32, a.mirror), mat, a.pos);
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
      owned.forEach((o) => o.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [skinUrl, armor?.layer1, armor?.layer2]);

  return <div ref={containerRef} className={className} data-testid="player-skin-3d" />;
}
