import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildMeshPack } from "@/lib/model3d/meshPack";
import { validateAiRig } from "@/lib/model3d/aiRig";

/** Two stacked unit boxes (y 0..1 and 1..2), the top one skinned to "arm" which pivots at y=1. */
function riggedTower(): { object: THREE.Object3D; animations: THREE.AnimationClip[] } {
  const lower = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const upper = new THREE.BoxGeometry(1, 1, 1).translate(0, 1.5, 0);
  const geo = new THREE.BufferGeometry();
  const pos = [...lower.toNonIndexed().getAttribute("position").array, ...upper.toNonIndexed().getAttribute("position").array];
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const n = pos.length / 3;
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(Array.from({ length: n }, (_, i) => [i < n / 2 ? 0 : 1, 0, 0, 0]).flat(), 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [1, 0, 0, 0]).flat(), 4));
  const body = new THREE.Bone(); body.name = "Body";
  const arm = new THREE.Bone(); arm.name = "mixamorigArm"; arm.position.set(0, 1, 0);
  body.add(arm);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x336699 }));
  const scene = new THREE.Group();
  scene.add(body, mesh);
  scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([body, arm]));
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const clip = new THREE.AnimationClip("Wave", 1, [
    new THREE.QuaternionKeyframeTrack("mixamorigArm.quaternion", [0, 1], [0, 0, 0, 1, q.x, q.y, q.z, q.w]),
  ]);
  return { object: scene, animations: [clip] };
}

describe("mesh pack", () => {
  it("cuts a rigged mesh into one rigid part per bone, in the part's Java space", async () => {
    const { pack, bones } = await buildMeshPack(riggedTower(), { target: "entity", orientation: { up: "y", turns: 0 }, height: 2, rig: "file" });
    expect(bones.map((b) => b.name)).toEqual(["body", "mixamorigarm"]);
    expect(pack.bones).toBe(2);
    expect(Object.keys(pack.meshes).sort()).toEqual(["body", "mixamorigarm"]);
    expect(pack.triangles).toBe(24);
    expect(pack.size).toEqual([1, 2, 1]);
    // Arm pivot at 16 px → Java part offset y = 24 - 16 relative… as child of body (pivot 0): y = -16.
    const arm = pack.parts.find((p) => p.name === "mixamorigarm")!;
    expect(arm.parent).toBe("body");
    expect(arm.pose.y).toBe(-16);
    // Arm vertices sit above its pivot → negative Y in Java space, in blocks (0 .. -1).
    const ys = pack.meshes.mixamorigarm.split("\n").filter((l) => l.startsWith("v ")).map((l) => Number(l.split(" ")[2]));
    expect(Math.min(...ys)).toBeCloseTo(-1);
    expect(Math.max(...ys)).toBeCloseTo(0);
    expect(pack.mtl).toContain("map_Kd #white");
    expect(pack.textures.white).toBeTruthy();
    expect(pack.meshes.body).toContain("mtllib mesh.mtl");
  });

  it("bakes the file's animation clips per bone", async () => {
    const { pack } = await buildMeshPack(riggedTower(), { target: "entity", orientation: { up: "y", turns: 0 }, height: 2, rig: "file" });
    expect(pack.clips).toEqual(["wave"]);
    const wave = pack.animations[0];
    expect(wave.looping).toBe(true);
    const ch = wave.channels.find((c) => c.bone === "mixamorigarm" && c.target === "rotation")!;
    const last = ch.keyframes.at(-1)!;
    // glTF faces +Z, the editor -Z (the model is turned 180°): +90° about X in the file swings the
    // arm backwards = -90° in the editor, and Java flips X (javaAnimations) → +90.
    expect(last.x).toBeCloseTo(90, 0);
    expect(wave.channels.some((c) => c.bone === "body")).toBe(false);
  });

  it("assigns triangles to AI-rig bones by region", async () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", (riggedTower().object.children[1] as THREE.Mesh).geometry.getAttribute("position").clone());
    const object = new THREE.Group().add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
    const rig = validateAiRig({ bones: [
      { name: "Body", parent: "", pivot: [0, 0, 0], region: { from: [-8, 0, -8], size: [16, 16, 16] } },
      { name: "Head", parent: "Body", pivot: [0, 16, 0], region: { from: [-8, 16, -8], size: [16, 16, 16] } },
    ] });
    const { pack } = await buildMeshPack({ object, animations: [] }, { target: "entity", orientation: { up: "y", turns: 0 }, height: 2, rig: "ai", aiRig: rig, aiRigHeight: 2 });
    const tris = (k: string) => pack.meshes[k].split("\n").filter((l) => l.startsWith("f ")).length;
    // The two faces on the shared plane y=16 lie in both regions (same size) — the first bone wins.
    expect(tris("body") + tris("head")).toBe(24);
    expect(tris("head")).toBe(10);
  });

  it("items are one OBJ inside a block, in block units", async () => {
    const { pack } = await buildMeshPack({ object: new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1)), animations: [] }, { target: "item", orientation: { up: "y", turns: 0 }, height: 2, rig: "none" });
    expect(Object.keys(pack.meshes)).toEqual(["root"]);
    const vs = pack.meshes.root.split("\n").filter((l) => l.startsWith("v ")).map((l) => l.split(" ").slice(1).map(Number));
    expect(Math.min(...vs.map((v) => v[0]))).toBeCloseTo(0);
    expect(Math.max(...vs.map((v) => v[0]))).toBeCloseTo(1);
    expect(pack.parts).toEqual([]);
  });

  it("AI rig validation keeps one root and known parents", () => {
    const rig = validateAiRig({ bones: [
      { name: "Body", parent: "x", pivot: [0, 10, 0], region: { from: [0, 0, 0], size: [1, 1, 1] } },
      { name: "Left Wing", parent: "body", pivot: [4, 20, 2], region: { from: [0, 0, 0], size: [-3, 1, 1] } },
      { name: "tail", parent: "nope", pivot: [0, 8, 6], region: { from: [0, 0, 0], size: [1, 1, 1] } },
      { name: "bad", parent: "", pivot: [0, 1], region: { from: [0, 0, 0], size: [1, 1, 1] } },
    ] });
    expect(rig.bones.map((b) => [b.name, b.parent])).toEqual([["body", ""], ["left_wing", "body"], ["tail", "body"]]);
    expect(rig.bones[1].region.size).toEqual([3, 1, 1]);
  });
});
