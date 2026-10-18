"use client";

import { useState } from "react";
import { Box, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModelEditor from "@/components/model3d/ModelEditor";
import { armorTemplate, validateArmorModel, ARMOR_BONES } from "@/lib/model3d/armorModel";
import type { ArmorSpec } from "@/lib/types";
import type { McVersion } from "@/lib/mcVersion";
import type { FieldContext } from "@/lib/elements/types";

/**
 * Armor editor shell: "Properties" (the existing ArmorPropertyPanel, passed as children) and
 * "3D model" — an optional custom armor model built in the Blockbench-style editor around a
 * see-through player, in ArmorModelAPI's bone convention (lib/model3d/armorModel.ts).
 */
export default function ArmorWorkspace({ armor, modId, mcVersion, fieldCtx, onUpdate, children }: {
  armor: ArmorSpec | null;
  modId: string;
  mcVersion: McVersion;
  fieldCtx: FieldContext;
  onUpdate: (patch: Partial<ArmorSpec>) => void;
  children: React.ReactNode;
}) {
  const [view, setView] = useState<"properties" | "model">("properties");
  if (!armor) return <>{children}</>;
  const model = armor.model ?? null;
  const problems = model ? validateArmorModel(model) : [];

  const tab = (v: typeof view, Icon: typeof Box, label: string) => (
    <button type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
      className={`flex h-9 items-center gap-1.5 border-b-2 px-3 text-xs font-medium ${view === v ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-testid="armor-workspace">
      <div className="flex shrink-0 items-center gap-1 border-b bg-sidebar px-2" role="tablist">
        {tab("properties", SlidersHorizontal, "Properties")}
        {tab("model", Box, model ? "3D model" : "3D model (off)")}
      </div>
      {view === "properties" ? (
        <div className="flex-1 overflow-y-auto p-4"><div className="mx-auto max-w-3xl">{children}</div></div>
      ) : !model ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
          <Box className="h-10 w-10 text-muted-foreground" />
          <p className="max-w-md text-muted-foreground">
            Give this armor its own 3D shape — spikes, plates, horns — instead of the flat vanilla layer. You start from the vanilla
            armor shapes around a player and model them like in Blockbench; the Skin tab paints the texture.
          </p>
          <Button onClick={() => onUpdate({ model: armorTemplate() })}>Create 3D armor model</Button>
          <p className="max-w-md text-[11px] text-muted-foreground">
            Exports as an ArmorModelAPI-compatible <code>geo/{armor.id}.geo.json</code> and renders with the NeoForge runtime.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>Bones: {Object.entries(ARMOR_BONES).map(([n, d]) => <span key={n} title={d.label} className="mr-1.5 font-mono">{n}</span>)}</span>
            {problems.map((p) => <span key={p} className="text-amber-300">⚠ {p}</span>)}
            <Button size="sm" variant="ghost" className="ml-auto h-6 gap-1 px-2 text-[11px] hover:text-destructive"
              onClick={() => { if (window.confirm("Remove the 3D model? The armor goes back to the flat vanilla layer.")) onUpdate({ model: null }); }}>
              <Trash2 className="h-3 w-3" /> Remove 3D model
            </Button>
          </div>
          <ModelEditor
            key={armor.id}
            id={armor.id}
            model={model}
            modId={modId}
            mcVersion={mcVersion}
            variant="armor"
            onChange={(m) => onUpdate({ model: m })}
            settings={{}}
            onSettingsChange={() => {}}
            fieldCtx={fieldCtx}
          />
        </div>
      )}
    </div>
  );
}
