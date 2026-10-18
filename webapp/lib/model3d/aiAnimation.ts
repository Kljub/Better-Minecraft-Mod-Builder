import type { EntityModel, Vec3 } from "./types";
import { CHANNELS, makeAnimation, setKeyframe, type Channel, type Interpolation, type LoopMode, type ModelAnimation } from "./animation";

/**
 * "Edit this animation with Claude/Codex" (Animation tab): the animation goes to the AI by bone
 * NAME with its keyframes, the AI answers with the complete new animation in the same shape
 * (JSON Schema below, strict-mode compatible), and it's turned back into a ModelAnimation —
 * unknown bones dropped, numbers clamped. Used by the API task (app/api/ai/tasks.ts) and the editor.
 */
export interface AiKeyframe { t: number; x: number; y: number; z: number; i: Interpolation }
export interface AiChannel { bone: string; channel: Channel; keyframes: AiKeyframe[] }
export interface AiAnimation { name: string; length: number; loop: LoopMode; channels: AiChannel[] }

export interface AnimationAiContext {
  /** skeleton: name, parent, pivot (px, +Y up, the mob faces -Z) and cube extents per bone */
  bones: { name: string; parent: string | null; pivot: Vec3; size: Vec3 | null }[];
  /** the animation being edited (null = make a new one) */
  animation: AiAnimation | null;
  /** other animations' names (to avoid clashes) */
  others: string[];
}

const LOOPS: LoopMode[] = ["loop", "once", "hold"];
const INTERPS: Interpolation[] = ["linear", "catmullrom", "step"];
const r = (n: number, p = 1000) => Math.round(n * p) / p;

export function animationToAi(model: EntityModel, anim: ModelAnimation): AiAnimation {
  const names = new Map(model.bones.map((b) => [b.id, b.name]));
  const channels: AiChannel[] = [];
  for (const [boneId, track] of Object.entries(anim.bones)) {
    const bone = names.get(boneId);
    if (!bone) continue;
    for (const ch of CHANNELS) {
      if (!track[ch].length) continue;
      channels.push({ bone, channel: ch, keyframes: track[ch].map((k) => ({ t: r(k.time), x: r(k.value[0], 100), y: r(k.value[1], 100), z: r(k.value[2], 100), i: k.interpolation })) });
    }
  }
  return { name: anim.name, length: r(anim.length), loop: anim.loop, channels };
}

export function animationContext(model: EntityModel, anim: ModelAnimation | null): AnimationAiContext {
  const names = new Map(model.bones.map((b) => [b.id, b.name]));
  return {
    bones: model.bones.map((b) => {
      const cubes = model.cubes.filter((c) => c.bone === b.id);
      const size: Vec3 | null = cubes.length
        ? [0, 1, 2].map((a) => r(Math.max(...cubes.map((c) => c.to[a])) - Math.min(...cubes.map((c) => c.from[a])), 10)) as Vec3
        : null;
      return { name: b.name, parent: b.parent ? names.get(b.parent) ?? null : null, pivot: b.origin.map((v) => r(v, 10)) as Vec3, size };
    }),
    animation: anim ? animationToAi(model, anim) : null,
    others: (model.animations ?? []).filter((a) => a.id !== anim?.id).map((a) => a.name),
  };
}

/** Validated AI answer → ModelAnimation (keeps `base`'s id so selection/export names stay put). */
export function aiToAnimation(model: EntityModel, ai: AiAnimation, base: ModelAnimation | null): ModelAnimation {
  const byName = new Map(model.bones.map((b) => [b.name, b.id]));
  const length = Math.min(60, Math.max(0.05, Number.isFinite(ai.length) ? ai.length : base?.length ?? 1));
  let anim = makeAnimation(base?.name ?? (ai.name || "animation").replace(/\s+/g, "_"), {
    ...(base ? { id: base.id } : {}),
    length: r(length),
    loop: LOOPS.includes(ai.loop) ? ai.loop : base?.loop ?? "loop",
    bones: {},
  });
  for (const ch of ai.channels ?? []) {
    const boneId = byName.get(ch.bone);
    if (!boneId || !CHANNELS.includes(ch.channel)) continue;
    const limit = ch.channel === "rotation" ? 360 : ch.channel === "position" ? 64 : 8;
    for (const k of ch.keyframes ?? []) {
      if (![k.t, k.x, k.y, k.z].every((v) => typeof v === "number" && Number.isFinite(v))) continue;
      const v = [k.x, k.y, k.z].map((n) => Math.max(-limit, Math.min(limit, n))) as Vec3;
      anim = setKeyframe(anim, boneId, ch.channel, Math.min(length, Math.max(0, k.t)), v, INTERPS.includes(k.i) ? k.i : "linear");
    }
  }
  return anim;
}

