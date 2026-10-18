import { describe, it, expect } from "vitest";
import { templateModel, generateAnimation, findBone } from "@/lib/model3d/aiOps";
import { animationToAi, aiToAnimation, animationContext, ANIMATION_SCHEMA, validateAiAnimation, animationPrompt } from "@/lib/model3d/aiAnimation";

describe("AI animation editing", () => {
  const model = templateModel("humanoid");
  const walk = generateAnimation(model, "walk");

  it("round-trips an animation through the AI shape by bone name", () => {
    const ai = animationToAi(model, walk);
    expect(ai.channels.some((c) => c.bone === "left_leg" && c.channel === "rotation")).toBe(true);
    const back = aiToAnimation(model, ai, walk);
    expect(back.id).toBe(walk.id);
    expect(back.name).toBe("walk");
    const legId = findBone(model, "left_leg")!.id;
    expect(back.bones[legId].rotation.map((k) => k.value[0])).toEqual(walk.bones[legId].rotation.map((k) => k.value[0]));
  });

  it("drops unknown bones, clamps values and times, creates new animations", () => {
    const next = aiToAnimation(model, { name: "wave hello", length: 2, loop: "once", channels: [
      { bone: "right_arm", channel: "rotation", keyframes: [{ t: -1, x: 9999, y: 0, z: 0, i: "catmullrom" }, { t: 5, x: 10, y: 0, z: 0, i: "linear" }] },
      { bone: "tentacle", channel: "rotation", keyframes: [{ t: 0, x: 1, y: 1, z: 1, i: "linear" }] },
    ] }, null);
    expect(next.name).toBe("wave_hello");
    expect(Object.keys(next.bones)).toEqual([findBone(model, "right_arm")!.id]);
    const keys = next.bones[findBone(model, "right_arm")!.id].rotation;
    expect(keys.map((k) => k.time)).toEqual([0, 2]);
    expect(keys[0].value[0]).toBe(360);
  });

  it("sends the skeleton and current keyframes", () => {
    const ctx = animationContext({ ...model, animations: [walk] }, walk);
    expect(ctx.bones.find((b) => b.name === "head")?.size).toEqual([8, 8, 8]);
    const prompt = animationPrompt("more bouncy", ctx);
    expect(prompt).toContain("Request: more bouncy");
    expect(prompt).toContain("left_leg");
    expect(() => validateAiAnimation({ channels: [] })).toThrow();
  });

  it("schema is strict-mode compatible (every object closed, every property required)", () => {
    const check = (node: Record<string, unknown>) => {
      if (node.type === "object") {
        expect(node.additionalProperties).toBe(false);
        expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties as object).sort());
        for (const p of Object.values(node.properties as Record<string, Record<string, unknown>>)) check(p);
      }
      if (node.type === "array") check(node.items as Record<string, unknown>);
    };
    check(ANIMATION_SCHEMA as unknown as Record<string, unknown>);
  });
});
