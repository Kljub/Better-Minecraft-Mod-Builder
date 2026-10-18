import JSZip from "jszip";
import type { ElementSpec } from "./elements/types";
import type { EntityModel } from "./model3d/types";
import { toBedrockGeo, sanitizeBoneNames } from "./model3d/codecs";
import { toBedrockAnimations } from "./model3d/animation";
import { entitySettingsOf } from "./elements/modelKind";

/**
 * Bedrock Edition add-on (.mcaddon) for the project's custom mobs: a behavior pack (entity with
 * health/speed/attack/AI components, spawn rules) and a resource pack (client entity, geometry,
 * animations, texture, names, spawn egg colours). Geometry/animations come from the same
 * converters as the Bedrock/GeckoLib downloads.
 *
 * Bedrock has no data-driven custom damage types: melee attacks use the vanilla entity_attack cause.
 */

export interface AddonEntity {
  spec: ElementSpec;
  /** PNG of the entity texture, if available */
  texture?: Blob;
}

/** Deterministic UUID (v4 layout) from a string — re-exports keep the same pack identity. */
export function stableUuid(seed: string): string {
  const bytes = new Uint8Array(16);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < 16; i++) {
    for (const ch of `${seed}#${i}`) {
      h1 = Math.imul(h1 ^ ch.charCodeAt(0), 16777619) >>> 0;
      h2 = Math.imul(h2 + ch.charCodeAt(0), 2246822519) >>> 0;
    }
    bytes[i] = (h1 ^ (h2 >>> (i % 24))) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const json = (v: unknown) => JSON.stringify(v, null, 2);
const num = (s: Record<string, unknown>, k: string, d: number) => (typeof s[k] === "number" && Number.isFinite(s[k]) ? (s[k] as number) : d);
const str = (s: Record<string, unknown>, k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");

function manifest(name: string, description: string, uuid: string, moduleType: "data" | "resources", dependency?: string): string {
  return json({
    format_version: 2,
    header: { name, description, uuid, version: [1, 0, 0], min_engine_version: [1, 21, 0] },
    modules: [{ type: moduleType, uuid: stableUuid(`${uuid}:module`), version: [1, 0, 0] }],
    ...(dependency ? { dependencies: [{ uuid: dependency, version: [1, 0, 0] }] } : {}),
  });
}

const BIOME_TAGS: Record<string, string> = {
  "#minecraft:is_overworld": "overworld", "#minecraft:is_nether": "nether", "#minecraft:is_end": "the_end",
  "#minecraft:is_ocean": "ocean", "#minecraft:is_forest": "forest", "#minecraft:is_jungle": "jungle",
  "#minecraft:is_mountain": "mountain", "#minecraft:is_river": "river", "#minecraft:is_taiga": "taiga",
  "#minecraft:is_savanna": "savanna", "#minecraft:is_badlands": "mesa", "#minecraft:is_beach": "beach",
};

const POPULATION: Record<string, string> = {
  monster: "monster", creature: "animal", ambient: "ambient", water_creature: "water_animal", water_ambient: "water_animal", misc: "animal",
};

/** Behavior-pack entity: Java "behavior" presets mapped to Bedrock components. */
export function behaviorEntity(modId: string, spec: ElementSpec): Record<string, unknown> {
  const s = entitySettingsOf(spec);
  const id = `${modId}:${spec.id}`;
  const behavior = str(s, "behavior") || "passive";
  const hostile = behavior === "hostile_melee";
  const fights = hostile || behavior === "neutral";
  const water = str(s, "mobCategory").startsWith("water");
  const xp = Math.max(0, Math.round(num(s, "xpReward", 5)));
  const components: Record<string, unknown> = {
    "minecraft:type_family": { family: [spec.id, "mob", ...(str(s, "mobCategory") === "monster" ? ["monster"] : [])] },
    "minecraft:health": { value: num(s, "maxHealth", 20), max: num(s, "maxHealth", 20) },
    "minecraft:collision_box": { width: num(s, "hitboxWidth", 0.6), height: num(s, "hitboxHeight", 1.8) },
    "minecraft:movement": { value: behavior === "stationary" ? 0 : num(s, "movementSpeed", 0.25) },
    "minecraft:physics": {},
    "minecraft:pushable": { is_pushable: true, is_pushable_by_piston: true },
    "minecraft:breathable": water ? { breathes_water: true, breathes_air: false } : { breathes_air: true, breathes_water: false, suffocate_time: 0 },
    "minecraft:nameable": {},
    "minecraft:experience_reward": { on_death: `query.last_hit_by_player ? ${xp} : 0` },
    "minecraft:behavior.float": { priority: 0 },
    "minecraft:behavior.look_at_player": { priority: 7, look_distance: 6, probability: 0.02 },
    "minecraft:behavior.random_look_around": { priority: 8 },
    ...(water
      ? { "minecraft:navigation.swim": { can_swim: true, can_walk: false, can_breach: true }, "minecraft:movement.basic": {}, "minecraft:underwater_movement": { value: num(s, "movementSpeed", 0.25) } }
      : { "minecraft:navigation.walk": { can_walk: true, avoid_water: true, can_pass_doors: true, can_open_doors: false }, "minecraft:movement.basic": {}, "minecraft:jump.static": {}, "minecraft:can_climb": {} }),
  };
  if (num(s, "knockbackResistance", 0) > 0) components["minecraft:knockback_resistance"] = { value: Math.min(1, num(s, "knockbackResistance", 0)) };
  if (s.fireImmune === true) components["minecraft:fire_immune"] = {};
  if (str(s, "mobCategory") === "monster") components["minecraft:despawn"] = { despawn_from_distance: {} };
  if (behavior !== "stationary") components["minecraft:behavior.random_stroll"] = { priority: 6, speed_multiplier: water ? 1 : 0.8 };
  if (behavior === "passive") components["minecraft:behavior.panic"] = { priority: 1, speed_multiplier: 1.25 };
  if (fights) {
    components["minecraft:attack"] = { damage: num(s, "attackDamage", 3) };
    components["minecraft:behavior.melee_attack"] = { priority: 3, speed_multiplier: 1, track_target: true };
    components["minecraft:behavior.hurt_by_target"] = { priority: 1 };
    components["minecraft:follow_range"] = { value: num(s, "followRange", 16), max: num(s, "followRange", 16) };
  }
  if (hostile) {
    components["minecraft:behavior.nearest_attackable_target"] = {
      priority: 2, must_see: true, reselect_targets: true,
      entity_types: [{ filters: { test: "is_family", subject: "other", value: "player" }, max_dist: num(s, "followRange", 16) }],
    };
  }
  return {
    format_version: "1.21.0",
    "minecraft:entity": {
      description: { identifier: id, is_spawnable: s.spawnEgg !== false, is_summonable: true, is_experimental: false },
      components,
    },
  };
}

/** Spawn rules for natural spawning (only when enabled in Settings). */
export function spawnRules(modId: string, spec: ElementSpec): Record<string, unknown> | null {
  const s = entitySettingsOf(spec);
  if (s.naturalSpawn !== true) return null;
  const category = str(s, "mobCategory") || "creature";
  const biomeTag = BIOME_TAGS[str(s, "spawnBiomes").trim()] ?? "overworld";
  const min = Math.max(1, Math.round(num(s, "spawnMin", 1)));
  const condition: Record<string, unknown> = {
    "minecraft:weight": { default: Math.max(1, Math.round(num(s, "spawnWeight", 10))) },
    "minecraft:herd": { min_size: min, max_size: Math.max(min, Math.round(num(s, "spawnMax", 3))) },
    "minecraft:biome_filter": { test: "has_biome_tag", value: biomeTag },
  };
  if (category.startsWith("water")) condition["minecraft:spawns_underwater"] = {};
  else condition["minecraft:spawns_on_surface"] = {};
  if (category === "creature") condition["minecraft:brightness_filter"] = { min: 7, max: 15, adjust_for_weather: false };
  if (category === "monster") {
    condition["minecraft:spawns_underground"] = {};
    condition["minecraft:brightness_filter"] = { min: 0, max: 7, adjust_for_weather: true };
    condition["minecraft:difficulty_filter"] = { min: "easy", max: "hard" };
  }
  return {
    format_version: "1.8.0",
    "minecraft:spawn_rules": {
      description: { identifier: `${modId}:${spec.id}`, population_control: POPULATION[category] ?? "animal" },
      conditions: [condition],
    },
  };
}

/** Resource-pack client entity; animations play by query like vanilla mobs. */
export function clientEntity(modId: string, spec: ElementSpec): Record<string, unknown> {
  const s = entitySettingsOf(spec);
  const model = spec as unknown as EntityModel;
  const names = new Set((model.animations ?? []).map((a) => a.name));
  const animations: Record<string, string> = {};
  const animate: Record<string, string>[] = [];
  const add = (role: string, name: string, query: string) => {
    if (!name || !names.has(name)) return;
    animations[role] = `animation.${spec.id}.${name}`;
    animate.push({ [role]: query });
  };
  add("idle", str(s, "idleAnimation"), "!query.is_moving");
  add("walk", str(s, "walkAnimation"), "query.modified_move_speed");
  add("attack", str(s, "attackAnimation"), "variable.attack_time > 0");
  return {
    format_version: "1.10.0",
    "minecraft:client_entity": {
      description: {
        identifier: `${modId}:${spec.id}`,
        materials: { default: "entity_alphatest" },
        textures: { default: `textures/entity/${spec.id}` },
        geometry: { default: `geometry.${spec.id}` },
        ...(Object.keys(animations).length ? { animations, scripts: { animate } } : {}),
        render_controllers: ["controller.render.default"],
        ...(s.spawnEgg !== false ? { spawn_egg: { base_color: str(s, "eggPrimary") || "#5a8f3c", overlay_color: str(s, "eggSecondary") || "#2d4a1e" } } : {}),
      },
    },
  };
}

/** Builds the .mcaddon zip (behavior + resource pack folders). */
export async function buildBedrockAddon(opts: { modId: string; packName: string; entities: AddonEntity[] }): Promise<Blob> {
  const { modId, packName, entities } = opts;
  const zip = new JSZip();
  const bpUuid = stableUuid(`${modId}:behavior`);
  const rpUuid = stableUuid(`${modId}:resources`);
  const bp = zip.folder(`${packName}_BP`)!;
  const rp = zip.folder(`${packName}_RP`)!;
  bp.file("manifest.json", manifest(`${packName} Behavior Pack`, `Mobs from ${modId} (MC Screen Designer)`, bpUuid, "data", rpUuid));
  rp.file("manifest.json", manifest(`${packName} Resource Pack`, `Mobs from ${modId} (MC Screen Designer)`, rpUuid, "resources"));
  const lang: string[] = [];
  for (const { spec, texture } of entities) {
    const model = sanitizeBoneNames(spec as unknown as EntityModel);
    const s = entitySettingsOf(spec);
    const name = str(s, "displayName").trim() || spec.id;
    bp.file(`entities/${spec.id}.json`, json(behaviorEntity(modId, spec)));
    const rules = spawnRules(modId, spec);
    if (rules) bp.file(`spawn_rules/${spec.id}.json`, json(rules));
    rp.file(`entity/${spec.id}.entity.json`, json(clientEntity(modId, spec)));
    rp.file(`models/entity/${spec.id}.geo.json`, json(toBedrockGeo(model, { identifier: spec.id })));
    if (model.animations?.length) rp.file(`animations/${spec.id}.animation.json`, json(toBedrockAnimations(model, model.animations, spec.id)));
    if (texture) rp.file(`textures/entity/${spec.id}.png`, await texture.arrayBuffer());
    lang.push(`entity.${modId}:${spec.id}.name=${name}`, `item.spawn_egg.entity.${modId}:${spec.id}.name=${name} Spawn Egg`);
  }
  rp.file("texts/en_US.lang", lang.join("\n") + "\n");
  rp.file("texts/languages.json", json(["en_US"]));
  return zip.generateAsync({ type: "blob" });
}
