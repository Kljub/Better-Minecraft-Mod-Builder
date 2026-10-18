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

function skinBox(size: [number, number, number], uv: [number, number], inflate: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry((size[0] + inflate) * PX, (size[1] + inflate) * PX, (size[2] + inflate) * PX);
  const attr = geo.getAttribute("uv") as THREE.BufferAttribute;
  // BoxGeometry writes each face's 4 vertices as top-left, top-right, bottom-left, bottom-right
  // (as seen from outside), which is also how the skin net is laid out — so a plain rect maps.
  boxUvRects(size, uv).forEach(([x, y, w, h], face) => {
    const u0 = x / 64, u1 = (x + w) / 64, vTop = 1 - y / 64, vBot = 1 - (y + h) / 64;
    const corners = [[u0, vTop], [u1, vTop], [u0, vBot], [u1, vBot]];
    corners.forEach(([cu, cv], k) => attr.setXY(face * 4 + k, cu, cv));
  });
  attr.needsUpdate = true;
  return geo;
}

/** Orbit-rotatable player model wearing a 64×64 skin (classic arms, with the second layer). */
export default function PlayerSkinViewer3D({ skinUrl, className }: { skinUrl: string; className?: string }) {
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

    new THREE.TextureLoader().load(skinUrl, (tex) => {
      if (disposed) { tex.dispose(); return; }
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      const base = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
      const layer = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
      owned.push(tex, base, layer);
      for (const p of PARTS) {
        for (const [uv, mat, inflate] of [[p.uv, base, 0], [p.overlay, layer, p.size[0] === 8 && p.size[1] === 8 ? 1 : 0.5]] as const) {
          const geo = skinBox(p.size, uv, inflate);
          owned.push(geo);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(p.pos[0] * PX, p.pos[1] * PX, p.pos[2] * PX);
          group.add(mesh);
        }
      }
    });

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
  }, [skinUrl]);

  return <div ref={containerRef} className={className} data-testid="player-skin-3d" />;
}
