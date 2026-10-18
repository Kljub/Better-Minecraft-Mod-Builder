import type { EntityModel, ModelBone, ModelCube, Vec3 } from "./types";
import { makeBone, makeCube } from "./geometry";
import { javaParts, type JavaPart } from "./codecs";

/**
 * Custom 3D armor models, in the bone convention of FabricExtras' ArmorModelAPI
 * (https://github.com/FabricExtras/ArmorModelAPI, MIT): each top-level `armor*` bone follows one
 * part of the wearer's skeleton and belongs to one armor piece. Decorative bones go *under* one of
 * them. The same model exports as an ArmorModelAPI-ready `geo/<id>.geo.json` and as the parts
 * neoforge-runtime's own armor renderer builds (ArmorModels.java).
 */
export type ArmorSlot = "head" | "chest" | "legs" | "feet";
/** vanilla HumanoidModel part a bone is attached to */
export type HumanoidAnchor = "head" | "body" | "right_arm" | "left_arm" | "right_leg" | "left_leg";

export const ARMOR_BONES: Record<string, { anchor: HumanoidAnchor; slot: ArmorSlot; pivot: Vec3; label: string }> = {
  armorHead: { anchor: "head", slot: "head", pivot: [0, 24, 0], label: "Helmet" },
  armorBody: { anchor: "body", slot: "chest", pivot: [0, 24, 0], label: "Chestplate · body" },
  armorRightArm: { anchor: "right_arm", slot: "chest", pivot: [5, 22, 0], label: "Chestplate · right arm" },
  armorLeftArm: { anchor: "left_arm", slot: "chest", pivot: [-5, 22, 0], label: "Chestplate · left arm" },
  armorWaist: { anchor: "body", slot: "legs", pivot: [0, 12, 0], label: "Leggings · waist" },
  armorRightLeg: { anchor: "right_leg", slot: "legs", pivot: [1.9, 12, 0], label: "Leggings · right leg" },
  armorLeftLeg: { anchor: "left_leg", slot: "legs", pivot: [-1.9, 12, 0], label: "Leggings · left leg" },
  armorRightBoot: { anchor: "right_leg", slot: "feet", pivot: [1.9, 12, 0], label: "Boots · right" },
  armorLeftBoot: { anchor: "left_leg", slot: "feet", pivot: [-1.9, 12, 0], label: "Boots · left" },
};

/**
 * Starting point: the vanilla armor shapes (outer layer inflated 1, leggings 0.5) with every piece
 * on its own area of one 64×64 texture. (+X is the wearer's right, as in the entity editor.)
 */
export function armorTemplate(): EntityModel {
  const bones: ModelBone[] = [];
  const cubes: ModelCube[] = [];
  const bone = (name: keyof typeof ARMOR_BONES) => {
    const b = makeBone({ name, origin: [...ARMOR_BONES[name].pivot] as Vec3 });
    bones.push(b);
    return b.id;
  };
  const cube = (boneId: string, name: string, from: Vec3, to: Vec3, uv: [number, number], inflate: number, mirror = false) =>
    cubes.push(makeCube({ name, bone: boneId, from, to, uvOffset: uv, inflate, mirror }));

  cube(bone("armorHead"), "helmet", [-4, 24, -4], [4, 32, 4], [0, 0], 1);
  cube(bone("armorBody"), "chestplate", [-4, 12, -2], [4, 24, 2], [16, 16], 1);
  cube(bone("armorRightArm"), "right_pauldron", [4, 12, -2], [8, 24, 2], [40, 16], 1);
  cube(bone("armorLeftArm"), "left_pauldron", [-8, 12, -2], [-4, 24, 2], [40, 16], 1, true);
  cube(bone("armorWaist"), "waist", [-4, 12, -2], [4, 17, 2], [16, 32], 0.5);
  cube(bone("armorRightLeg"), "right_legging", [-0.1, 0, -2], [3.9, 12, 2], [0, 32], 0.5);
  cube(bone("armorLeftLeg"), "left_legging", [-3.9, 0, -2], [0.1, 12, 2], [0, 32], 0.5, true);
  cube(bone("armorRightBoot"), "right_boot", [-0.1, 0, -2], [3.9, 6, 2], [0, 16], 1);
  cube(bone("armorLeftBoot"), "left_boot", [-3.9, 0, -2], [0.1, 6, 2], [0, 16], 1, true);
  return { textureWidth: 64, textureHeight: 64, texture: "", bones, cubes, animations: [] };
}

/** Top-level armor bone a bone belongs to (itself or an ancestor), or null for a stray bone. */
function armorRoot(model: EntityModel, boneId: string | null): ModelBone | null {
  let b = boneId ? model.bones.find((x) => x.id === boneId) : undefined;
  while (b) {
    if (!b.parent) return ARMOR_BONES[b.name] ? b : null;
    b = model.bones.find((x) => x.id === b!.parent);
  }
  return null;
}

/** Problems that would make the armor render wrong (or ArmorModelAPI refuse the file). */
export function validateArmorModel(model: EntityModel): string[] {
  const problems: string[] = [];
  if (!model.texture) problems.push("The 3D armor model has no texture.");
  const roots = model.bones.filter((b) => !b.parent);
  const stray = roots.filter((b) => !ARMOR_BONES[b.name]);
  if (stray.length) problems.push(`Top-level bones must be armor bones (${Object.keys(ARMOR_BONES).join(", ")}) — move ${stray.map((b) => `"${b.name}"`).join(", ")} under one of them.`);
  if (model.cubes.some((c) => !c.bone || !armorRoot(model, c.bone))) problems.push("Some cubes aren't inside an armor bone and won't render.");
  if (model.cubes.some((c) => !c.boxUv)) problems.push("Armor models support box UV only (per-face UV isn't supported by ArmorModelAPI or the runtime).");
  const dupes = roots.map((b) => b.name).filter((n, i, a) => a.indexOf(n) !== i);
  if (dupes.length) problems.push(`Armor bone used twice: ${[...new Set(dupes)].join(", ")}.`);
  return problems;
}

/** What neoforge-runtime needs: Java-space parts (see javaParts) plus each armor bone's anchor/slot. */
export interface ArmorRuntimeModel {
  texture: string;
  textureWidth: number;
  textureHeight: number;
  parts: JavaPart[];
  /** top-level part name → where it attaches and which piece draws it */
  anchors: Record<string, { anchor: HumanoidAnchor; slot: ArmorSlot }>;
}

export function armorRuntimeModel(model: EntityModel, armorId: string): ArmorRuntimeModel {
  const parts = javaParts(model);
  const anchors: ArmorRuntimeModel["anchors"] = {};
  for (const p of parts) {
    const def = !p.parent ? ARMOR_BONES[p.name] : undefined;
    if (def) anchors[p.name] = { anchor: def.anchor, slot: def.slot };
  }
  return { texture: `textures/armor/${armorId}.png`, textureWidth: model.textureWidth, textureHeight: model.textureHeight, parts, anchors };
}
