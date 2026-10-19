import { describe, expect, it } from "vitest";
import { applyGizmo } from "@/lib/model3d/edit";
import { emptyModel } from "@/lib/model3d/geometry";

describe("resize handles", () => {
  it("moves only the dragged face", () => {
    const m = emptyModel(); // cube -4..4 × 0..8 × -4..4
    const c = m.cubes[0];
    const east = applyGizmo(m, { type: "cube", id: c.id }, { kind: "resize", axis: 0, side: 1, delta: 3 }, 1).cubes[0];
    expect(east.from).toEqual([-4, 0, -4]);
    expect(east.to).toEqual([7, 8, 4]);
    const down = applyGizmo(m, { type: "cube", id: c.id }, { kind: "resize", axis: 1, side: -1, delta: 2 }, 1).cubes[0];
    expect(down.from).toEqual([-4, -2, -4]);
    expect(down.to).toEqual([4, 8, 4]);
    const shrink = applyGizmo(m, { type: "cube", id: c.id }, { kind: "resize", axis: 2, side: -1, delta: -5 }, 1).cubes[0];
    expect(shrink.from[2]).toBe(1);
    expect(shrink.to[2]).toBe(4);
  });
});
