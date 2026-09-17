"use client";

import React, { useState } from "react";
import type { RecipeSpec, ItemSpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, NumInput, PropSelect } from "@/components/SchemaFields";
import VisualItemField, { resolveEntryTextureKey } from "@/components/VisualItemField";
import TexturePickerModal from "@/components/TexturePickerModal";
import { useTextures } from "@/lib/TextureContext";
import { VANILLA_ITEM_OPTIONS } from "@/lib/vanillaItems";
import {
  RECIPE_TYPE_OPTIONS, RECIPE_TYPE_LABELS, COOKING_TYPES, SINGLE_INGREDIENT_TYPES,
  CRAFTING_CATEGORY_OPTIONS, COOKING_CATEGORY_OPTIONS, RECIPE_CATEGORY_LABELS,
} from "@/lib/recipeRegistry";

interface Props {
  recipe: RecipeSpec | null;
  items: ItemSpec[];
  modId: string;
  onUpdate: (patch: Partial<RecipeSpec>) => void;
}

/** "minecraft:dirt" -> "dirt" */
function bareId(id: string): string {
  return id.split(":").pop() ?? id;
}

/** Property form for the currently selected Recipe — pure datapack JSON, no Java needed. Shaped
 * recipes get a real 3x3 crafting-grid editor of clickable item icons (empty border rows/columns
 * are auto-trimmed by Minecraft at load time, so a fully blank grid is never invalid, just
 * meaningless) — icons rather than typed ids throughout, same "pick visually" idea as the
 * Dimension floor-layer picker. */
