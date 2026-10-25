/**
 * Item Skin Generator + Claude / Codex / Ollama vision: an uploaded picture is described and
 * turned into one prompt for the texture model ("skinDescribe"), and generated textures are rated
 * against the request and the picture ("skinQuality"). Both run as structured tasks through
 * app/api/ai/generate; the answers are validated here, never trusted as-is.
 */
export type SkinVisionTarget = "item" | "player";

export interface SkinDescription {
  /** what the picture shows, a few sentences */
  description: string;
  /** main colours as #rrggbb */
  colors: string[];
  /** the prompt for the texture model, with everything the picture shows */
  prompt: string;
}

export interface SkinRating {
  /** 1-based candidate number as sent */
  index: number;
  /** 0 … 10 */
  score: number;
  verdict: "good" | "ok" | "bad";
  issues: string;
}

export interface SkinQuality {
  ratings: SkinRating[];
  /** 1-based number of the best candidate, 0 if none is usable */
  best: number;
  summary: string;
}

export interface SkinVisionContext {
  target: SkinVisionTarget;
  /** quality check: a reference picture is the first image */
  hasReference?: boolean;
  /** quality check: number of candidates */
  count?: number;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

const MODEL_NOTES: Record<SkinVisionTarget, string> = {
  item: [
    "The texture model is yuuki14202028/minecraft-item-16px, a Stable Diffusion fine-tune on 16×16 Minecraft item textures.",
    "Its prompts are English, \"<material/colour> <object>\" first (e.g. \"glowing molten iron sword\", \"emerald key\"), optionally followed",
    "by comma-separated details. No full sentences, no style words like \"pixel art\", \"16x16\", \"minecraft\" or \"icon\" (the model",
    "adds those itself), no backgrounds, one object only.",
  ].join(" "),
  player: [
    "The texture model is monadical-labs/minecraft-skin-generator-sdxl, which turns a short character description into a 64×64",
    "Minecraft player skin. Prompts are one short English phrase about the character's look, e.g. \"a knight in golden armor\",",
    "\"a wizard in a blue robe\", \"a robot with a red visor\" — clothing, colours, distinctive features; no poses or backgrounds.",
  ].join(" "),
};

export const SKIN_DESCRIBE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["description", "colors", "prompt"],
  properties: {
    description: { type: "string" },
    colors: { type: "array", items: { type: "string" } },
    prompt: { type: "string" },
  },
} as const;

export function skinDescribeSystem(target: SkinVisionTarget): string {
  return [
    `You help create Minecraft ${target === "player" ? "player skins" : "item textures"} from a reference picture the user uploaded.`,
    "Look at the attached picture carefully, then reply ONLY with the structured JSON:",
    `- description: 2–4 sentences on what it shows that matters for a ${target === "player" ? "skin" : "16×16 item texture"} — the`,
    "  object/character, its shape and silhouette, materials, main colours, distinctive details. Write it in the language of the",
    "  user's note if there is one, otherwise English.",
    "- colors: the 2–6 main colours as #rrggbb.",
    "- prompt: ONE prompt for the texture model (always English) that carries all the information that matters for the look:",
    "  object, material, main colours, shape and the distinctive details, as \"<material/colour> <object>, <detail>, <detail> …\",",
    "  most important first, at most ~30 words.",
    MODEL_NOTES[target],
  ].join("\n");
}

export function skinDescribePrompt(note: string, target: SkinVisionTarget): string {
  return `Make the ${target === "player" ? "player skin" : "item texture"} prompt for the attached picture.${note ? `\nUser's note: ${note}` : ""}`;
}

export function validateSkinDescription(raw: unknown): SkinDescription {
  const r = (raw ?? {}) as Partial<Record<keyof SkinDescription, unknown>>;
  const prompt = clip(r.prompt, 300).replace(/\s+/g, " ");
  if (!prompt) throw new Error("The AI answer contained no prompt");
  const colors = (Array.isArray(r.colors) ? r.colors : []).filter((c): c is string => typeof c === "string" && HEX.test(c)).slice(0, 8);
  return { description: clip(r.description, 1200), colors, prompt };
}

