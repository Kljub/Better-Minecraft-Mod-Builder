/**
 * Minecraft versions the generators can target. Datapack/model formats differ between them
 * (attribute ids, painting variants, enchantable tags, Java model API) — every exporter that
 * cares takes the project's version. Formats were checked against each version's own client jar.
 */
export const MC_VERSIONS = ["1.21.1", "26.2"] as const;
export type McVersion = (typeof MC_VERSIONS)[number];
export const DEFAULT_MC_VERSION: McVersion = "26.2";

export const MC_VERSION_LABELS: Record<McVersion, string> = {
  "1.21.1": "1.21.1",
  "26.2": "26.2 (26.x)",
};

export function normalizeMcVersion(v: unknown): McVersion {
  return (MC_VERSIONS as readonly unknown[]).includes(v) ? (v as McVersion) : DEFAULT_MC_VERSION;
}

/** Attributes that lived under "player." (rest under "generic.") before 1.21.2 dropped the prefixes. */
const PLAYER_ATTRIBUTES = new Set([
  "block_break_speed", "block_interaction_range", "entity_interaction_range", "mining_efficiency",
  "sneaking_speed", "submerged_mining_speed", "sweeping_damage_ratio",
]);

/** Full attribute id for a version, from its 26.x name ("movement_speed"). */
export function attributeId(name: string, version: McVersion): string {
  if (version !== "1.21.1") return `minecraft:${name}`;
  return `minecraft:${PLAYER_ATTRIBUTES.has(name) ? "player" : "generic"}.${name}`;
}
