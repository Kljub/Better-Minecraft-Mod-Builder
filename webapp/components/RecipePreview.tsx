"use client";

import React from "react";
import type { RecipeSpec } from "@/lib/types";
import { RECIPE_TYPE_LABELS } from "@/lib/recipeRegistry";

function shortLabel(id: string): string {
  return id.split(":").pop() ?? id;
}

/** Simple centerpiece for the currently selected Recipe — a 3x3 grid preview for shaped, a chip
 * list for everything else, arrow to the result. No real item-icon rendering (out of scope). */
export default function RecipePreview({ recipe }: { recipe: RecipeSpec | null }) {
  if (!recipe) {
    return <div className="text-sm text-muted-foreground italic">Select or add a recipe.</div>;
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {recipe.type === "shaped" ? (
        <div className="grid grid-cols-3 gap-0.5">
          {(recipe.grid ?? new Array(9).fill(null)).map((cell, i) => (
            <div
              key={i}
              className="flex items-center justify-center rounded border border-input bg-[#8b8b8b] text-[8px] text-white/90"
              style={{ width: 28, height: 28 }}
              title={cell ?? ""}
            >
              {cell ? shortLabel(cell).slice(0, 4) : ""}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-1 max-w-48">
          {(recipe.type === "shapeless" ? (recipe.ingredients ?? []) : [recipe.ingredient ?? ""]).filter(Boolean).map((ing, i) => (
            <div
              key={i}
              className="flex items-center justify-center rounded border border-input bg-[#8b8b8b] text-[8px] text-white/90"
              style={{ width: 28, height: 28 }}
              title={ing}
            >
              {shortLabel(ing).slice(0, 4)}
            </div>
          ))}
        </div>
      )}
      <div className="text-lg text-muted-foreground">↓</div>
      <div
        className="flex items-center justify-center rounded border border-input bg-[#8b8b8b] text-[9px] text-white/90"
        style={{ width: 32, height: 32 }}
      >
        {shortLabel(recipe.resultItem).slice(0, 5)}
      </div>
      <div className="text-sm font-medium">{shortLabel(recipe.resultItem)} ×{recipe.resultCount}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{RECIPE_TYPE_LABELS[recipe.type]}</div>
    </div>
  );
}
