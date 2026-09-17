"use client";

import React, { useState } from "react";
import type { AchievementSpec, ItemSpec, DimensionSpec } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Field, Toggle, PropSelect, TextureField, ItemIdField } from "@/components/SchemaFields";
import { VANILLA_ITEM_OPTIONS } from "@/lib/vanillaItems";
import {
  ADVANCEMENT_FRAME_OPTIONS, ADVANCEMENT_TRIGGER_OPTIONS, ADVANCEMENT_TRIGGER_LABELS, VANILLA_DIMENSION_OPTIONS,
} from "@/lib/achievementRegistry";
import { useTextures } from "@/lib/TextureContext";
import TexturePickerModal from "@/components/TexturePickerModal";

interface Props {
  achievement: AchievementSpec | null;
  achievements: AchievementSpec[];
  items: ItemSpec[];
  dimensions: DimensionSpec[];
  /** project mod id, used to fully-qualify a project item's/dimension's bare id (e.g. "ruby_sword")
   * into "modid:ruby_sword" for the icon/trigger-item/target-dimension pickers — vanilla ids
   * already come qualified. */
  modId: string;
  onUpdate: (patch: Partial<AchievementSpec>) => void;
}

/** Property form for the currently selected Achievement (a vanilla advancement) — pure datapack
 * JSON, no criteria scripting, just one curated trigger ("always" or "obtain a specific item"). */
export default function AchievementPropertyPanel({ achievement, achievements, items, dimensions, modId, onUpdate }: Props) {
  const { packTextures, uploadCustomTexture } = useTextures();
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  if (!achievement) {
    return (
      <div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground italic">
        Select an achievement to edit its properties.
      </div>
    );
  }

  const itemOptions = [...VANILLA_ITEM_OPTIONS, ...items.map((i) => `${modId}:${i.id}`)];
  const dimensionOptions = [...VANILLA_DIMENSION_OPTIONS, ...dimensions.map((d) => `${modId}:${d.id}`)];
  const parentOptions = ["", ...achievements.filter((a) => a.id !== achievement.id).map((a) => a.id)];
  const parentLabels = Object.fromEntries([
    ["", "(none — root/tab advancement)"],
    ...achievements.map((a) => [a.id, a.title || a.id]),
  ]);

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 p-2 text-xs overflow-y-auto items-start">
      <div className="col-span-2 font-bold text-foreground mb-1 uppercase tracking-wide">Achievement</div>

      <Field label="ID">
        <Input className="h-6 text-xs px-1.5" value={achievement.id} disabled />
      </Field>
      <Field label="Title">
        <Input className="h-6 text-xs px-1.5" value={achievement.title} onChange={(e) => onUpdate({ title: e.target.value })} />
      </Field>
      <Field label="Description">
        <Input className="h-6 text-xs px-1.5" value={achievement.description} onChange={(e) => onUpdate({ description: e.target.value })} />
      </Field>
      <Field label="Icon (item)">
        <ItemIdField value={achievement.icon} onChange={(v) => onUpdate({ icon: v })} options={itemOptions} />
      </Field>
      <Field label="Frame">
        <PropSelect value={achievement.frame} options={ADVANCEMENT_FRAME_OPTIONS} onChange={(v) => onUpdate({ frame: v as AchievementSpec["frame"] })} />
      </Field>
      <Field label="Parent">
        <PropSelect value={achievement.parentId} options={parentOptions} labels={parentLabels} onChange={(v) => onUpdate({ parentId: v })} />
      </Field>

      {achievement.parentId === "" && (
        <div className="col-span-2">
          <Field label="Tab background">
            <TextureField
              value={achievement.background ?? ""}
              packTextures={packTextures}
              onPick={() => setBgPickerOpen(true)}
            />
          </Field>
        </div>
      )}
      <TexturePickerModal
        open={bgPickerOpen}
        packTextures={packTextures}
        current={achievement.background ?? ""}
        onSelect={(k) => { onUpdate({ background: k }); setBgPickerOpen(false); }}
        onClose={() => setBgPickerOpen(false)}
        onUpload={uploadCustomTexture}
      />

      <div className="col-span-2 grid grid-cols-3 gap-1 mt-1 text-[10px]">
        <div className="flex flex-col items-center gap-0.5 rounded border border-input p-1">
          <span className="text-muted-foreground">Toast</span>
          <Toggle checked={achievement.showToast} onChange={(v) => onUpdate({ showToast: v })} />
        </div>
        <div className="flex flex-col items-center gap-0.5 rounded border border-input p-1">
          <span className="text-muted-foreground">Chat</span>
          <Toggle checked={achievement.announceToChat} onChange={(v) => onUpdate({ announceToChat: v })} />
        </div>
        <div className="flex flex-col items-center gap-0.5 rounded border border-input p-1">
          <span className="text-muted-foreground">Hidden</span>
          <Toggle checked={achievement.hidden} onChange={(v) => onUpdate({ hidden: v })} />
        </div>
      </div>

      <div className="col-span-2 font-semibold text-muted-foreground mt-1">Trigger</div>
      <Field label="Type">
        <PropSelect
          value={achievement.trigger}
          options={ADVANCEMENT_TRIGGER_OPTIONS}
          labels={ADVANCEMENT_TRIGGER_LABELS}
          onChange={(v) => onUpdate({ trigger: v as AchievementSpec["trigger"] })}
        />
      </Field>
      {(achievement.trigger === "obtain_item" || achievement.trigger === "consume_item") && (
        <Field label={achievement.trigger === "consume_item" ? "Item to eat/drink" : "Item to obtain"}>
          <ItemIdField value={achievement.triggerItem ?? ""} onChange={(v) => onUpdate({ triggerItem: v })} options={itemOptions} />
        </Field>
      )}
      {achievement.trigger === "changed_dimension" && (
        <Field label="Target dimension">
          <ItemIdField
            value={achievement.toDimension ?? ""}
            onChange={(v) => onUpdate({ toDimension: v })}
            options={dimensionOptions}
            placeholder="minecraft:the_nether"
          />
        </Field>
      )}
    </div>
  );
}
