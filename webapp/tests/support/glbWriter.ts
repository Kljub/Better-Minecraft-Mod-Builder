/**
 * Minimal binary glTF (GLB) for tests: two stacked unit boxes (y 0..1 → bone "Body", y 1..2 →
 * bone "Arm", pivot y=1) as one skinned mesh, plus an animation "Wave" turning Arm 90° about X.
 */
export function riggedGlb(): Buffer {
  const box = (y0: number): number[] => {
    const c = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(([x, y, z]) => [x - 0.5, y + y0, z - 0.5]);
    const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
    return quads.flatMap(([a, b, cc, d]) => [a, b, cc, a, cc, d]).flatMap((i) => c[i]);
  };
  const pos = new Float32Array([...box(0), ...box(1)]);
  const n = pos.length / 3;
  const joints = new Uint16Array(n * 4);
  const weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { joints[i * 4] = i < n / 2 ? 0 : 1; weights[i * 4] = 1; }
  const ibm = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1]);
  const times = new Float32Array([0, 1]);
  const s = Math.SQRT1_2;
  const quats = new Float32Array([0, 0, 0, 1, s, 0, 0, s]);
  const parts = [pos, joints, weights, ibm, times, quats].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  const offsets: number[] = [];
  let len = 0;
  for (const p of parts) { offsets.push(len); len += Math.ceil(p.length / 4) * 4; }
  const bin = Buffer.alloc(len);
  parts.forEach((p, i) => p.copy(bin, offsets[i]));
  const views = parts.map((p, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: p.length }));
  const min = [-0.5, 0, -0.5], max = [0.5, 2, 0.5];
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: "Tower", mesh: 0, skin: 0 },
      { name: "Body", children: [2] },
      { name: "Arm", translation: [0, 1, 0] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.2, 1] } }],
    skins: [{ joints: [1, 2], inverseBindMatrices: 3 }],
    animations: [{
      name: "Wave",
      samplers: [{ input: 4, output: 5, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 2, path: "rotation" } }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5123, count: n, type: "VEC4" },
      { bufferView: 2, componentType: 5126, count: n, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: 2, type: "MAT4" },
      { bufferView: 4, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 5, componentType: 5126, count: 2, type: "VEC4" },
    ],
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
  };
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunk = (data: Buffer, type: number) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
  return Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(bin, 0x004e4942)]);
}
