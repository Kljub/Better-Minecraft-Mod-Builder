import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { makeBone, makeCube } from "@/lib/model3d/geometry";
import {
  makeAnimation, setKeyframe, sampleChannel, evaluate, playbackTime, toBedrockAnimations, fromBedrockAnimations,
  toJavaAnimations, deleteKeyframe, type ModelAnimation,
} from "@/lib/model3d/animation";
import { toBbmodel, fromBbmodel } from "@/lib/model3d/codecs";
import type { EntityModel } from "@/lib/model3d/types";

function model(): EntityModel {
  const body = makeBone({ name: "body", origin: [0, 0, 0] });
  const leg = makeBone({ name: "leg", origin: [0, 6, 0], parent: body.id });
  return { textureWidth: 32, textureHeight: 32, texture: "", bones: [body, leg], cubes: [makeCube({ bone: body.id }), makeCube({ bone: leg.id })] };
}

function walk(m: EntityModel): ModelAnimation {
  const leg = m.bones[1].id;
  let a = makeAnimation("walk", { length: 1, loop: "loop" });
  a = setKeyframe(a, leg, "rotation", 0, [30, 10, 5]);
  a = setKeyframe(a, leg, "rotation", 0.5, [-30, 0, 0]);
  a = setKeyframe(a, leg, "rotation", 1, [30, 10, 5]);
  a = setKeyframe(a, leg, "position", 0.25, [2, 1, 0]);
  return a;
}

describe("sampling", () => {
  it("interpolates linearly, holds outside the range, and loops playback", () => {
    const m = model();
    const a = walk(m);
    expect(sampleChannel(a.bones[m.bones[1].id].rotation, 0.25, "rotation")).toEqual([0, 5, 2.5]);
    expect(sampleChannel(a.bones[m.bones[1].id].position, 0.9, "position")).toEqual([2, 1, 0]);
    expect(sampleChannel([], 0, "scale")).toEqual([1, 1, 1]);
    expect(playbackTime(a, 2.25)).toBeCloseTo(0.25);
    expect(playbackTime({ ...a, loop: "once" }, 3)).toBe(1);
    expect(evaluate(a, 0).get(m.bones[1].id)?.rotation).toEqual([30, 10, 5]);
  });
  it("step holds until the next keyframe; replacing a keyframe at the same time keeps one", () => {
    let a = makeAnimation("x");
    a = setKeyframe(a, "b", "rotation", 0, [10, 0, 0], "step");
    a = setKeyframe(a, "b", "rotation", 1, [20, 0, 0]);
    expect(sampleChannel(a.bones.b.rotation, 0.99, "rotation")).toEqual([10, 0, 0]);
    a = setKeyframe(a, "b", "rotation", 1, [40, 0, 0]);
    expect(a.bones.b.rotation).toHaveLength(2);
    a = deleteKeyframe(a, a.bones.b.rotation[0].id);
    expect(a.bones.b.rotation).toHaveLength(1);
  });
});

describe("Bedrock / GeckoLib animation export", () => {
  it("flips rotation X/Y and position X like Blockbench, and round-trips", () => {
    const m = model();
    const json = toBedrockAnimations(m, [walk(m)], "blob") as { animations: Record<string, { loop: boolean; animation_length: number; bones: Record<string, Record<string, Record<string, number[]>>> }> };
    const anim = json.animations["animation.blob.walk"];
    expect(anim.loop).toBe(true);
    expect(anim.animation_length).toBe(1);
    expect(anim.bones.leg.rotation["0.0"]).toEqual([-30, -10, 5]);
    expect(anim.bones.leg.rotation["0.5"]).toEqual([30, 0, 0]);
    expect(anim.bones.leg.position["0.25"]).toEqual([-2, 1, 0]);

    const back = fromBedrockAnimations(json, m).animations[0];
    expect(back.name).toBe("walk");
    expect(back.bones[m.bones[1].id].rotation.map((k) => [k.time, k.value])).toEqual(walk(m).bones[m.bones[1].id].rotation.map((k) => [k.time, k.value]));
  });
});

describe("Java animation export", () => {
  it("writes an AnimationDefinition with flipped values", () => {
    const m = model();
    const java = toJavaAnimations(m, [walk(m)], "BlobAnimations");
    expect(java).toContain("public static final AnimationDefinition WALK = AnimationDefinition.Builder.withLength(1.0F).looping()");
    expect(java).toContain(`.addAnimation("leg", new AnimationChannel(AnimationChannel.Targets.ROTATION,`);
    expect(java).toContain("new Keyframe(0.0F, KeyframeAnimations.degreeVec(-30.0F, -10.0F, 5.0F), AnimationChannel.Interpolations.LINEAR)");
    expect(java).toContain("KeyframeAnimations.posVec(-2.0F, 1.0F, 0.0F)");
    fs.mkdirSync("/tmp/claude-1000/javacheck", { recursive: true });
    fs.writeFileSync("/tmp/claude-1000/javacheck/BlobAnimations.java", java);
  });
});

describe(".bbmodel animations", () => {
  it("round-trip with bones re-linked by uuid", () => {
    const m = { ...model() };
    m.animations = [walk(m)];
    const back = fromBbmodel(JSON.parse(JSON.stringify(toBbmodel(m, { name: "blob", format: "animated_entity_model" }))));
    const anims = back.model.animations!;
    expect(anims).toHaveLength(1);
    const legId = back.model.bones.find((b) => b.name === "leg")!.id;
    expect(anims[0].bones[legId].rotation.map((k) => k.value)).toEqual([[30, 10, 5], [-30, 0, 0], [30, 10, 5]]);
    expect(anims[0].loop).toBe("loop");
  });
});