export const ANIMATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "length", "loop", "channels"],
  properties: {
    name: { type: "string" },
    length: { type: "number" },
    loop: { type: "string", enum: LOOPS },
    channels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["bone", "channel", "keyframes"],
        properties: {
          bone: { type: "string" },
          channel: { type: "string", enum: CHANNELS },
          keyframes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["t", "x", "y", "z", "i"],
              properties: { t: { type: "number" }, x: { type: "number" }, y: { type: "number" }, z: { type: "number" }, i: { type: "string", enum: INTERPS } },
            },
          },
        },
      },
    },
  },
} as const;

export const ANIMATION_SYSTEM = [
  "You edit keyframe animations of Minecraft entity models (Blockbench / Bedrock / GeckoLib conventions) for a mod editor.",
  "Reply ONLY with the structured JSON: the COMPLETE resulting animation (every channel you keep, not a diff).",
  "",
  "Conventions:",
  "- Values are offsets on the rest pose. rotation: degrees [x, y, z]; position: pixels (16 px = 1 block); scale: factor (1 = unchanged).",
  "- +Y is up; the mob faces north (-Z). Rotation +X swings a hanging arm/leg FORWARD (towards the face), -X swings it back;",
  "  SIGN WARNING: this is the OPPOSITE of vanilla Java code (zombie arms xRot = -90°) and of Bedrock/GeckoLib files — never carry",
  "  those signs over. Arms raised straight forward here = rotation [90, 0, 0]; attacks and raised arms use POSITIVE X.",
  "  a head pitches DOWN with -X and up with +X; Y turns left/right; Z rolls sideways. Position -Z moves forward.",
  "- t is seconds from 0 to length. A looping animation should end where it starts (same values at 0 and at length).",
  "- i: \"catmullrom\" for smooth organic motion, \"linear\" for mechanical moves, \"step\" for instant snaps.",
  "- Only use bone names from the skeleton. Children inherit their parent's motion, so animate the highest bone that should move.",
  "- Walk cycles: legs swing about ±30–45° on X in opposite phase, arms opposite to the legs. Idle: subtle (±2–6°, body scale 1→1.02).",
  "  Attacks: quick wind-up then snap forward, 0.3–0.8 s, loop \"once\". Keep it within what the joints could plausibly do.",
  "- Keep the name and length unless the request asks to change them.",
].join("\n");

export function animationPrompt(request: string, ctx: AnimationAiContext): string {
  const skeleton = ctx.bones.map((b) => `- ${b.name}${b.parent ? ` (child of ${b.parent})` : ""}: pivot [${b.pivot.join(", ")}]${b.size ? `, size [${b.size.join(", ")}]` : ""}`).join("\n");
  const current = ctx.animation
    ? `Current animation:\n${JSON.stringify(ctx.animation)}`
    : `There is no animation yet — create a new one. Existing names: ${ctx.others.join(", ") || "(none)"}.`;
  return `Skeleton (bones):\n${skeleton}\n\n${current}\n\nRequest: ${request}`;
}

/** Light structural check of the AI's answer (full clamping happens in aiToAnimation). */
export function validateAiAnimation(raw: unknown): AiAnimation {
  const a = raw as Partial<AiAnimation> | null;
  if (!a || !Array.isArray(a.channels)) throw new Error("AI answer had no channels");
  const channels = a.channels.slice(0, 200).filter((c) => c && typeof c.bone === "string" && CHANNELS.includes(c.channel) && Array.isArray(c.keyframes))
    .map((c) => ({ bone: c.bone, channel: c.channel, keyframes: c.keyframes.slice(0, 200) }));
  if (!channels.length) throw new Error("AI answer contained no usable channels");
  return { name: typeof a.name === "string" ? a.name.slice(0, 64) : "animation", length: Number(a.length) || 1, loop: LOOPS.includes(a.loop as LoopMode) ? (a.loop as LoopMode) : "loop", channels };
}
