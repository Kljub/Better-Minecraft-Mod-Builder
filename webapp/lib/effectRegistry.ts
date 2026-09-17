import type { EffectSpec } from "./types";
import type { PropField } from "./widgetRegistry";

export const EFFECT_DEFAULT: Omit<EffectSpec, "id"> = {
  displayName: "New Effect",
  category: "neutral",
  color: "#a0a0a0",
  icon: "",
  isInstant: false,
  particle: "",
  soundOnAdded: "",
};

export const EFFECT_PROPERTY_SCHEMA: PropField[] = [
  { key: "displayName", label: "Display Name", type: "text", defaultValue: "New Effect" },
  { key: "category", label: "Category", type: "select", options: ["beneficial", "harmful", "neutral"], defaultValue: "neutral" },
];

// Curated real vanilla SimpleParticleType ids — verified via javap/bytecode against this
// project's actual game jar, not guessed. Not exhaustive (vanilla has far more), just a
// reasonable spread of particles that suit an ambient effect swirl.
export const EFFECT_PARTICLE_OPTIONS = [
  "", "minecraft:witch", "minecraft:glow", "minecraft:soul", "minecraft:portal", "minecraft:sneeze",
  "minecraft:infested", "minecraft:crit", "minecraft:heart", "minecraft:note", "minecraft:smoke",
  "minecraft:flame", "minecraft:poof",
];
export const EFFECT_PARTICLE_LABELS: Record<string, string> = {
  "": "Default (color-tinted swirl)",
  "minecraft:witch": "Witch",
  "minecraft:glow": "Glow",
  "minecraft:soul": "Soul",
  "minecraft:portal": "Portal",
  "minecraft:sneeze": "Sneeze",
  "minecraft:infested": "Infested (bugs)",
  "minecraft:crit": "Crit sparkle",
  "minecraft:heart": "Heart",
  "minecraft:note": "Music note",
  "minecraft:smoke": "Smoke",
  "minecraft:flame": "Flame",
  "minecraft:poof": "Poof",
};

// Curated vanilla sound ids suited to "played once when the effect is added" — free-typeable via
// ItemIdField's datalist, so any other valid sound id still works, this is just a starting point.
export const EFFECT_ADD_SOUND_OPTIONS = [
  "minecraft:entity.generic.drink", "minecraft:entity.player.levelup", "minecraft:entity.experience_orb.pickup",
  "minecraft:block.beacon.activate", "minecraft:entity.witch.drink", "minecraft:entity.evoker.cast_spell",
];

// Curated vanilla effect keys — namespaced, for the Potion effect-entry picker (a Potion's
// effects list can mix these with project-defined EffectSpec ids).
export const VANILLA_EFFECT_OPTIONS = [
  "minecraft:speed", "minecraft:slowness", "minecraft:haste", "minecraft:mining_fatigue",
  "minecraft:strength", "minecraft:instant_health", "minecraft:instant_damage", "minecraft:jump_boost",
  "minecraft:nausea", "minecraft:regeneration", "minecraft:resistance", "minecraft:fire_resistance",
  "minecraft:water_breathing", "minecraft:invisibility", "minecraft:blindness", "minecraft:night_vision",
  "minecraft:hunger", "minecraft:weakness", "minecraft:poison", "minecraft:wither", "minecraft:health_boost",
  "minecraft:absorption", "minecraft:saturation", "minecraft:levitation", "minecraft:luck", "minecraft:unluck",
  "minecraft:slow_falling", "minecraft:conduit_power", "minecraft:dolphins_grace", "minecraft:bad_omen",
  "minecraft:hero_of_the_village", "minecraft:darkness",
];
