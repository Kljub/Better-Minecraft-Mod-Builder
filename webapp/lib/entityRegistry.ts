import type { EntityBodyTemplate, EntitySpec } from "./types";

export const ENTITY_DEFAULT: Omit<EntitySpec, "id"> = {
  displayName: "New Entity",
  bodyTemplate: "zombie",
  texture: "",
  mobCategory: "monster",
  maxHealth: 20,
  movementSpeed: 0.23,
  attackDamage: 3,
  hitboxWidth: 0.6,
  hitboxHeight: 1.95,
  fireImmune: false,
  spawnEggPrimaryColor: "#3c8527",
  spawnEggSecondaryColor: "#1a381a",
  creativeTab: "SPAWN_EGGS",
};

export const BODY_TEMPLATE_OPTIONS: EntityBodyTemplate[] = ["zombie", "skeleton", "spider", "creeper"];

export const BODY_TEMPLATE_LABELS: Record<EntityBodyTemplate, string> = {
  zombie: "Zombie (humanoid)",
  skeleton: "Skeleton (humanoid, ranged)",
  spider: "Spider (octoped)",
  creeper: "Creeper (blocky, no limbs)",
};

export const MOB_CATEGORY_OPTIONS = ["monster", "creature", "ambient", "misc"];
