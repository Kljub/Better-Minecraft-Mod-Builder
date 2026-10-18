import { Shapes } from "lucide-react";
import type { ElementKindDef, ElementSpec, GeneratedFile } from "./types";
import type { AiRig } from "@/lib/model3d/aiRig";
import type { ModelAnimation } from "@/lib/model3d/animation";
import { cachedMeshPack, type MeshPack } from "@/lib/model3d/meshPackStore";
import { spawnEggPng } from "@/lib/png";

/**
 * Mesh Models — a real 3D mesh (STL, OBJ, GLB/glTF, FBX, 3MF) used in game as it is, through
 * NeoForge's OBJ model loader, instead of being rebuilt from cubes:
 *  - item / block: the whole mesh as the item's / block's model;
 *  - entity: a mob whose rig (the file's skeleton, or bones the AI sets) moves rigid mesh parts,
 *    with the file's / AI's animations — registered by neoforge-runtime's EntitySpecs like the
 *    cube mobs (manifest `entities`, parts carry a `mesh` item model), rendered by its mesh layer.
 * The converted data lives in a mesh pack (lib/model3d/meshPack*), stored outside the project JSON.
 */
export interface MeshModelValue {
  /** structure-store key of the uploaded file */
  source: string;
  fileName: string;
  /** structure-store key of the built mesh pack */
  pack: string;
  target: MeshPack["target"];
  up: "y" | "z";
  turns: number;
  /** entity height in blocks */
  height: number;
  rig: "file" | "ai" | "none";
  aiRig?: AiRig;
  aiRigHeight?: number;
  aiAnimations?: ModelAnimation[];
  /** the file has a skeleton */
  skeleton: boolean;
  /** inputs the current pack was built from (rebuild when they change) */
  built: string;
}

export const emptyMeshValue = (): MeshModelValue => ({
  source: "", fileName: "", pack: "", target: "entity", up: "y", turns: 0, height: 2, rig: "none", skeleton: false, built: "",
});

export function meshValue(spec: ElementSpec): MeshModelValue {
  const v = spec.mesh as Partial<MeshModelValue> | undefined;
  return { ...emptyMeshValue(), ...(v && typeof v === "object" ? v : {}) };
}

/** What the pack depends on — a changed signature means the pack must be rebuilt. */
export function meshBuildSignature(v: MeshModelValue): string {
  return JSON.stringify([v.source, v.target, v.up, v.turns, v.height, v.rig, v.aiRig ?? null, v.aiRigHeight ?? null, v.aiAnimations ?? null]);
}

