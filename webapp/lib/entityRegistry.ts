import type { EntityBodyTemplate, EntityCuboid, EntityGeometry, EntitySpec } from "./types";

export const GEOMETRY_DEFAULT: EntityGeometry = {
  textureWidth: 64,
  textureHeight: 64,
  cuboids: [],
};

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
  useCustomModel: false,
  geometry: GEOMETRY_DEFAULT,
};

let cuboidSeq = 0;

export function newCuboidId(): string {
  return `cuboid_${++cuboidSeq}_${Date.now()}`;
}

function uniqueCuboidName(existing: EntityCuboid[]): string {
  const names = new Set(existing.map((c) => c.name));
  let name = "box_1";
  for (let i = 1; names.has(name); i++) name = `box_${i + 1}`;
  return name;
}

/** A sane starting box (8x8x8 model units — half a block — at the origin), auto-named uniquely
 * among the given existing cuboids so Java part names never collide. */
export function newCuboid(existing: EntityCuboid[]): EntityCuboid {
  return {
    id: newCuboidId(),
    name: uniqueCuboidName(existing),
    position: [-4, 0, -4],
    size: [8, 8, 8],
    rotation: [0, 0, 0],
    uv: [0, 0],
    mirror: false,
  };
}

export const BODY_TEMPLATE_OPTIONS: EntityBodyTemplate[] = ["zombie", "skeleton", "spider", "creeper"];

export const BODY_TEMPLATE_LABELS: Record<EntityBodyTemplate, string> = {
  zombie: "Zombie (humanoid)",
  skeleton: "Skeleton (humanoid, ranged)",
  spider: "Spider (octoped)",
  creeper: "Creeper (blocky, no limbs)",
};

export const MOB_CATEGORY_OPTIONS = ["monster", "creature", "ambient", "misc"];
