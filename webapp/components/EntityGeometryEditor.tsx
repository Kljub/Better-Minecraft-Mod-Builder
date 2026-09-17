"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { EntityGeometry, EntityCuboid } from "@/lib/types";
import { newCuboid, newCuboidId } from "@/lib/entityRegistry";
import { buildCuboidGroup, createCheckerTexture, readGroupTransform } from "@/lib/entityGeometryModel";
import { Field, NumInput, Toggle } from "@/components/SchemaFields";
import { Input } from "@/components/ui/input";

interface Props {
  geometry: EntityGeometry;
  textureUrl?: string;
  onChange: (next: EntityGeometry) => void;
}

/**
 * Blockbench-lite cuboid model editor for a custom entity — add/select/move/rotate boxes in 3D,
 * per-cuboid position/size/rotation/UV fields. Raw three.js (no react-three-fiber in this repo,
 * matching SteveViewer3D's convention), OrbitControls for the camera + TransformControls for the
 * selected box. Gizmo drags mutate the three.js object directly and only commit back into React
 * state once the drag ends (`dragging-changed` -> false) — committing on every drag frame would
 * fight the scene rebuild below and fight the gizmo's own object identity.
 */
export default function EntityGeometryEditor({ geometry, textureUrl, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(geometry.cuboids[0]?.id ?? null);
  const [mode, setMode] = useState<"translate" | "rotate">("translate");

  const groupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const sceneRef = useRef<THREE.Scene | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const selectedIdRef = useRef(selectedId);
  const geometryRef = useRef(geometry);
  const onChangeRef = useRef(onChange);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { geometryRef.current = geometry; }, [geometry]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Mount once — renderer/camera/scene/orbit/transform/raycaster persist across edits so dragging
  // and orbiting stay smooth; only the cuboid meshes themselves get rebuilt (separate effect below).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const width = container.clientWidth || 480;
    const height = container.clientHeight || 360;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      return;
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x2b2b2b, 1);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 100);
    camera.position.set(2, 1.6, 2.4);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0.5, 0);
    orbit.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);
    scene.add(new THREE.GridHelper(2, 8, 0x555555, 0x3a3a3a));

    const transform = new TransformControls(camera, renderer.domElement);
    transformRef.current = transform;
    scene.add(transform.getHelper());

    function commitSelectedTransform() {
      const id = selectedIdRef.current;
      const group = id ? groupsRef.current.get(id) : null;
      const cuboid = id ? geometryRef.current.cuboids.find((c) => c.id === id) : undefined;
      if (!id || !group || !cuboid) return;
      const { position, rotation } = readGroupTransform(group, cuboid.size);
      onChangeRef.current({
        ...geometryRef.current,
        cuboids: geometryRef.current.cuboids.map((c) => (c.id === id ? { ...c, position, rotation } : c)),
      });
    }

    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !(event as unknown as { value: boolean }).value;
      if (!(event as unknown as { value: boolean }).value) commitSelectedTransform();
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function onPointerDown(event: PointerEvent) {
      if (transform.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const meshes: THREE.Object3D[] = [];
      groupsRef.current.forEach((g) => meshes.push(...g.children));
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) setSelectedId(hits[0].object.userData.cuboidId as string);
    }
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    let frame: number;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      transform.dispose();
      orbit.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      sceneRef.current = null;
      transformRef.current = null;
    };
  }, []);

  // Rebuild cuboid meshes whenever the data or texture changes. Safe to fully rebuild (rather than
  // patch in place) because gizmo drags never touch React state until they've already ended (see
  // dragging-changed above) — so this never runs mid-drag.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

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

    const oldGroups = groupsRef.current;
    const newGroups = new Map<string, THREE.Group>();
    for (const cuboid of geometry.cuboids) {
      const group = buildCuboidGroup(cuboid, material, geometry.textureWidth, geometry.textureHeight);
      scene.add(group);
      newGroups.set(cuboid.id, group);
    }
    groupsRef.current = newGroups;

    for (const group of oldGroups.values()) {
      scene.remove(group);
      for (const child of group.children) {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      }
    }

    const selected = selectedIdRef.current ? newGroups.get(selectedIdRef.current) : undefined;
    if (transformRef.current) {
      if (selected) transformRef.current.attach(selected);
      else transformRef.current.detach();
    }

    return () => {
      disposed = true;
      material.dispose();
      texture.dispose();
    };
  }, [geometry, textureUrl]);

  // Re-attach the gizmo when the selection changes (without rebuilding meshes).
  useEffect(() => {
    const transform = transformRef.current;
    if (!transform) return;
    const group = selectedId ? groupsRef.current.get(selectedId) : undefined;
    if (group) transform.attach(group);
    else transform.detach();
  }, [selectedId]);

  useEffect(() => {
    transformRef.current?.setMode(mode);
  }, [mode]);

  const selectedCuboid = geometry.cuboids.find((c) => c.id === selectedId) ?? null;
  const updateCuboids = (next: EntityCuboid[]) => onChange({ ...geometry, cuboids: next });
  const updateSelected = (patch: Partial<EntityCuboid>) => {
    if (!selectedId) return;
    updateCuboids(geometry.cuboids.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)));
  };

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Texture Width">
          <NumInput value={geometry.textureWidth} onChange={(v) => onChange({ ...geometry, textureWidth: Math.max(1, Math.round(v)) })} />
        </Field>
        <Field label="Texture Height">
          <NumInput value={geometry.textureHeight} onChange={(v) => onChange({ ...geometry, textureHeight: Math.max(1, Math.round(v)) })} />
        </Field>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("translate")}
            className={`rounded border px-2 py-1 text-xs ${mode === "translate" ? "border-primary bg-primary/10" : "border-input"}`}
          >
            Move
          </button>
          <button
            type="button"
            onClick={() => setMode("rotate")}
            className={`rounded border px-2 py-1 text-xs ${mode === "rotate" ? "border-primary bg-primary/10" : "border-input"}`}
          >
            Rotate
          </button>
        </div>
        <button
          type="button"
          className="ml-auto rounded border border-dashed border-input px-2 py-1 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          onClick={() => {
            const box = newCuboid(geometry.cuboids);
            updateCuboids([...geometry.cuboids, box]);
            setSelectedId(box.id);
          }}
        >
          + Add Cuboid
        </button>
      </div>

      <div className="flex flex-1 gap-3" style={{ minHeight: 360 }}>
        <div ref={containerRef} className="flex-1 overflow-hidden rounded border border-input" />

        <div className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto text-xs">
          <div className="font-semibold text-muted-foreground">Cuboids</div>
          {geometry.cuboids.length === 0 && <div className="italic text-muted-foreground">No cuboids yet.</div>}
          <div className="flex flex-col gap-1">
            {geometry.cuboids.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex items-center gap-1 rounded border px-1.5 py-1 cursor-pointer ${
                  c.id === selectedId ? "border-primary bg-primary/10" : "border-input"
                }`}
              >
                <Input
                  className="h-6 flex-1 text-xs px-1.5"
                  value={c.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateCuboids(geometry.cuboids.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                />
                <button
                  type="button"
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation();
                    const copy: EntityCuboid = { ...c, id: newCuboidId(), name: `${c.name}_copy` };
                    updateCuboids([...geometry.cuboids, copy]);
                    setSelectedId(copy.id);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground px-1"
                >
                  ⧉
                </button>
                <button
                  type="button"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateCuboids(geometry.cuboids.filter((x) => x.id !== c.id));
                    if (selectedId === c.id) setSelectedId(null);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-destructive px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {selectedCuboid && (
            <div className="mt-2 flex flex-col gap-1.5 border-t border-input pt-2">
              <div className="font-semibold text-muted-foreground">Position</div>
              <div className="grid grid-cols-3 gap-1">
                {(["x", "y", "z"] as const).map((axis, i) => (
                  <NumInput key={axis} value={selectedCuboid.position[i]} onChange={(v) => {
                    const position = [...selectedCuboid.position] as [number, number, number];
                    position[i] = v;
                    updateSelected({ position });
                  }} />
                ))}
              </div>
              <div className="font-semibold text-muted-foreground">Size</div>
              <div className="grid grid-cols-3 gap-1">
                {(["w", "h", "d"] as const).map((axis, i) => (
                  <NumInput key={axis} value={selectedCuboid.size[i]} onChange={(v) => {
                    const size = [...selectedCuboid.size] as [number, number, number];
                    size[i] = Math.max(0.1, v);
                    updateSelected({ size });
                  }} />
                ))}
              </div>
              <div className="font-semibold text-muted-foreground">Rotation (°)</div>
              <div className="grid grid-cols-3 gap-1">
                {(["x", "y", "z"] as const).map((axis, i) => (
                  <NumInput key={axis} value={selectedCuboid.rotation[i]} onChange={(v) => {
                    const rotation = [...selectedCuboid.rotation] as [number, number, number];
                    rotation[i] = v;
                    updateSelected({ rotation });
                  }} />
                ))}
              </div>
              <div className="font-semibold text-muted-foreground">UV Offset</div>
              <div className="grid grid-cols-2 gap-1">
                {(["u", "v"] as const).map((axis, i) => (
                  <NumInput key={axis} value={selectedCuboid.uv[i]} onChange={(v) => {
                    const uv = [...selectedCuboid.uv] as [number, number];
                    uv[i] = Math.max(0, Math.round(v));
                    updateSelected({ uv });
                  }} />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Mirror</span>
                <Toggle checked={selectedCuboid.mirror} onChange={(v) => updateSelected({ mirror: v })} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
