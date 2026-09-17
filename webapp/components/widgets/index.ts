import type { ComponentType } from "react";
import type { VisualProps } from "./shared";

import PanelVisual from "./panel/PanelVisual";
import ButtonVisual from "./button/ButtonVisual";
import SliderVisual from "./slider/SliderVisual";
import CheckboxVisual from "./checkbox/CheckboxVisual";
import InputVisual from "./input/InputVisual";
import LabelVisual from "./label/LabelVisual";
import GroupVisual from "./group/GroupVisual";
import ListVisual from "./list/ListVisual";
import SpriteVisual from "./sprite/SpriteVisual";
import ProgressVisual from "./progress/ProgressVisual";
import XpBarVisual from "./xp_bar/XpBarVisual";
import HeartBarVisual from "./heart_bar/HeartBarVisual";
import ArmorBarVisual from "./armor_bar/ArmorBarVisual";
import HungerBarVisual from "./hunger_bar/HungerBarVisual";
import BossBarVisual from "./boss_bar/BossBarVisual";
import SkillCheckVisual from "./skill_check/SkillCheckVisual";
import InventoryAreaVisual from "./inventory_area/InventoryAreaVisual";
import ScrollbarWidgetVisual from "./scrollbar/ScrollbarVisual";
import RequirementVisual from "./requirement/RequirementVisual";
import CustomVisual from "./custom/CustomVisual";
import PlayerPreviewVisual from "./player_preview/PlayerPreviewVisual";
/** widget.type -> its Visual component. One folder per widget type — see components/widgets/<type>/. */
export const WIDGET_VISUAL_REGISTRY: Record<string, ComponentType<VisualProps>> = {
  panel: PanelVisual,
  button: ButtonVisual,
  toggle_button: ButtonVisual,
  slider: SliderVisual,
  checkbox: CheckboxVisual,
  input: InputVisual,
  label: LabelVisual,
  group: GroupVisual,
  list: ListVisual,
  sprite: SpriteVisual,
  progress: ProgressVisual,
  xp_bar: XpBarVisual,
  heart_bar: HeartBarVisual,
  armor_bar: ArmorBarVisual,
  hunger_bar: HungerBarVisual,
  boss_bar: BossBarVisual,
  skill_check: SkillCheckVisual,
  inventory_area: InventoryAreaVisual,
  scrollbar: ScrollbarWidgetVisual,
  requirement: RequirementVisual,
  custom: CustomVisual,
  player_preview: PlayerPreviewVisual,
};

export { ScrollbarVisual, SCROLLBAR_THUMB_LEN, SCROLLBAR_BORDER_PX } from "./scrollbar/ScrollbarVisual";
