import { Cuboid } from "lucide-react";
import type { ElementKindDef, ElementSpec } from "./types";
import { emptyModel } from "@/lib/model3d/geometry";
import { javaParts } from "@/lib/model3d/codecs";
import { javaAnimations } from "@/lib/model3d/animation";
import type { EntityModel } from "@/lib/model3d/types";
import { defaultEntitySettings } from "./entitySettings";
import { spawnEggPng } from "@/lib/png";

/**
 * Entity Models — a custom mob: its cuboid model + animations (Design / Animation tabs, edited
 * in the 3D ModelEditor via `customEditor`) and its game settings (Settings tab, stored as
 * `entity`). Exports the texture, spawn egg, names, natural-spawn biome modifier and one
 * `entities` runtime manifest entry that neoforge-runtime turns into a real EntityType with this
 * exact model, its keyframe animations, stats, AI and damage type.
 */
const json = (v: unknown) => JSON.stringify(v, null, 2);
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function entitySettingsOf(spec: ElementSpec): Record<string, unknown> {
  return { ...defaultEntitySettings(), ...((spec.entity as Record<string, unknown>) ?? {}) };
}

const settingStr = (s: Record<string, unknown>, k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
const settingNum = (s: Record<string, unknown>, k: string, d: number) => (typeof s[k] === "number" && Number.isFinite(s[k]) ? (s[k] as number) : d);
const displayName = (spec: ElementSpec) => settingStr(entitySettingsOf(spec), "displayName").trim() || titleCase(spec.id);

export const ENTITY_MODEL: ElementKindDef = {
  kind: "entityModel",
  label: "Entity model",
  plural: "Entity Models",
  icon: Cuboid,
  idPrefix: "model",
  description: "A custom mob: 3D model, animations and in-game settings.",
  customEditor: "model",
  defaults: () => ({ ...emptyModel(), animations: [], entity: defaultEntitySettings() }),
  fields: [],
  thumb: (spec) => (typeof spec.texture === "string" && spec.texture ? spec.texture : undefined),
  textures: (spec) => (typeof spec.texture === "string" && spec.texture ? [spec.texture] : []),
  validate: (spec) => {
    const model = spec as unknown as EntityModel;
    const s = entitySettingsOf(spec);
    const problems: string[] = [];
    if (!model.texture) problems.push("No texture — the mob will render with Minecraft's missing-texture pattern.");
    if (!model.cubes.length) problems.push("The model has no cubes.");
    if (model.cubes.some((c) => !c.boxUv)) problems.push("Java entity models only support box UV — cubes with per-face UV use their UV offset instead.");
    const names = new Set((model.animations ?? []).map((a) => a.name));
    for (const k of ["idleAnimation", "walkAnimation", "attackAnimation"]) {
      const n = settingStr(s, k);
      if (n && !names.has(n)) problems.push(`Settings → ${titleCase(k.replace("Animation", ""))} animation "${n}" doesn't exist.`);
    }
    return problems;
  },
  files: (spec, { modId, mcVersion, texture }) => {
    const model = spec as unknown as EntityModel;
    const s = entitySettingsOf(spec);
    const out = [];
    const tex = model.texture ? texture(model.texture) : undefined;
    if (tex) out.push({ path: `assets/${modId}/textures/entity/${spec.id}.png`, content: tex });
    if (s.spawnEgg !== false) {
      const egg = `${spec.id}_spawn_egg`;
      out.push({ path: `assets/${modId}/models/item/${egg}.json`, content: json({ parent: "minecraft:item/generated", textures: { layer0: `${modId}:item/${egg}` } }) });
      if (mcVersion !== "1.21.1") out.push({ path: `assets/${modId}/items/${egg}.json`, content: json({ model: { type: "minecraft:model", model: `${modId}:item/${egg}` } }) });
      const png = spawnEggPng(settingStr(s, "eggPrimary") || "#5a8f3c", settingStr(s, "eggSecondary") || "#2d4a1e");
      out.push({ path: `assets/${modId}/textures/item/${egg}.png`, content: new Blob([png as BlobPart], { type: "image/png" }) });
    }
    if (s.naturalSpawn === true) {
      out.push({
        path: `data/${modId}/neoforge/biome_modifier/${spec.id}_spawns.json`,
        content: json({
          type: "neoforge:add_spawns",
          biomes: settingStr(s, "spawnBiomes").trim() || "#minecraft:is_overworld",
          spawners: {
            type: `${modId}:${spec.id}`,
            weight: Math.max(1, Math.round(settingNum(s, "spawnWeight", 10))),
            minCount: Math.max(1, Math.round(settingNum(s, "spawnMin", 1))),
            maxCount: Math.max(Math.round(settingNum(s, "spawnMin", 1)), Math.round(settingNum(s, "spawnMax", 3))),
          },
        }),
      });
    }
    return out;
  },
  shared: (spec, { modId }) => {
    const model = spec as unknown as EntityModel;
    const s = entitySettingsOf(spec);
    const name = displayName(spec);
    return {
      lang: {
        [`entity.${modId}.${spec.id}`]: name,
        ...(s.spawnEgg !== false ? { [`item.${modId}.${spec.id}_spawn_egg`]: `${name} Spawn Egg` } : {}),
      },
      manifest: {
        entities: {
          id: spec.id,
          displayName: name,
          texture: `textures/entity/${spec.id}.png`,
          textureWidth: model.textureWidth,
          textureHeight: model.textureHeight,
          parts: javaParts(model),
          animations: javaAnimations(model, model.animations ?? []),
          mobCategory: settingStr(s, "mobCategory") || "creature",
          behavior: settingStr(s, "behavior") || "passive",
          maxHealth: settingNum(s, "maxHealth", 20),
          movementSpeed: settingNum(s, "movementSpeed", 0.25),
          attackDamage: settingNum(s, "attackDamage", 3),
          armor: settingNum(s, "armor", 0),
          knockbackResistance: settingNum(s, "knockbackResistance", 0),
          followRange: settingNum(s, "followRange", 16),
          hitboxWidth: settingNum(s, "hitboxWidth", 0.6),
          hitboxHeight: settingNum(s, "hitboxHeight", 1.8),
          damageType: settingStr(s, "damageType") || "minecraft:mob_attack",
          xpReward: Math.round(settingNum(s, "xpReward", 5)),
          fireImmune: s.fireImmune === true,
          spawnEgg: s.spawnEgg !== false,
          naturalSpawn: s.naturalSpawn === true,
          idleAnimation: settingStr(s, "idleAnimation"),
          walkAnimation: settingStr(s, "walkAnimation"),
          attackAnimation: settingStr(s, "attackAnimation"),
        },
      },
    };
  },
};
