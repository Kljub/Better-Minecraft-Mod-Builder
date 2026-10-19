"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { chestQuads } from "@/lib/chestModel";

/**
 * 3D preview of a chest block with its 64×64 chest skin (the layout of vanilla
 * entity/chest/normal.png) — the same three boxes and UVs as vanilla ChestModel, lid openable.
 */
export default function ChestViewer3D({ textureUrl, size = 220 }: { textureUrl?: string; size?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(size, size);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.6, 1, 0.8);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(1.6, 1.3, 2.0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    controls.enablePan = false;
    controls.update();

    const material = new THREE.MeshLambertMaterial({ color: textureUrl ? 0xffffff : 0x9c6b30, side: THREE.DoubleSide, alphaTest: 0.1 });
    let texture: THREE.Texture | null = null;
    if (textureUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        texture = new THREE.Texture(img);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        material.map = texture;
        material.needsUpdate = true;
      };
      img.src = textureUrl;
    }

    // Model pixels → blocks, centered on the block (model space is 0..16 with +Y up).
    const root = new THREE.Group();
    root.scale.setScalar(1 / 16);
    root.position.set(-0.5, 0, -0.5);
    scene.add(root);
    const geometries: THREE.BufferGeometry[] = [];
    const part = (name: "bottom" | "lid" | "lock") => {
      const g = quadsGeometry(chestQuads(name));
      geometries.push(g);
      return new THREE.Mesh(g, material);
    };
    root.add(part("bottom"));
    const lid = new THREE.Group();
    lid.position.set(0, 9, 1);
    lid.add(part("lid"), part("lock"));
    root.add(lid);

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const target = Number(host.dataset.open === "1") * -Math.PI / 2;
      lid.rotation.x += (target - lid.rotation.x) * 0.2;
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      controls.dispose();
      geometries.forEach((g) => g.dispose());
      material.dispose();
      texture?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [textureUrl, size]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={hostRef} data-open={open ? "1" : "0"} data-testid="chest-viewer" className="rounded border border-input bg-[#8b8b8b]" style={{ width: size, height: size }} />
      <button type="button" className="text-[10px] text-muted-foreground underline decoration-dotted hover:text-foreground" onClick={() => setOpen((o) => !o)}>
        {open ? "Close lid" : "Open lid"}
      </button>
    </div>
  );
}

function quadsGeometry(quads: ReturnType<typeof chestQuads>): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const q of quads) {
    const base = pos.length / 3;
    for (const v of q) { pos.push(v.x, v.y, v.z); uv.push(v.u, v.v); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
