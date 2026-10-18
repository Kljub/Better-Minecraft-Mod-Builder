import { fromBbmodel, fromBedrockGeo } from "./codecs";
import { describeModel } from "./aiOps";

/**
 * A reference model for the Entity Model Generator: an existing Blockbench .bbmodel or a
 * GeckoLib / Bedrock .geo.json, summarised for the AI in the same coordinates the mc-designer
 * tools use (describeModel), plus its embedded texture (bbmodel) to send along as an image.
 */
export interface ReferenceModel {
  name: string;
  /** compact JSON for the prompt */
  summary: string;
  bones: number;
  cubes: number;
  textureDataUrl?: string;
}

const MAX_SUMMARY = 60_000;

export function parseReferenceModel(text: string, fileName: string): ReferenceModel {
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("Not a JSON model file."); }
  const isBb = !!json && typeof json === "object" && "meta" in (json as object);
  const result = isBb ? fromBbmodel(json) : fromBedrockGeo(json);
  if (!result.model.cubes.length) throw new Error("The model has no cubes.");
  const described = describeModel(result.model) as { animations?: { name: string }[] } & Record<string, unknown>;
  // Keyframes would only bloat the prompt — names are enough to say what exists.
  const compact = { ...described, animations: (described.animations ?? []).map((a) => a.name) };
  let summary = JSON.stringify(compact);
  if (summary.length > MAX_SUMMARY) summary = `${summary.slice(0, MAX_SUMMARY)}… (truncated)`;
  return {
    name: fileName.replace(/\.(bbmodel|json)$/i, ""),
    summary,
    bones: result.model.bones.length,
    cubes: result.model.cubes.length,
    textureDataUrl: result.textureDataUrl,
  };
}
