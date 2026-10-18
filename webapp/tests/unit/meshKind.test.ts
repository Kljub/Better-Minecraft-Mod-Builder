import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MESH_MODEL } from "@/lib/elements/meshKind";
import { buildMeshPack } from "@/lib/model3d/meshPack";
import { cacheMeshPack } from "@/lib/model3d/meshPackStore";

async function spec(target: "entity" | "item" | "block") {
  const object = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
  const { pack } = await buildMeshPack({ object, animations: [] }, { target, orientation: { up: "y", turns: 0 }, height: 2, rig: "none" });
  cacheMeshPack(`k/${target}.meshpack.json`, pack);
  return {
    id: "statue", ...MESH_MODEL.defaults(), name: "Statue",
    mesh: { ...(MESH_MODEL.defaults().mesh as object), source: "k/statue.stl", fileName: "statue.stl", pack: `k/${target}.meshpack.json`, target },
  };
}
const ctx = { modId: "mymod", mcVersion: "26.2" as const, texture: () => undefined };

describe("Mesh Models export", () => {
  it("entity: OBJ part models as item models + an entities manifest entry with mesh parts", async () => {
    const s = await spec("entity");
    const paths = MESH_MODEL.files(s, ctx).map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining([
      "assets/mymod/models/mesh/statue/root.obj", "assets/mymod/models/mesh/statue/root.json", "assets/mymod/items/mesh/statue/root.json",
      "assets/mymod/models/mesh/statue/mesh.mtl", "assets/mymod/textures/block/mesh/statue/white.png", "assets/mymod/items/statue_spawn_egg.json",
    ]));
    const model = JSON.parse(MESH_MODEL.files(s, ctx).find((f) => f.path.endsWith("root.json") && f.path.includes("models"))!.content as string);
    expect(model).toMatchObject({ loader: "neoforge:obj", model: "mymod:models/mesh/statue/root.obj", textures: { white: "mymod:block/mesh/statue/white" } });
    const entry = MESH_MODEL.shared!(s, ctx).manifest!.entities as { parts: { name: string; mesh?: string }[]; hitboxHeight: number; hitboxWidth: number };
    expect(entry.parts).toEqual([expect.objectContaining({ name: "root", mesh: "mymod:mesh/statue/root" })]);
    expect(entry.hitboxHeight).toBe(2);
    expect(entry.hitboxWidth).toBe(0.8);
    expect(MESH_MODEL.validate!(s, ctx)).toEqual([expect.stringMatching(/No bones/)]);
  });

  it("block: blockstate, item definition, loot table and a mesh_models entry with its bounds", async () => {
    const s = await spec("block");
    const paths = MESH_MODEL.files(s, ctx).map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["assets/mymod/blockstates/statue.json", "assets/mymod/items/statue.json", "data/mymod/loot_table/blocks/statue.json"]));
    expect(MESH_MODEL.shared!(s, ctx).manifest!.mesh_models).toMatchObject({ id: "statue", target: "block", box: { from: [4, 0, 4], to: [12, 16, 12] } });
  });

  it("1.21.1 isn't supported", async () => {
    const s = await spec("item");
    expect(MESH_MODEL.files(s, { ...ctx, mcVersion: "1.21.1" })).toEqual([]);
    expect(MESH_MODEL.validate!(s, { modId: "mymod", mcVersion: "1.21.1" }).join()).toMatch(/26\.x/);
  });
});