export default function RecipePropertyPanel({ recipe, items, modId, onUpdate }: Props) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [texPickerForCell, setTexPickerForCell] = useState<number | null>(null);

  if (!recipe) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select a recipe to edit its properties.
      </div>
    );
  }

  const itemOptions = [...VANILLA_ITEM_OPTIONS, ...items.map((i) => `${modId}:${i.id}`)];
  const grid = recipe.grid ?? new Array(9).fill(null);
  const setGridCell = (idx: number, v: string | null) => {
    const next = [...grid];
    next[idx] = v && v.trim() !== "" ? v.trim() : null;
    onUpdate({ grid: next });
  };
  const pickGridCell = (idx: number, key: string) => {
    const owning = items.find((it) => it.texture === key);
    setGridCell(idx, owning ? `${modId}:${owning.id}` : `minecraft:${bareId(key)}`);
    setTexPickerForCell(null);
  };
  const ingredients = recipe.ingredients ?? [];
  const setIngredients = (next: string[]) => onUpdate({ ingredients: next });
  const unlockItems = recipe.unlockItems ?? [];
  const setUnlockItems = (next: string[]) => onUpdate({ unlockItems: next });
  const isCrafting = recipe.type === "shaped" || recipe.type === "shapeless";
  const isCooking = COOKING_TYPES.includes(recipe.type);
  const categoryOptions = isCrafting ? CRAFTING_CATEGORY_OPTIONS : isCooking ? COOKING_CATEGORY_OPTIONS : null;

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Recipe</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={recipe.id} disabled />
      </Field>
      <Field label="Type">
        <PropSelect
          value={recipe.type}
          options={RECIPE_TYPE_OPTIONS}
          labels={RECIPE_TYPE_LABELS}
          onChange={(v) => onUpdate({ type: v as RecipeSpec["type"] })}
        />
      </Field>
      <div className="col-span-2">
        <Field label="Namespace (advanced — leave empty for this mod)">
          <Input
            className="h-6 text-xs px-1.5 font-mono"
            value={recipe.namespace ?? ""}
            placeholder={modId}
            onChange={(e) => onUpdate({ namespace: e.target.value })}
          />
        </Field>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Set to &quot;minecraft&quot; to override an existing vanilla recipe with the same ID instead of adding a new one.
        </p>
      </div>

      <Field label="Result item">
        <VisualItemField value={recipe.resultItem} onChange={(v) => onUpdate({ resultItem: v })} options={itemOptions} modId={modId} kind="item" entries={items} />
      </Field>
      <Field label="Result count">
        <NumInput value={recipe.resultCount} onChange={(v) => onUpdate({ resultCount: Math.max(1, Math.round(v)) })} />
      </Field>

      {recipe.type === "shaped" && (
        <div className="col-span-2">
          <div className="font-semibold text-muted-foreground mt-1">Crafting grid (3×3)</div>
          <div className="grid grid-cols-3 gap-1 w-32">
            {grid.map((cell, i) => {
              const texKey = cell ? resolveEntryTextureKey(cell, modId, "item", items) : "";
              const texUrl = cell ? packTextures[texKey] : undefined;
              return (
                <button
                  key={i}
                  type="button"
                  title={cell ? `${cell} — click to change` : "Empty — click to pick an item"}
                  onClick={() => setTexPickerForCell(i)}
                  className="relative h-9 w-9 overflow-hidden rounded border border-input bg-[#8b8b8b]"
                  style={{ imageRendering: "pixelated" }}
                >
                  {texUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={texUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", imageRendering: "pixelated" }} />
                  )}
                  {cell && (
                    <span
                      role="button"
                      title="Clear slot"
                      onClick={(e) => { e.stopPropagation(); setGridCell(i, null); }}
                      className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-input bg-background text-[8px] text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">Click a slot to pick an item/block visually. Leave empty for a blank slot.</p>
          <TexturePickerModal
            open={texPickerForCell !== null}
            packTextures={packTextures}
            current={texPickerForCell !== null && grid[texPickerForCell] ? resolveEntryTextureKey(grid[texPickerForCell]!, modId, "item", items) : ""}
            onSelect={(key) => { if (texPickerForCell !== null) pickGridCell(texPickerForCell, key); }}
            onClose={() => setTexPickerForCell(null)}
            onUpload={uploadCustomTexture}
          />
        </div>
      )}

      {recipe.type === "shapeless" && (
        <div className="col-span-2">
          <div className="font-semibold text-muted-foreground mt-1">Ingredients</div>
          {ingredients.length === 0 && <div className="text-[10px] text-muted-foreground italic">No ingredients yet.</div>}
          {ingredients.map((ing, i) => (
            <div key={i} className="flex items-center gap-1">
              <VisualItemField value={ing} onChange={(v) => setIngredients(ingredients.map((x, j) => j === i ? v : x))} options={itemOptions} modId={modId} kind="item" entries={items} />
              <button
                title="Remove"
                onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-destructive px-1"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="w-full rounded border border-dashed border-input py-0.5 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            onClick={() => setIngredients([...ingredients, itemOptions[0] ?? "minecraft:stick"])}
          >
            + Add ingredient
          </button>
        </div>
      )}

      {SINGLE_INGREDIENT_TYPES.includes(recipe.type) && (
        <Field label="Ingredient">
          <VisualItemField value={recipe.ingredient ?? ""} onChange={(v) => onUpdate({ ingredient: v })} options={itemOptions} modId={modId} kind="item" entries={items} />
        </Field>
      )}

      {recipe.type === "smithing" && (
        <>
          <div className="col-span-2 font-semibold text-muted-foreground mt-1">Smithing Table slots</div>
          <Field label="Upgrade template">
            <VisualItemField value={recipe.smithingTemplate ?? ""} onChange={(v) => onUpdate({ smithingTemplate: v })} options={itemOptions} modId={modId} kind="item" entries={items} />
          </Field>
          <Field label="Base item">
            <VisualItemField value={recipe.smithingBase ?? ""} onChange={(v) => onUpdate({ smithingBase: v })} options={itemOptions} modId={modId} kind="item" entries={items} />
          </Field>
          <Field label="Addition material">
            <VisualItemField value={recipe.smithingAddition ?? ""} onChange={(v) => onUpdate({ smithingAddition: v })} options={itemOptions} modId={modId} kind="item" entries={items} />
          </Field>
        </>
      )}

      {COOKING_TYPES.includes(recipe.type) && (
        <>
          <Field label="Experience">
            <NumInput value={recipe.experience ?? 0} onChange={(v) => onUpdate({ experience: v })} />
          </Field>
          <Field label="Cook time (ticks)">
            <NumInput value={recipe.cookingTime ?? 200} onChange={(v) => onUpdate({ cookingTime: Math.max(1, Math.round(v)) })} />
          </Field>
        </>
      )}

      {categoryOptions && (
        <>
          <Field label="Recipe book group">
            <Input
              className="h-6 text-xs px-1.5"
              value={recipe.group ?? ""}
              placeholder="(none)"
              onChange={(e) => onUpdate({ group: e.target.value })}
            />
          </Field>
          <Field label="Recipe book category">
            <PropSelect
              value={recipe.category ?? ""}
              options={categoryOptions}
              labels={RECIPE_CATEGORY_LABELS}
              onChange={(v) => onUpdate({ category: v })}
            />
          </Field>
        </>
      )}

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Items that unlock this recipe</div>
      {unlockItems.length === 0 && <div className="col-span-2 text-[10px] text-muted-foreground italic">Obtaining any of these unlocks it in the recipe book. None yet.</div>}
      {unlockItems.map((item, i) => (
        <div key={i} className="col-span-2 flex items-center gap-1">
          <VisualItemField value={item} onChange={(v) => setUnlockItems(unlockItems.map((x, j) => j === i ? v : x))} options={itemOptions} modId={modId} kind="item" entries={items} />
          <button
            title="Remove"
            onClick={() => setUnlockItems(unlockItems.filter((_, j) => j !== i))}
            className="shrink-0 text-muted-foreground hover:text-destructive px-1"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="col-span-2 w-full rounded border border-dashed border-input py-0.5 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        onClick={() => setUnlockItems([...unlockItems, itemOptions[0] ?? "minecraft:stick"])}
      >
        + Add unlock item
      </button>
    </div>
  );
}
