"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/** Renders an already-parsed glTF scene in a small orbit-rotatable viewport, so the user can
 * sanity-check the import before downloading the converted .bbmodel — mirrors SteveViewer3D's
 * renderer/lighting/orbit setup, the existing raw-three.js convention in this repo. */
export default function GlbPreview3D({ scene }: { scene: THREE.Object3D }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 240;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const viewScene = new THREE.Scene();
    viewScene.add(scene);
    viewScene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(3, 5, 2);
    viewScene.add(dirLight);

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.001) * 1.6;

    const camera = new THREE.PerspectiveCamera(35, width / height, radius / 100, radius * 100);
    camera.position.set(center.x + radius, center.y + radius * 0.6, center.z + radius);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.update();

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(viewScene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      // Give the scene back to its owner (the parsed gltf) rather than disposing its geometry —
      // the caller may still read it (e.g. re-render this preview after an option change).
      viewScene.remove(scene);
    };
  }, [scene]);

  return <div ref={containerRef} className="h-full w-full" />;
}
