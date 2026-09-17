"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { EntityGeometry } from "@/lib/types";
import { buildCuboidGroup, createCheckerTexture } from "@/lib/entityGeometryModel";

interface Props {
  geometry: EntityGeometry;
  textureUrl?: string;
}

/** Read-only orbit-rotatable render of a custom entity's cuboid geometry — same box-UV math and
 * `buildCuboidGroup` helper as the full `EntityGeometryEditor`, minus `TransformControls`/
 * selection/editing. Used by `EntityPreview` in place of the flat texture swatch once a spec has
 * `useCustomModel` and at least one cuboid. */
export default function EntityModelViewer3D({ geometry, textureUrl }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cuboidsKey = geometry.cuboids.map((c) => `${c.id}:${c.position}:${c.size}:${c.rotation}:${c.uv}:${c.mirror}`).join("|");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 160;
    const height = container.clientHeight || 200;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.05, 100);
    camera.position.set(1.6, 1.2, 2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.3, 0);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);

    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    let texture: THREE.Texture;
    let disposed = false;
    if (textureUrl) {
      texture = new THREE.TextureLoader().load(textureUrl, (tex) => {
        if (disposed) return;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        material.needsUpdate = true;
      });
    } else {
      texture = createCheckerTexture();
    }
    material.map = texture;

    const groups: THREE.Group[] = [];
    for (const cuboid of geometry.cuboids) {
      const group = buildCuboidGroup(cuboid, material, geometry.textureWidth, geometry.textureHeight);
      scene.add(group);
      groups.push(group);
    }

    let frame: number;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      controls.dispose();
      material.dispose();
      texture.dispose();
      for (const group of groups) {
        for (const child of group.children) {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        }
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuboidsKey, textureUrl, geometry.textureWidth, geometry.textureHeight]);

  return <div ref={containerRef} style={{ width: 160, height: 200 }} />;
}
