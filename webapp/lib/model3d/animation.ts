import type { EntityModel, Vec3 } from "./types";
import { newId } from "./geometry";

/**
 * Bone keyframe animations, stored like Blockbench stores them internally (same axes as the
 * model; the Bedrock and Java exporters flip X / X+Y exactly like Blockbench's codecs do).
 * Values are offsets on top of the bone's rest pose: rotation in degrees (added), position in
 * pixels (added), scale as a factor (multiplied).
 */

export type Channel = "rotation" | "position" | "scale";
export const CHANNELS: Channel[] = ["rotation", "position", "scale"];
export type Interpolation = "linear" | "catmullrom" | "step";

export interface AnimKeyframe {
  id: string;
  /** seconds */
  time: number;
  value: Vec3;
  interpolation: Interpolation;
}

export interface BoneTrack {
  rotation: AnimKeyframe[];
  position: AnimKeyframe[];
  scale: AnimKeyframe[];
}

export type LoopMode = "once" | "loop" | "hold";

export interface ModelAnimation {
  id: string;
  /** e.g. "walk" — exported as animation.<model>.<name> */
  name: string;
  /** seconds */
  length: number;
  loop: LoopMode;
  /** bone id -> keyframes */
  bones: Record<string, BoneTrack>;
}

export interface BonePose {
  rotation: Vec3;
  position: Vec3;
  scale: Vec3;
}

export const IDENTITY_POSE: BonePose = { rotation: [0, 0, 0], position: [0, 0, 0], scale: [1, 1, 1] };
const NEUTRAL: Record<Channel, Vec3> = { rotation: [0, 0, 0], position: [0, 0, 0], scale: [1, 1, 1] };

export function emptyTrack(): BoneTrack {
  return { rotation: [], position: [], scale: [] };
}

export function makeAnimation(name: string, partial: Partial<ModelAnimation> = {}): ModelAnimation {
  return { id: newId("anim"), name, length: 1, loop: "loop", bones: {}, ...partial };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Catmull-Rom between p1 and p2 (Blockbench's / vanilla CATMULLROM formula). */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Interpolated channel value at `time` (keyframes needn't be sorted). */
export function sampleChannel(keyframes: AnimKeyframe[], time: number, channel: Channel): Vec3 {
  if (keyframes.length === 0) return [...NEUTRAL[channel]] as Vec3;
  const kfs = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= kfs[0].time) return [...kfs[0].value] as Vec3;
  const last = kfs[kfs.length - 1];
  if (time >= last.time) return [...last.value] as Vec3;
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].time <= time) i++;
  const a = kfs[i], b = kfs[i + 1];
  const t = (time - a.time) / (b.time - a.time || 1);
  if (a.interpolation === "step") return [...a.value] as Vec3;
  if (a.interpolation === "catmullrom" || b.interpolation === "catmullrom") {
    const p0 = kfs[i - 1] ?? a, p3 = kfs[i + 2] ?? b;
    return [0, 1, 2].map((k) => catmull(p0.value[k], a.value[k], b.value[k], p3.value[k], t)) as Vec3;
  }
  return [0, 1, 2].map((k) => lerp(a.value[k], b.value[k], t)) as Vec3;
}

/** Time inside the animation for a playhead running for `elapsed` seconds. */
export function playbackTime(anim: ModelAnimation, elapsed: number): number {
  if (anim.length <= 0) return 0;
  if (anim.loop === "loop") return elapsed % anim.length;
  return Math.min(elapsed, anim.length);
}

/** Pose offsets for every animated bone at `time`. */
export function evaluate(anim: ModelAnimation, time: number): Map<string, BonePose> {
  const out = new Map<string, BonePose>();
  for (const [boneId, track] of Object.entries(anim.bones)) {
    out.set(boneId, {
      rotation: sampleChannel(track.rotation, time, "rotation"),
      position: sampleChannel(track.position, time, "position"),
      scale: sampleChannel(track.scale, time, "scale"),
    });
  }
  return out;
}

const roundTime = (t: number) => Math.round(t * 10000) / 10000;

/** Adds or replaces the keyframe of `channel` at `time` (within 1ms) for a bone. */
export function setKeyframe(anim: ModelAnimation, boneId: string, channel: Channel, time: number, value: Vec3, interpolation: Interpolation = "linear"): ModelAnimation {
  const track = anim.bones[boneId] ?? emptyTrack();
  const t = roundTime(Math.max(0, time));
  const existing = track[channel].find((k) => Math.abs(k.time - t) < 0.001);
  const list = existing
    ? track[channel].map((k) => (k === existing ? { ...k, value } : k))
    : [...track[channel], { id: newId("kf"), time: t, value, interpolation }].sort((a, b) => a.time - b.time);
  return { ...anim, length: Math.max(anim.length, t), bones: { ...anim.bones, [boneId]: { ...track, [channel]: list } } };
}