export const SKIN_QUALITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ratings", "best", "summary"],
  properties: {
    ratings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "score", "verdict", "issues"],
        properties: {
          index: { type: "integer" },
          score: { type: "number" },
          verdict: { type: "string", enum: ["good", "ok", "bad"] },
          issues: { type: "string" },
        },
      },
    },
    best: { type: "integer" },
    summary: { type: "string" },
  },
} as const;

export function skinQualitySystem(target: SkinVisionTarget): string {
  return [
    `You are the quality check for AI-generated Minecraft ${target === "player" ? "64×64 player skins (shown as the raw skin texture layout)" : "16×16 item textures (shown enlarged, one block per texture pixel)"}.`,
    "Rate every candidate image (numbered as labelled) and reply ONLY with the structured JSON:",
    "- ratings: one entry per candidate: index (its number), score 0–10, verdict (good ≥ 7, ok 4–6, bad ≤ 3) and issues — one short",
    "  sentence on what's wrong or what's good, in the language of the user's request.",
    "- best: the number of the best candidate, 0 if none is usable. summary: one sentence overall.",
    "Judge: does it clearly show what was asked (and look like the reference picture, if one is given — object, silhouette, colours)?",
    target === "player"
      ? "Is it a usable skin: face on the head's front, body/arms/legs coherent, no noise or garbage areas, clean colours?"
      : "Is it a clean item sprite: one readable object, centred, sensible silhouette with a dark outline, transparent background,"
        + " consistent shading and light from the top-left, no stray pixels or noise, Minecraft-like palette?",
    "Be strict — the user will only keep the good ones.",
  ].join("\n");
}

export function skinQualityPrompt(request: string, ctx: SkinVisionContext): string {
  return [
    `Request: ${request || "(none)"}`,
    ctx.hasReference ? "The first image is the user's reference picture; the candidates follow it." : "There's no reference picture.",
    `Candidates: ${ctx.count ?? "?"}.`,
  ].join("\n");
}

export function validateSkinQuality(raw: unknown, count: number): SkinQuality {
  const r = (raw ?? {}) as { ratings?: unknown; best?: unknown; summary?: unknown };
  const seen = new Set<number>();
  const ratings = (Array.isArray(r.ratings) ? r.ratings : []).flatMap((x): SkinRating[] => {
    const e = (x ?? {}) as Record<string, unknown>;
    const index = typeof e.index === "number" ? Math.round(e.index) : NaN;
    if (!(index >= 1 && index <= count) || seen.has(index)) return [];
    seen.add(index);
    const score = typeof e.score === "number" && Number.isFinite(e.score) ? Math.max(0, Math.min(10, Math.round(e.score * 10) / 10)) : 0;
    const verdict = e.verdict === "good" || e.verdict === "ok" || e.verdict === "bad" ? e.verdict : score >= 7 ? "good" : score >= 4 ? "ok" : "bad";
    return [{ index, score, verdict, issues: clip(e.issues, 300) }];
  });
  if (!ratings.length) throw new Error("The AI answer contained no ratings");
  const best = typeof r.best === "number" && r.best >= 1 && r.best <= count && seen.has(Math.round(r.best)) ? Math.round(r.best) : 0;
  return { ratings, best, summary: clip(r.summary, 400) };
}

export function sanitizeSkinVisionContext(raw: unknown): SkinVisionContext {
  const c = (raw ?? {}) as Partial<SkinVisionContext>;
  return {
    target: c.target === "player" ? "player" : "item",
    hasReference: c.hasReference === true,
    count: typeof c.count === "number" && Number.isFinite(c.count) ? Math.max(1, Math.min(8, Math.round(c.count))) : 1,
  };
}
