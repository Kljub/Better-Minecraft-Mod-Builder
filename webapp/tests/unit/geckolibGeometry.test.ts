import { describe, it, expect } from "vitest";
import { buildGeckoLibGeometry } from "@/lib/geckolibGeometry";
import type { MeshInput } from "@/lib/meshTypes";

function triangle(
  positions: [[number, number, number], [number, number, number], [number, number, number]],
  materialIndex = 0
) {
  return {
    positions,
    uvs: [[0, 0], [1, 0], [1, 1]] as [[number, number], [number, number], [number, number]],
    materialIndex,
  };
}

describe("buildGeckoLibGeometry", () => {
  it("puts every triangle for the chosen material into a single root bone's poly_mesh", () => {
    const meshes: MeshInput[] = [
      {
        name: "blob",
        triangles: [
          triangle([[0, 0, 0], [2, 0, 0], [2, 2, 0]]),
          triangle([[0, 0, 0], [0, 2, 0], [2, 2, 0]]),
        ],
      },
    ];
    const model = buildGeckoLibGeometry({
      modelName: "Test Mob", meshes, materialIndex: 0, textureWidth: 32, textureHeight: 32,
    });
    const geo = (model["minecraft:geometry"] as Record<string, unknown>[])[0];
    const bones = geo.bones as Record<string, unknown>[];
    expect(bones).toHaveLength(1);
    expect(bones[0].name).toBe("root");
    const polyMesh = bones[0].poly_mesh as { positions: unknown[]; normals: unknown[]; uvs: unknown[]; polys: number[][][]; normalized_uvs: boolean };
    expect(polyMesh.normalized_uvs).toBe(true);
    expect(polyMesh.polys).toHaveLength(2);
    expect(polyMesh.positions).toHaveLength(6);
    expect(polyMesh.normals).toHaveLength(6);
    expect(polyMesh.uvs).toHaveLength(6);
  });

  it("every poly's [pos, normal, uv] indices are within bounds of their flat arrays", () => {
    const meshes: MeshInput[] = [
      { name: "a", triangles: [triangle([[0, 0, 0], [1, 0, 0], [1, 1, 0]])] },
    ];
    const model = buildGeckoLibGeometry({
      modelName: "t", meshes, materialIndex: 0, textureWidth: 16, textureHeight: 16,
    });
    const geo = (model["minecraft:geometry"] as Record<string, unknown>[])[0];
    const bones = geo.bones as Record<string, unknown>[];
    const polyMesh = bones[0].poly_mesh as { positions: unknown[]; normals: unknown[]; uvs: unknown[]; polys: number[][][] };
    for (const poly of polyMesh.polys) {
      expect(poly).toHaveLength(3);
      for (const [posIdx, normIdx, uvIdx] of poly) {
        expect(posIdx).toBeGreaterThanOrEqual(0);
        expect(posIdx).toBeLessThan(polyMesh.positions.length);
        expect(normIdx).toBeGreaterThanOrEqual(0);
        expect(normIdx).toBeLessThan(polyMesh.normals.length);
        expect(uvIdx).toBeGreaterThanOrEqual(0);
        expect(uvIdx).toBeLessThan(polyMesh.uvs.length);
      }
    }
  });

  it("drops triangles that don't belong to the chosen materialIndex", () => {
    const meshes: MeshInput[] = [
      {
        name: "a",
        triangles: [
          triangle([[0, 0, 0], [1, 0, 0], [1, 1, 0]], 0),
          triangle([[0, 0, 0], [1, 0, 0], [1, 1, 0]], 1),
        ],
      },
    ];
    const model = buildGeckoLibGeometry({
      modelName: "t", meshes, materialIndex: 0, textureWidth: 16, textureHeight: 16,
    });
    const geo = (model["minecraft:geometry"] as Record<string, unknown>[])[0];
    const bones = geo.bones as Record<string, unknown>[];
    const polyMesh = bones[0].poly_mesh as { polys: unknown[] };
    expect(polyMesh.polys).toHaveLength(1);
  });

  it("sanitizes the model name into a lowercase geometry identifier", () => {
    const meshes: MeshInput[] = [{ name: "a", triangles: [triangle([[0, 0, 0], [1, 0, 0], [1, 1, 0]])] }];
    const model = buildGeckoLibGeometry({
      modelName: "My Cool Mob!! v2", meshes, materialIndex: 0, textureWidth: 16, textureHeight: 16,
    });
    const geo = (model["minecraft:geometry"] as Record<string, unknown>[])[0];
    const description = geo.description as Record<string, unknown>;
    expect(description.identifier).toBe("geometry.my_cool_mob_v2");
    expect(description.texture_width).toBe(16);
    expect(description.texture_height).toBe(16);
  });

  it("auto-fit rests the mesh on Y=0, matching bbmodel's ground convention", () => {
    const meshes: MeshInput[] = [
      { name: "a", triangles: [triangle([[0, 10, 0], [4, 10, 0], [4, 18, 0]])] },
    ];
    const model = buildGeckoLibGeometry({
      modelName: "t", meshes, materialIndex: 0, textureWidth: 16, textureHeight: 16, targetSize: 16,
    });
    const geo = (model["minecraft:geometry"] as Record<string, unknown>[])[0];
    const bones = geo.bones as Record<string, unknown>[];
    const positions = (bones[0].poly_mesh as { positions: [number, number, number][] }).positions;
    const ys = positions.map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(16, 5);
  });

  it("format_version and identifier prefix match GeckoLib's expected Bedrock schema", () => {
    const model = buildGeckoLibGeometry({
      modelName: "t", meshes: [], materialIndex: 0, textureWidth: 16, textureHeight: 16,
    });
    expect(model.format_version).toBe("1.12.0");
    const geo = (model["minecraft:geometry"] as Record<string, unknown>[])[0];
    expect((geo.description as Record<string, unknown>).identifier).toMatch(/^geometry\./);
  });
});