export function updateKeyframe(anim: ModelAnimation, kfId: string, patch: Partial<AnimKeyframe>): ModelAnimation {
  const bones: Record<string, BoneTrack> = {};
  for (const [b, track] of Object.entries(anim.bones)) {
    bones[b] = {
      rotation: track.rotation.map((k) => (k.id === kfId ? { ...k, ...patch, time: patch.time !== undefined ? roundTime(Math.max(0, patch.time)) : k.time } : k)),
      position: track.position.map((k) => (k.id === kfId ? { ...k, ...patch, time: patch.time !== undefined ? roundTime(Math.max(0, patch.time)) : k.time } : k)),
      scale: track.scale.map((k) => (k.id === kfId ? { ...k, ...patch, time: patch.time !== undefined ? roundTime(Math.max(0, patch.time)) : k.time } : k)),
    };
  }
  return { ...anim, bones };
}

export function deleteKeyframe(anim: ModelAnimation, kfId: string): ModelAnimation {
  const bones: Record<string, BoneTrack> = {};
  for (const [b, track] of Object.entries(anim.bones)) {
    const next = { rotation: track.rotation.filter((k) => k.id !== kfId), position: track.position.filter((k) => k.id !== kfId), scale: track.scale.filter((k) => k.id !== kfId) };
    if (next.rotation.length || next.position.length || next.scale.length) bones[b] = next;
  }
  return { ...anim, bones };
}

export function findKeyframe(anim: ModelAnimation, kfId: string): { boneId: string; channel: Channel; keyframe: AnimKeyframe } | null {
  for (const [boneId, track] of Object.entries(anim.bones)) {
    for (const channel of CHANNELS) {
      const keyframe = track[channel].find((k) => k.id === kfId);
      if (keyframe) return { boneId, channel, keyframe };
    }
  }
  return null;
}

/** Drops tracks of bones that no longer exist (after deleting bones). */
export function pruneAnimations(model: EntityModel, anims: ModelAnimation[]): ModelAnimation[] {
  const ids = new Set(model.bones.map((b) => b.id));
  return anims.map((a) => ({ ...a, bones: Object.fromEntries(Object.entries(a.bones).filter(([b]) => ids.has(b))) }));
}

// ── Export / import ───────────────────────────────────────────────────────────

const r = (n: number) => { const x = Math.round(n * 10000) / 10000; return x === 0 ? 0 : x; };
const neg = (n: number) => (n === 0 ? 0 : -n);
const timeKey = (t: number) => { const s = String(r(t)); return s.includes(".") ? s : `${s}.0`; };

/** Blockbench's flip from editor space to Bedrock/Java animation space. */
function flip(channel: Channel, v: Vec3): Vec3 {
  if (channel === "position") return [neg(v[0]), v[1], v[2]].map(r) as Vec3;
  if (channel === "rotation") return [neg(v[0]), neg(v[1]), v[2]].map(r) as Vec3;
  return v.map(r) as Vec3;
}

/** Bedrock/GeckoLib animation file (format 1.8.0), as Blockbench's compileBedrockKeyframe writes it. */
export function toBedrockAnimations(model: EntityModel, anims: ModelAnimation[], modelId: string): Record<string, unknown> {
  const boneName = new Map(model.bones.map((b) => [b.id, b.name]));
  const animations: Record<string, unknown> = {};
  for (const a of anims) {
    const bones: Record<string, unknown> = {};
    for (const [boneId, track] of Object.entries(a.bones)) {
      const name = boneName.get(boneId);
      if (!name) continue;
      const channels: Record<string, unknown> = {};
      for (const ch of CHANNELS) {
        const kfs = [...track[ch]].sort((x, y) => x.time - y.time);
        if (!kfs.length) continue;
        const frames: Record<string, unknown> = {};
        kfs.forEach((k, i) => {
          const v = flip(ch, k.value);
          const prev = kfs[i - 1];
          if (k.interpolation === "catmullrom") frames[timeKey(k.time)] = { post: v, lerp_mode: "catmullrom" };
          else if (prev && prev.interpolation === "step") frames[timeKey(k.time)] = { pre: flip(ch, prev.value), post: v };
          else frames[timeKey(k.time)] = v;
        });
        channels[ch] = frames;
      }
      bones[name] = channels;
    }
    const entry: Record<string, unknown> = {};
    if (a.loop === "loop") entry.loop = true;
    else if (a.loop === "hold") entry.loop = "hold_on_last_frame";
    entry.animation_length = r(a.length);
    entry.bones = bones;
    animations[`animation.${modelId}.${a.name}`] = entry;
  }
  return { format_version: "1.8.0", animations };
}

