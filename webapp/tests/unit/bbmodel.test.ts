import { describe, it, expect } from "vitest";
import { buildBbmodel, type BbmodelMeshInput, type BbmodelMaterialInput } from "@/lib/bbmodel";

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

describe("buildBbmodel", () => {
  const materials: BbmodelMaterialInput[] = [
    { name: "skin", textureDataUrl: "data:image/png;base64,AAAA", width: 32, height: 32 },
  ];

  it("produces one mesh element with matching outliner entry", () => {
    const meshes: BbmodelMeshInput[] = [
      { name: "blob", triangles: [triangle([[0, 0, 0], [2, 0, 0], [2, 2, 0]])] },
    ];
    const model = buildBbmodel({ modelName: "test", meshes, materials });
    const elements = model.elements as Record<string, unknown>[];
    const outliner = model.outliner as string[];
    expect(elements).toHaveLength(1);
    expect(outliner).toEqual([elements[0].uuid]);
    expect(elements[0].type).toBe("mesh");
    expect(elements[0].name).toBe("blob");
  });

  it("skips meshes with no triangles", () => {
    const meshes: BbmodelMeshInput[] = [{ name: "empty", triangles: [] }];
    const model = buildBbmodel({ modelName: "test", meshes, materials });
    expect(model.elements).toEqual([]);
    expect(model.outliner).toEqual([]);
  });

  it("every face references vertex ids that exist in the mesh's own vertex map, with matching uv keys", () => {
    const meshes: BbmodelMeshInput[] = [
      {
        name: "blob",
        triangles: [
          triangle([[0, 0, 0], [2, 0, 0], [2, 2, 0]]),
          triangle([[0, 0, 0], [0, 2, 0], [2, 2, 0]]),
        ],
      },
    ];
    const model = buildBbmodel({ modelName: "test", meshes, materials, autoFit: false });
    const element = (model.elements as Record<string, unknown>[])[0];
    const vertices = element.vertices as Record<string, unknown>;
    const faces = element.faces as Record<string, { vertices: string[]; uv: Record<string, unknown> }>;
    const faceList = Object.values(faces);
    expect(faceList).toHaveLength(2);
    for (const face of faceList) {
      expect(face.vertices).toHaveLength(3);
      for (const vid of face.vertices) {
        expect(vertices).toHaveProperty(vid);
        expect(face.uv).toHaveProperty(vid);
      }
    }
  });

  it("auto-fit scales the combined bounding box to targetSize and rests it on the ground (min Y = 0)", () => {
    const meshes: BbmodelMeshInput[] = [
      { name: "a", triangles: [triangle([[0, 10, 0], [4, 10, 0], [4, 18, 0]])] },
    ];
    const model = buildBbmodel({ modelName: "test", meshes, materials, autoFit: true, targetSize: 16 });
    const element = (model.elements as Record<string, unknown>[])[0];
    const vertices = Object.values(element.vertices as Record<string, [number, number, number]>);
    const ys = vertices.map((v) => v[1]);
    const xs = vertices.map((v) => v[0]);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    // Max source dimension was the 8-unit Y span (10->18); scaled to targetSize 16 => factor 2.
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(16, 5);
    // X span (0->4) centers around 0 after the same 2x scale: [-4, 4].
    expect(Math.min(...xs)).toBeCloseTo(-4, 5);
    expect(Math.max(...xs)).toBeCloseTo(4, 5);
  });

  it("converts normalized UVs to pixel space using the referenced material's texture size", () => {
    const meshes: BbmodelMeshInput[] = [
      { name: "a", triangles: [triangle([[0, 0, 0], [1, 0, 0], [1, 1, 0]])] },
    ];
    const model = buildBbmodel({ modelName: "test", meshes, materials, autoFit: false });
    const element = (model.elements as Record<string, unknown>[])[0];
    const faces = Object.values(element.faces as Record<string, { uv: Record<string, [number, number]> }>);
    const uvValues = Object.values(faces[0].uv);
    // uvs were [0,0],[1,0],[1,1] normalized; material texture is 32x32.
    expect(uvValues).toContainEqual([0, 0]);
    expect(uvValues).toContainEqual([32, 0]);
    expect(uvValues).toContainEqual([32, 32]);
  });

  it("falls back to a synthesized flat-color texture when a material has no textureDataUrl", () => {
    const meshes: BbmodelMeshInput[] = [
      { name: "a", triangles: [triangle([[0, 0, 0], [1, 0, 0], [1, 1, 0]])] },
    ];
    const model = buildBbmodel({
      modelName: "test",
      meshes,
      materials: [{ name: "plain", color: 0x336699 }],
    });
    const textures = model.textures as Record<string, unknown>[];
    expect(textures).toHaveLength(1);
    expect(typeof textures[0].source).toBe("string");
    expect((textures[0].source as string).startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  it("sets meta.model_format to the Blockbench Generic Model id", () => {
    const model = buildBbmodel({ modelName: "test", meshes: [], materials: [] });
    expect((model.meta as Record<string, unknown>).model_format).toBe("free");
  });
});
