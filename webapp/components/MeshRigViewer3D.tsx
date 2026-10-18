"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { evaluate, playbackTime, type ModelAnimation } from "@/lib/model3d/animation";
import type { MeshPartPreview, RigBonePreview } from "@/lib/model3d/meshPack";

/**
 * Mesh Models preview: the converted mesh as it will move in game — every rigid part in its own
 * colour (so a wrong bone assignment is easy to spot), the bones as a yellow skeleton, and the
 * selected animation played on that rig with the same rest-pose math the export uses.
 */
export default function MeshRigViewer3D({ parts, bones, animation, showBones, className }: {
  parts: MeshPartPreview[];
  bones: RigBonePreview[];
  animation: ModelAnimation | null;
  showBones: boolean;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(animation);
  useEffect(() => { animRef.current = animation; }, [animation]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      mount.textContent = "3D preview needs WebGL.";
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(30, 60, -40);
    scene.add(sun);

    // Bone groups: each at its pivot relative to the parent's, holding its part shifted by -pivot.
    const groups = new Map<string, THREE.Group>();
    const rest = new Map<string, THREE.Vector3>();
    for (const b of bones) {
      const g = new THREE.Group();
      const parent = b.parent ? bones.find((x) => x.name === b.parent) : undefined;
      const local = new THREE.Vector3(...b.pivot).sub(parent ? new THREE.Vector3(...parent.pivot) : new THREE.Vector3());
      g.position.copy(local);
      rest.set(b.name, local.clone());
      groups.set(b.name, g);
    }
    for (const b of bones) (b.parent && groups.get(b.parent) ? groups.get(b.parent)! : scene).add(groups.get(b.name)!);
    const box = new THREE.Box3();
    parts.forEach((p, i) => {
      const bone = bones.find((b) => b.name === p.bone);
      const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(p.positions, 3));
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      box.union(geo.boundingBox!);
      if (bone) geo.translate(-bone.pivot[0], -bone.pivot[1], -bone.pivot[2]);
      const color = new THREE.Color().setHSL(((i * 0.618) % 1), 0.55, 0.6);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, flatShading: true, side: THREE.DoubleSide }));
      (groups.get(p.bone) ?? scene).add(mesh);
    });

    // Skeleton overlay (drawn on top).
    const joints: { mesh: THREE.Mesh; bone: string }[] = [];
    const lines: { line: THREE.Line; bone: string; parent: string }[] = [];
    if (showBones) {
      const jointMat = new THREE.MeshBasicMaterial({ color: 0xffd400, depthTest: false });
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false });
      const size = box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).length() / 120;
      for (const b of bones) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.3, size), 8, 6), jointMat);
        s.renderOrder = 10;
        scene.add(s);
        joints.push({ mesh: s, bone: b.name });
        if (b.parent) {
          const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat);
          l.renderOrder = 10;
          scene.add(l);
          lines.push({ line: l, bone: b.name, parent: b.parent });
        }
      }
    }

    const center = box.isEmpty() ? new THREE.Vector3(0, 8, 0) : box.getCenter(new THREE.Vector3());
    const radius = box.isEmpty() ? 16 : box.getSize(new THREE.Vector3()).length() / 2;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, radius * 20);
    camera.position.set(center.x + radius * 1.2, center.y + radius * 0.6, center.z - radius * 2.2); // front-left, the mob faces -Z
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.update();
    const grid = new THREE.GridHelper(Math.ceil(radius * 3 / 16) * 16, Math.ceil(radius * 3 / 16), 0x888888, 0x555555);
    scene.add(grid);

    const resize = () => {
      const w = mount.clientWidth || 300, h = mount.clientHeight || 300;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const anim = animRef.current;
      const poses = anim ? evaluate(anim, playbackTime(anim, (performance.now() - start) / 1000)) : new Map();
      for (const [name, g] of groups) {
        const p = poses.get(name);
        g.position.copy(rest.get(name)!);
        if (p) {
          g.position.add(new THREE.Vector3(...p.position));
          g.rotation.set(THREE.MathUtils.degToRad(p.rotation[0]), THREE.MathUtils.degToRad(p.rotation[1]), THREE.MathUtils.degToRad(p.rotation[2]), "ZYX");
        } else g.rotation.set(0, 0, 0);
      }
      scene.updateMatrixWorld(true);
      for (const j of joints) groups.get(j.bone)!.getWorldPosition(j.mesh.position);
      for (const l of lines) {
        const a = groups.get(l.bone)!.getWorldPosition(new THREE.Vector3());
        const b = groups.get(l.parent)!.getWorldPosition(new THREE.Vector3());
        l.line.geometry.setFromPoints([a, b]);
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [parts, bones, showBones]);

  return <div ref={mountRef} className={className} data-testid="mesh-viewer" />;
}