type Frame = number[] | { pre?: number[]; post?: number[]; lerp_mode?: string } | number;

/** Reads Bedrock/GeckoLib animation JSON back (bones matched by name). */
export function fromBedrockAnimations(json: unknown, model: EntityModel): { animations: ModelAnimation[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: ModelAnimation[] = [];
  const root = json && typeof json === "object" ? (json as Record<string, unknown>).animations : undefined;
  if (!root || typeof root !== "object") throw new Error("No \"animations\" in this file.");
  const boneByName = new Map(model.bones.map((b) => [b.name, b.id]));
  for (const [fullName, raw] of Object.entries(root as Record<string, Record<string, unknown>>)) {
    const name = fullName.split(".").pop() || fullName;
    const loop: LoopMode = raw.loop === true ? "loop" : raw.loop === "hold_on_last_frame" ? "hold" : "once";
    let anim = makeAnimation(name, { loop, length: Number(raw.animation_length) || 0 });
    for (const [bone, channels] of Object.entries((raw.bones ?? {}) as Record<string, Record<string, unknown>>)) {
      const boneId = boneByName.get(bone);
      if (!boneId) { warnings.push(`Animation "${name}": bone "${bone}" isn't in this model — skipped.`); continue; }
      for (const ch of CHANNELS) {
        const data = channels[ch];
        if (data === undefined) continue;
        const frames: [number, Frame][] = Array.isArray(data) || typeof data === "number" ? [[0, data as Frame]] : Object.entries(data as Record<string, Frame>).map(([t, f]) => [Number(t), f]);
        for (const [t, f] of frames) {
          let v: unknown = f, interp: Interpolation = "linear";
          if (f && typeof f === "object" && !Array.isArray(f)) {
            v = f.post ?? f.pre;
            if (f.lerp_mode === "catmullrom") interp = "catmullrom";
          }
          const arr = typeof v === "number" ? [v, v, v] : Array.isArray(v) ? v.map((n) => (typeof n === "number" ? n : Number(n))) : null;
          if (!arr || arr.some((n) => Number.isNaN(n))) { warnings.push(`Animation "${name}": Molang expressions aren't supported — a ${ch} keyframe on "${bone}" was skipped.`); continue; }
          anim = setKeyframe(anim, boneId, ch, t, flip(ch, arr as Vec3), interp);
        }
      }
    }
    if (!anim.length) anim = { ...anim, length: Math.max(0.05, ...Object.values(anim.bones).flatMap((tr) => CHANNELS.flatMap((c) => tr[c].map((k) => k.time)))) };
    out.push(anim);
  }
  return { animations: out, warnings };
}

const jf = (n: number) => { const x = r(n); return `${Number.isInteger(x) ? x.toFixed(1) : String(x)}F`; };
const javaIdent = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");

/** One vanilla AnimationDefinition as data (values already in Java space, steps expanded). */
export interface JavaAnimation {
  name: string;
  length: number;
  looping: boolean;
  channels: { bone: string; target: Channel; keyframes: { time: number; x: number; y: number; z: number; interpolation: "linear" | "catmullrom" }[] }[];
}

/**
 * Animations in vanilla AnimationDefinition terms — Blockbench's "mojang" template conversion
 * (rotation X/Y and position X flipped; a step keyframe becomes an extra linear key 1ms before
 * the next one). Values are the arguments of KeyframeAnimations.degreeVec/posVec/scaleVec. Used by
 * the Java exporter and the runtime manifest. The API is identical in 1.21.1 and 26.x.
 */
export function javaAnimations(model: EntityModel, anims: ModelAnimation[]): JavaAnimation[] {
  const boneName = new Map(model.bones.map((b) => [b.id, javaIdent(b.name)]));
  return anims.map((a) => {
    const channels: JavaAnimation["channels"] = [];
    for (const [boneId, track] of Object.entries(a.bones)) {
      const name = boneName.get(boneId);
      if (!name) continue;
      for (const ch of CHANNELS) {
        const kfs = [...track[ch]].sort((x, y) => x.time - y.time);
        if (!kfs.length) continue;
        const keyframes: JavaAnimation["channels"][number]["keyframes"] = [];
        const add = (t: number, v: Vec3, interp: Interpolation) => {
          const [x, y, z] = flip(ch, v);
          keyframes.push({ time: r(t), x, y, z, interpolation: interp === "catmullrom" ? "catmullrom" : "linear" });
        };
        kfs.forEach((k, i) => {
          add(k.time, k.value, k.interpolation);
          if (k.interpolation === "step" && kfs[i + 1]) add(kfs[i + 1].time - 0.001, k.value, "linear");
        });
        channels.push({ bone: name, target: ch, keyframes });
      }
    }
    return { name: a.name, length: r(a.length), looping: a.loop === "loop", channels };
  });
}

/** Java class with one AnimationDefinition constant per animation (see javaAnimations). */
export function toJavaAnimations(model: EntityModel, anims: ModelAnimation[], className: string): string {
  const vecFn: Record<Channel, string> = { rotation: "degreeVec", position: "posVec", scale: "scaleVec" };
  const target: Record<Channel, string> = { rotation: "ROTATION", position: "POSITION", scale: "SCALE" };
  const defs = javaAnimations(model, anims).map((a) => {
    const channels = a.channels.map((c) => {
      const keys = c.keyframes.map((k) => `new Keyframe(${jf(k.time)}, KeyframeAnimations.${vecFn[c.target]}(${jf(k.x)}, ${jf(k.y)}, ${jf(k.z)}), AnimationChannel.Interpolations.${k.interpolation === "catmullrom" ? "CATMULLROM" : "LINEAR"})`);
      return `.addAnimation("${c.bone}", new AnimationChannel(AnimationChannel.Targets.${target[c.target]},\n\t\t\t${keys.join(",\n\t\t\t")}\n\t\t))`;
    });
    return `\tpublic static final AnimationDefinition ${javaIdent(a.name).toUpperCase()} = AnimationDefinition.Builder.withLength(${jf(a.length)})${a.looping ? ".looping()" : ""}\n\t\t${channels.join("\n\t\t")}\n\t\t.build();`;
  });
  return `// Made with MC Screen Designer — vanilla keyframe animations (Minecraft 1.21.1 and 26.x)

import net.minecraft.client.animation.AnimationChannel;
import net.minecraft.client.animation.AnimationDefinition;
import net.minecraft.client.animation.Keyframe;
import net.minecraft.client.animation.KeyframeAnimations;

public class ${className} {
${defs.join("\n\n")}
}
`;
}

/** .bbmodel "animations" array (bone animators keyed by the group uuids `uuidOf` assigns). */
export function toBbmodelAnimations(anims: ModelAnimation[], model: EntityModel, uuidOf: (id: string) => string): Record<string, unknown>[] {
  const boneName = new Map(model.bones.map((b) => [b.id, b.name]));
  return anims.map((a) => ({
    uuid: uuidOf(a.id), name: `animation.${a.name}`, loop: a.loop, override: false, length: r(a.length), snapping: 24,
    selected: false, anim_time_update: "", blend_weight: "", start_delay: "", loop_delay: "",
    animators: Object.fromEntries(Object.entries(a.bones).filter(([b]) => boneName.has(b)).map(([boneId, track]) => [uuidOf(boneId), {
      name: boneName.get(boneId), type: "bone",
      keyframes: CHANNELS.flatMap((ch) => track[ch].map((k) => ({
        channel: ch, data_points: [{ x: r(k.value[0]), y: r(k.value[1]), z: r(k.value[2]) }],
        uuid: uuidOf(k.id), time: r(k.time), color: -1, interpolation: k.interpolation,
      }))),
    }])),
  }));
}

/** Reads .bbmodel animations; `boneByUuid` maps the file's group uuids to imported bone ids. */
export function fromBbmodelAnimations(raw: unknown, boneByUuid: Map<string, string>): ModelAnimation[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a) => a && typeof a === "object").map((a: Record<string, unknown>) => {
    const name = String(a.name ?? "animation").replace(/^animation\./, "").split(".").pop() || "animation";
    const loop: LoopMode = a.loop === "loop" || a.loop === "hold" ? a.loop : "once";
    let anim = makeAnimation(name, { loop, length: Number(a.length) || 1 });
    for (const [uuid, animator] of Object.entries((a.animators ?? {}) as Record<string, Record<string, unknown>>)) {
      const boneId = boneByUuid.get(uuid);
      if (!boneId || !Array.isArray(animator.keyframes)) continue;
      for (const kf of animator.keyframes as Record<string, unknown>[]) {
        const ch = kf.channel as Channel;
        if (!CHANNELS.includes(ch)) continue;
        const dp = Array.isArray(kf.data_points) ? (kf.data_points[0] as Record<string, unknown>) : undefined;
        if (!dp) continue;
        const v = [dp.x, dp.y, dp.z].map((n) => Number(n));
        if (v.some((n) => Number.isNaN(n))) continue;
        const interp = kf.interpolation === "catmullrom" || kf.interpolation === "step" ? kf.interpolation : "linear";
        anim = setKeyframe(anim, boneId, ch, Number(kf.time) || 0, v as Vec3, interp);
      }
    }
    return { ...anim, length: Number(a.length) || anim.length };
  });
}
