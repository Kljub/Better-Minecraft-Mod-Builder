import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildMeshReference, defaultOrientation, loadMeshFile, meshExtension, prepareStl, STL_MAX_POLYGONS } from "@/lib/model3d/meshReference";

const box = (w: number, h: number, d: number, color = 0xff0000) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));

const ASCII_STL = `solid t
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 10 0 0
vertex 0 10 0
endloop
endfacet
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 0 10 0
vertex 0 0 40
endloop
endfacet
endsolid t`;

describe("mesh reference", () => {
  it("recognises the supported formats", () => {
    expect(["a.STL", "b.obj", "c.glb", "d.gltf", "e.3mf"].map(meshExtension)).toEqual(["stl", "obj", "glb", "gltf", "3mf"]);
    expect(meshExtension("x.bbmodel")).toBeNull();
    expect(defaultOrientation("stl").up).toBe("z");
    expect(defaultOrientation("glb").up).toBe("y");
  });

  it("scales to 32 px, stands on Y=0 and merges a solid block into one box", () => {
    const ref = buildMeshReference(box(1, 2, 1), "pillar.glb", { up: "y", turns: 0 }, false);
    expect(ref.size).toEqual([16, 32, 16]);
    expect(ref.boxes).toBe(1);
    const s = JSON.parse(ref.summary);
    expect(s.boxes[0]).toEqual({ from: [-8, 0, -8], size: [16, 32, 16], color: "#ff0000" });
  });

  it("Z-up turns the long Z side into the height; quarter turns swap width and depth", () => {
    expect(buildMeshReference(box(1, 1, 2), "a.stl", { up: "z", turns: 0 }, false).size).toEqual([16, 32, 16]);
    expect(buildMeshReference(box(2, 1, 1), "a.glb", { up: "y", turns: 1 }, false).size).toEqual([16, 16, 32]);
  });

  it("keeps hollow-free shapes apart and stays under the box limit", () => {
    const group = new THREE.Group();
    const a = box(1, 1, 1);
    const b = box(1, 1, 1, 0x00ff00);
    b.position.set(3, 0, 0);
    group.add(a, b);
    const ref = buildMeshReference(group, "two.obj", { up: "y", turns: 0 }, false);
    const colors = JSON.parse(ref.summary).boxes.map((x: { color?: string }) => x.color);
    expect(colors).toContain("#ff0000");
    expect(colors).toContain("#00ff00");
    expect(ref.boxes).toBeLessThanOrEqual(160);
  });

  it("reads an ASCII STL file", async () => {
    const obj = await loadMeshFile(new File([ASCII_STL], "t.stl"));
    const ref = buildMeshReference(obj, "t.stl", defaultOrientation("stl"), false);
    expect(ref.triangles).toBe(2);
    expect(Math.max(...ref.size)).toBeCloseTo(32);
    expect(ref.size[1]).toBeCloseTo(32); // Z (40) became the height
  });
});

describe("STL preparation", () => {
  const flat = (g: THREE.BufferGeometry) => new THREE.Mesh(g.toNonIndexed());
  it("a box is 6 quads", () => {
    const p = prepareStl(flat(new THREE.BoxGeometry(1, 1, 1)));
    expect(p.topology).toEqual({ triangles: 12, quads: 6, leftover: 0, polygons: 6 });
    expect(p.note).toBe("all quads");
  });
  it("triangles that don't pair are kept, not refused", () => {
    const mixed = new THREE.Group().add(flat(new THREE.IcosahedronGeometry(1, 3)), flat(new THREE.BoxGeometry(1, 1, 1)));
    const p = prepareStl(mixed);
    expect(p.object).toBe(mixed);
    expect(p.topology.leftover).toBeGreaterThan(0);
    expect(p.note).toBe("converted to 6 quads + 320 triangles");
  });
  it("up to 15000 polygons stay as they are, more get simplified", () => {
    const ok = flat(new THREE.PlaneGeometry(1, 1, 120, 120)); // 14400 quads
    expect(prepareStl(ok).object).toBe(ok);
    const big = prepareStl(flat(new THREE.SphereGeometry(1, 200, 100))); // ~40k triangles
    expect(big.topology.polygons).toBeLessThanOrEqual(STL_MAX_POLYGONS);
    expect(big.topology.polygons).toBeGreaterThan(1000);
    expect(big.note).toMatch(/^simplified from/);
    expect(buildMeshReference(big.object, "big.stl", { up: "y", turns: 0 }, false).size).toEqual([32, 32, 32]);
  });
});