const json = (v: unknown) => JSON.stringify(v, null, 2);
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const str = (s: ElementSpec, k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
const num = (s: ElementSpec, k: string, d: number) => (typeof s[k] === "number" && Number.isFinite(s[k]) ? (s[k] as number) : d);
const isEntity = (s: ElementSpec) => meshValue(s).target === "entity";
const isBlock = (s: ElementSpec) => meshValue(s).target === "block";
const displayName = (spec: ElementSpec) => str(spec, "name").trim() || titleCase(spec.id);

function base64Blob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

/** Typical block-like display transforms, so an OBJ item looks right in hand, GUI and frames. */
const ITEM_DISPLAY = {
  gui: { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] },
  ground: { rotation: [0, 0, 0], translation: [0, 3, 0], scale: [0.25, 0.25, 0.25] },
  fixed: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [0.5, 0.5, 0.5] },
  thirdperson_righthand: { rotation: [75, 45, 0], translation: [0, 2.5, 0], scale: [0.375, 0.375, 0.375] },
  firstperson_righthand: { rotation: [0, 45, 0], translation: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
  firstperson_lefthand: { rotation: [0, 225, 0], translation: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
};

/** First clip whose name matches, for the idle/walk/attack defaults. */
function clipLike(pack: MeshPack, re: RegExp): string {
  return pack.clips.find((c) => re.test(c)) ?? "";
}

export const MESH_MODEL: ElementKindDef = {
  kind: "meshModel",
  label: "Mesh model",
  plural: "Mesh Models",
  icon: Shapes,
  idPrefix: "mesh",
  description:
    "A real 3D model (STL, OBJ, GLB/glTF, FBX, 3MF) used in game as it is — no cubes. As an item or block it's the whole mesh; as an entity the AI " +
    "(or the file's own skeleton) sets the bones, the mesh moves as rigid parts like a vanilla mob, with the file's or AI animations. Needs Minecraft 26.x.",
  labelField: "name",
  binaryFiles: (spec) => [meshValue(spec).source, meshValue(spec).pack].filter(Boolean),
  defaults: () => ({
    name: "", mesh: emptyMeshValue(),
    mobCategory: "creature", behavior: "passive", maxHealth: 20, movementSpeed: 0.25, attackDamage: 3, armor: 0,
    hitboxWidth: 0, hitboxHeight: 0, spawnEgg: true, eggPrimary: "#5a8f3c", eggSecondary: "#2d4a1e",
    idleAnimation: "", walkAnimation: "", attackAnimation: "", hardness: 1.5,
  }),
  fields: [
    { key: "name", label: "Name", type: "text" },
    { key: "mesh", label: "3D model", type: "meshModel" },
    {
      key: "mobCategory", label: "Category", type: "select", half: true, when: isEntity,
      options: [
        { value: "creature", label: "Creature" }, { value: "monster", label: "Monster" }, { value: "ambient", label: "Ambient" },
        { value: "water_creature", label: "Water creature" }, { value: "misc", label: "Misc" },
      ],
    },
    {
      key: "behavior", label: "Behaviour", type: "select", half: true, when: isEntity,
      options: [
        { value: "passive", label: "Passive (wanders)" }, { value: "neutral", label: "Neutral (fights back)" },
        { value: "hostile_melee", label: "Hostile (melee)" }, { value: "stationary", label: "Stationary" },
      ],
    },
    { key: "maxHealth", label: "Health", type: "number", min: 1, max: 1024, half: true, when: isEntity },
    { key: "movementSpeed", label: "Speed", type: "number", min: 0, max: 2, half: true, when: isEntity },
    { key: "attackDamage", label: "Attack damage", type: "number", min: 0, max: 1024, half: true, when: isEntity },
    { key: "armor", label: "Armor", type: "number", min: 0, max: 30, half: true, when: isEntity },
    { key: "hitboxWidth", label: "Hitbox width (0 = from model)", type: "number", min: 0, max: 16, half: true, when: isEntity },
    { key: "hitboxHeight", label: "Hitbox height (0 = from model)", type: "number", min: 0, max: 16, half: true, when: isEntity },
    { key: "idleAnimation", label: "Idle animation (empty = auto)", type: "text", mono: true, half: true, when: isEntity },
    { key: "walkAnimation", label: "Walk animation (empty = auto)", type: "text", mono: true, half: true, when: isEntity },
    { key: "attackAnimation", label: "Attack animation (empty = auto)", type: "text", mono: true, half: true, when: isEntity },
    { key: "spawnEgg", label: "Spawn egg", type: "boolean", when: isEntity },
    { key: "eggPrimary", label: "Egg colour", type: "color", half: true, when: (s) => isEntity(s) && s.spawnEgg !== false },
    { key: "eggSecondary", label: "Egg spots", type: "color", half: true, when: (s) => isEntity(s) && s.spawnEgg !== false },
    { key: "hardness", label: "Hardness", type: "number", min: 0, max: 100, half: true, when: isBlock },
  ],
  validate: (spec, { mcVersion }) => {
    const v = meshValue(spec);
    const problems: string[] = [];
    if (!v.source) problems.push("Upload a 3D model.");
    else if (!v.pack) problems.push("The model is still being converted — wait a moment.");
    if (mcVersion === "1.21.1") problems.push("Mesh models need Minecraft 26.x (item model definitions); 1.21.1 isn't supported.");
    const pack = cachedMeshPack(v.pack);
    if (pack && pack.triangles > 15000) problems.push(`${pack.triangles.toLocaleString("en")} triangles — heavy for Minecraft; keep models under ~15,000.`);
    if (v.target === "entity" && v.rig === "none" && v.source) problems.push("No bones — the mob can't animate. Let the AI rig it (or upload a GLB/FBX with a skeleton).");
    if (pack && v.target === "entity") {
      for (const k of ["idleAnimation", "walkAnimation", "attackAnimation"]) {
        const n = str(spec, k);
        if (n && !pack.clips.includes(n)) problems.push(`${titleCase(k.replace("Animation", ""))} animation "${n}" doesn't exist (available: ${pack.clips.join(", ") || "none"}).`);
      }
    }
    return problems;
  },
  files: (spec, { modId, mcVersion }) => {
    const v = meshValue(spec);
    const pack = cachedMeshPack(v.pack);
    if (!pack || mcVersion === "1.21.1") return [];
    const id = spec.id;
    const out: GeneratedFile[] = [];
    const slots = Object.keys(pack.textures);
    for (const slot of slots) out.push({ path: `assets/${modId}/textures/block/mesh/${id}/${slot}.png`, content: base64Blob(pack.textures[slot]) });
    out.push({ path: `assets/${modId}/models/mesh/${id}/mesh.mtl`, content: pack.mtl });
    const textures = Object.fromEntries([...slots.map((s) => [s, `${modId}:block/mesh/${id}/${s}`]), ["particle", `${modId}:block/mesh/${id}/${slots[0] ?? "white"}`]]);
    for (const [part, obj] of Object.entries(pack.meshes)) {
      out.push({ path: `assets/${modId}/models/mesh/${id}/${part}.obj`, content: obj });
      out.push({
        path: `assets/${modId}/models/mesh/${id}/${part}.json`,
        content: json({
          loader: "neoforge:obj", model: `${modId}:models/mesh/${id}/${part}.obj`,
          flip_v: false, automatic_culling: false, shade_quads: true, emissive_ambient: true,
          textures, ...(pack.target === "entity" ? {} : { display: ITEM_DISPLAY }),
        }),
      });
      if (pack.target === "entity") {
        // Each part is drawn as an item model (ItemStack with minecraft:item_model) by the mesh layer.
        out.push({ path: `assets/${modId}/items/mesh/${id}/${part}.json`, content: json({ model: { type: "minecraft:model", model: `${modId}:mesh/${id}/${part}` } }) });
      }
    }
    const modelRef = { model: { type: "minecraft:model", model: `${modId}:mesh/${id}/root` } };
    if (pack.target === "item") out.push({ path: `assets/${modId}/items/${id}.json`, content: json(modelRef) });
    if (pack.target === "block") {
      out.push({ path: `assets/${modId}/blockstates/${id}.json`, content: json({ variants: { "": { model: `${modId}:mesh/${id}/root` } } }) });
      out.push({ path: `assets/${modId}/items/${id}.json`, content: json(modelRef) });
      out.push({
        path: `data/${modId}/loot_table/blocks/${id}.json`,
        content: json({ type: "minecraft:block", pools: [{ rolls: 1, entries: [{ type: "minecraft:item", name: `${modId}:${id}` }], conditions: [{ condition: "minecraft:survives_explosion" }] }] }),
      });
    }
    if (pack.target === "entity") {
      if (spec.spawnEgg !== false) {
        const egg = `${id}_spawn_egg`;
        out.push({ path: `assets/${modId}/models/item/${egg}.json`, content: json({ parent: "minecraft:item/generated", textures: { layer0: `${modId}:item/${egg}` } }) });
        out.push({ path: `assets/${modId}/items/${egg}.json`, content: json({ model: { type: "minecraft:model", model: `${modId}:item/${egg}` } }) });
        const png = spawnEggPng(str(spec, "eggPrimary") || "#5a8f3c", str(spec, "eggSecondary") || "#2d4a1e");
        out.push({ path: `assets/${modId}/textures/item/${egg}.png`, content: new Blob([png as BlobPart], { type: "image/png" }) });
      }
      out.push({ path: `data/${modId}/loot_table/entities/${id}.json`, content: json({ type: "minecraft:entity", pools: [] }) });
    }
    return out;
  },
  shared: (spec, { modId, mcVersion }) => {
    const v = meshValue(spec);
    const pack = cachedMeshPack(v.pack);
    const name = displayName(spec);
    const id = spec.id;
    if (v.target === "item") return { lang: { [`item.${modId}.${id}`]: name }, manifest: pack && mcVersion !== "1.21.1" ? { mesh_models: { id, target: "item", displayName: name } } : undefined };
    if (v.target === "block") {
      const [w, h, d] = pack?.size ?? [1, 1, 1];
      // Collision/outline: the mesh's bounds inside the block (pixels), centred on X/Z.
      const box = { from: [8 - w * 8, 0, 8 - d * 8], to: [8 + w * 8, Math.min(16, h * 16), 8 + d * 8] };
      return {
        lang: { [`block.${modId}.${id}`]: name },
        manifest: pack && mcVersion !== "1.21.1" ? { mesh_models: { id, target: "block", displayName: name, hardness: num(spec, "hardness", 1.5), box } } : undefined,
      };
    }
    const lang = { [`entity.${modId}.${id}`]: name, ...(spec.spawnEgg !== false ? { [`item.${modId}.${id}_spawn_egg`]: `${name} Spawn Egg` } : {}) };
    if (!pack || mcVersion === "1.21.1") return { lang };
    const [w, h, d] = pack.size;
    const firstSlot = Object.keys(pack.textures)[0] ?? "white";
    return {
      lang,
      manifest: {
        entities: {
          id, displayName: name,
          texture: `textures/block/mesh/${id}/${firstSlot}.png`, textureWidth: 16, textureHeight: 16,
          parts: pack.parts.map((p) => (pack.meshes[p.name] ? { ...p, mesh: `${modId}:mesh/${id}/${p.name}` } : p)),
          animations: pack.animations,
          mobCategory: str(spec, "mobCategory") || "creature",
          behavior: str(spec, "behavior") || "passive",
          maxHealth: num(spec, "maxHealth", 20),
          movementSpeed: num(spec, "movementSpeed", 0.25),
          attackDamage: num(spec, "attackDamage", 3),
          armor: num(spec, "armor", 0),
          knockbackResistance: 0,
          followRange: 16,
          hitboxWidth: num(spec, "hitboxWidth", 0) || Math.round(Math.min(4, Math.max(0.3, Math.max(w, d) * 0.8)) * 100) / 100,
          hitboxHeight: num(spec, "hitboxHeight", 0) || Math.round(Math.min(8, Math.max(0.3, h)) * 100) / 100,
          damageType: "minecraft:mob_attack",
          xpReward: 5,
          fireImmune: false,
          spawnEgg: spec.spawnEgg !== false,
          naturalSpawn: false,
          idleAnimation: str(spec, "idleAnimation") || clipLike(pack, /idle|breath|stand/),
          walkAnimation: str(spec, "walkAnimation") || clipLike(pack, /walk|run|move|fly/),
          attackAnimation: str(spec, "attackAnimation") || clipLike(pack, /attack|hit|slash|strike|bite/),
          hurtDrops: [],
        },
      },
    };
  },
};
