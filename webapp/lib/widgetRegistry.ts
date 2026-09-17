import type { WidgetSpec } from "./types";

export type PropFieldType = "text" | "number" | "boolean" | "select";

export interface PropField {
  key: string;
  label: string;
  type: PropFieldType;
  options?: string[];
  defaultValue?: string;
}

export interface WidgetDef {
  type: string;
  label: string;
  isContainer?: boolean;
  defaultWidget: Omit<WidgetSpec, "id">;
  // schema for the `props` record — fields beyond text/icon
  propSchema: PropField[];
}

const WIDGET_REGISTRY: WidgetDef[] = [
  {
    type: "group",
    label: "Group",
    isContainer: true,
    defaultWidget: { type: "group", x: 0, y: 0, w: 80, h: 40, text: "", icon: null, props: {} },
    propSchema: [],
  },
  {
    type: "panel",
    label: "Panel",
    isContainer: true,
    defaultWidget: { type: "panel", x: 8, y: 8, w: 176, h: 166, text: "", icon: null, props: { style: "default" } },
    propSchema: [
      { key: "style", label: "Style", type: "select", options: ["default", "dark", "transparent"], defaultValue: "default" },
    ],
  },
  {
    type: "tabs",
    label: "Tabs",
    isContainer: true,
    defaultWidget: {
      type: "tabs",
      x: 8, y: 8, w: 176, h: 150,
      text: "", icon: null,
      props: { tab_height: "20" },
    },
    propSchema: [
      { key: "tab_height", label: "Tab Height", type: "number", defaultValue: "20" },
    ],
  },
  {
    type: "tab",
    label: "Tab",
    isContainer: true,
    defaultWidget: { type: "tab", x: 0, y: 0, w: 0, h: 0, text: "Tab", icon: null, props: {} },
    propSchema: [],
  },
  {
    type: "button",
    label: "Button",
    defaultWidget: { type: "button", x: 8, y: 8, w: 72, h: 20, text: "Button", icon: null, props: {} },
    propSchema: [],
  },
  {
    type: "toggle_button",
    label: "Toggle Button",
    defaultWidget: { type: "toggle_button", x: 8, y: 8, w: 72, h: 20, text: "Toggle", icon: null, props: { group: "" } },
    propSchema: [
      { key: "group", label: "Group ID", type: "text", defaultValue: "" },
    ],
  },
  {
    type: "checkbox",
    label: "Checkbox",
    defaultWidget: { type: "checkbox", x: 8, y: 8, w: 20, h: 20, text: "", icon: null, props: { checked: "false" } },
    propSchema: [
      { key: "checked", label: "Checked", type: "boolean", defaultValue: "false" },
    ],
  },
  {
    type: "input",
    label: "Input",
    defaultWidget: { type: "input", x: 8, y: 8, w: 120, h: 20, text: "", icon: null, props: { max_length: "32" } },
    propSchema: [
      { key: "max_length", label: "Max Length", type: "number", defaultValue: "32" },
      { key: "hint_text", label: "Hint Text", type: "text", defaultValue: "" },
    ],
  },
  {
    type: "slider",
    label: "Slider",
    defaultWidget: { type: "slider", x: 8, y: 8, w: 150, h: 20, text: "Value: %s", icon: null, props: { min: "0", max: "100", step: "1", value: "50" } },
    propSchema: [
      { key: "min", label: "Min", type: "number", defaultValue: "0" },
      { key: "max", label: "Max", type: "number", defaultValue: "100" },
      { key: "step", label: "Step", type: "number", defaultValue: "1" },
      { key: "value", label: "Default Value", type: "number", defaultValue: "50" },
    ],
  },
  {
    type: "label",
    label: "Label",
    defaultWidget: { type: "label", x: 8, y: 8, w: 80, h: 10, text: "Label", icon: null, props: { color: "4210752", shadow: "false" } },
    propSchema: [
      { key: "color", label: "Color (ARGB int)", type: "number", defaultValue: "4210752" },
      { key: "shadow", label: "Shadow", type: "boolean", defaultValue: "false" },
      { key: "align",  label: "Align",          type: "select", options: ["left", "center", "right"],        defaultValue: "left" },
      { key: "valign", label: "Vertical Align", type: "select", options: ["top", "middle", "bottom"], defaultValue: "middle" },
    ],
  },
  {
    type: "scrollbar",
    label: "Scrollbar",
    defaultWidget: {
      type: "scrollbar",
      x: 8, y: 8, w: 14, h: 54,
      text: "", icon: null,
      props: { axis: "y", target: "" },
    },
    propSchema: [
      { key: "axis",   label: "Axis",            type: "select", options: ["y", "x"], defaultValue: "y" },
      { key: "target", label: "Target widget ID", type: "text",   defaultValue: "" },
    ],
  },
  {
    type: "inventory_area",
    label: "Inventory Area",
    defaultWidget: {
      type: "inventory_area",
      x: 8, y: 8,
      w: 9 * 18, h: 3 * 18,  // 9 cols × 3 rows × 18px slot_size
      text: "", icon: null,
      props: { cols: "9", rows: "3", slot_size: "18", source: "" },
    },
    propSchema: [
      { key: "cols",      label: "Columns",      type: "number",  defaultValue: "9"  },
      { key: "rows",      label: "Preview rows", type: "number",  defaultValue: "3"  },
      { key: "slot_size", label: "Slot Size",    type: "number",  defaultValue: "18" },
      { key: "source",    label: "Source",       type: "select",  options: ["", "player", "player_hotbar"], defaultValue: "" },
    ],
  },
  {
    type: "sprite",
    label: "Sprite",
    defaultWidget: { type: "sprite", x: 8, y: 8, w: 32, h: 32, text: "", icon: null, props: { src: "", fit: "fill" } },
    propSchema: [
      { key: "src", label: "Texture", type: "text", defaultValue: "" },
      { key: "fit", label: "Fit", type: "select", options: ["fill", "contain", "cover", "tile", "none"], defaultValue: "fill" },
    ],
  },
  {
    type: "progress",
    label: "Progress Bar",
    defaultWidget: {
      type: "progress",
      x: 8, y: 8, w: 160, h: 10,
      text: "", icon: null,
      props: { min: "0", max: "100", value: "50", style: "threshold", color: "3958339", show_label: "true" },
    },
    propSchema: [
      { key: "min", label: "Min", type: "number", defaultValue: "0" },
      { key: "max", label: "Max", type: "number", defaultValue: "100" },
      { key: "value", label: "Default Value", type: "number", defaultValue: "50" },
      { key: "style", label: "Style", type: "select", options: ["threshold", "solid"], defaultValue: "threshold" },
      { key: "color", label: "Color", type: "number", defaultValue: "3958339" },
      { key: "show_label", label: "Show %", type: "boolean", defaultValue: "true" },
    ],
  },
  {
    type: "xp_bar",
    label: "XP Bar",
    defaultWidget: {
      type: "xp_bar",
      x: 8, y: 8, w: 182, h: 5,
      text: "", icon: null,
      props: { value: "35" },
    },
    propSchema: [
      { key: "value", label: "Progress % (to next level)", type: "number", defaultValue: "35" },
    ],
  },
  {
    type: "heart_bar",
    label: "Heart Bar",
    defaultWidget: {
      type: "heart_bar",
      x: 8, y: 8, w: 81, h: 9,
      text: "", icon: null,
      props: { value: "20", max: "20", color: "red", rotation: "0" },
    },
    propSchema: [
      { key: "value", label: "Current HP (2 per heart)", type: "number", defaultValue: "20" },
      { key: "max", label: "Max HP (2 per heart)", type: "number", defaultValue: "20" },
      { key: "color", label: "Color", type: "select", options: ["red", "gold", "black"], defaultValue: "red" },
      { key: "rotation", label: "Rotation", type: "select", options: ["0", "90", "180", "270"], defaultValue: "0" },
    ],
  },
  {
    type: "armor_bar",
    label: "Armor Bar",
    defaultWidget: {
      type: "armor_bar",
      x: 8, y: 8, w: 81, h: 9,
      text: "", icon: null,
      props: { value: "10", max: "20" },
    },
    propSchema: [
      { key: "value", label: "Armor Points", type: "number", defaultValue: "10" },
      { key: "max", label: "Max Armor Points", type: "number", defaultValue: "20" },
    ],
  },
  {
    type: "hunger_bar",
    label: "Hunger Bar",
    defaultWidget: {
      type: "hunger_bar",
      x: 8, y: 8, w: 81, h: 9,
      text: "", icon: null,
      props: { value: "20", max: "20" },
    },
    propSchema: [
      { key: "value", label: "Hunger Points (2 per icon)", type: "number", defaultValue: "20" },
      { key: "max", label: "Max Hunger Points", type: "number", defaultValue: "20" },
    ],
  },
  {
    type: "skill_check",
    label: "Skill Check",
    defaultWidget: {
      type: "skill_check",
      x: 8, y: 8, w: 60, h: 60,
      text: "SPACE", icon: null,
      props: { key: "space", duration_ticks: "40", bonus_start: "300", bonus_end: "330", normal_start: "240", normal_end: "300" },
    },
    propSchema: [
      { key: "key", label: "Trigger Key", type: "select", options: ["space", "enter", "a", "b", "c", "d", "e", "f", "q", "r", "s", "w"], defaultValue: "space" },
      { key: "duration_ticks", label: "Sweep Duration (ticks, 20=1s)", type: "number", defaultValue: "40" },
      { key: "bonus_start", label: "Bonus Zone Start (deg, 0=top, clockwise)", type: "number", defaultValue: "300" },
      { key: "bonus_end", label: "Bonus Zone End (deg)", type: "number", defaultValue: "330" },
      { key: "normal_start", label: "Normal Zone Start (deg)", type: "number", defaultValue: "240" },
      { key: "normal_end", label: "Normal Zone End (deg)", type: "number", defaultValue: "300" },
    ],
  },
  {
    type: "boss_bar",
    label: "Boss Bar",
    defaultWidget: {
      type: "boss_bar",
      x: 8, y: 8, w: 182, h: 5,
      text: "Boss", icon: null,
      props: { value: "70", color: "pink", rotation: "0" },
    },
    propSchema: [
      { key: "value", label: "Progress %", type: "number", defaultValue: "70" },
      { key: "color", label: "Color", type: "select", options: ["pink", "blue", "red", "green", "yellow", "purple", "white"], defaultValue: "pink" },
      { key: "rotation", label: "Rotation", type: "select", options: ["0", "90", "180", "270"], defaultValue: "0" },
    ],
  },
  {
    type: "requirement",
    label: "Requirement",
    defaultWidget: {
      type: "requirement",
      x: 8, y: 8, w: 18, h: 18,
      text: "", icon: null,
      props: { color_met: "65280", color_unmet: "16711680", border_width: "2" },
    },
    propSchema: [
      { key: "color_met", label: "Color (Met)", type: "number", defaultValue: "65280" },
      { key: "color_unmet", label: "Color (Unmet)", type: "number", defaultValue: "16711680" },
      { key: "border_width", label: "Border Width", type: "number", defaultValue: "2" },
    ],
  },
  {
    type: "player_preview",
    label: "Player Preview",
    defaultWidget: {
      type: "player_preview",
      x: 8, y: 8, w: 51, h: 70,
      text: "", icon: null,
      props: { scale: "30" },
    },
    propSchema: [
      { key: "scale", label: "Scale", type: "number", defaultValue: "30" },
    ],
  },
  {
    type: "custom",
    label: "Custom",
    defaultWidget: { type: "custom", x: 8, y: 8, w: 64, h: 32, text: "", icon: null, props: { customType: "" } },
    propSchema: [
      { key: "customType", label: "Custom Type", type: "text", defaultValue: "" },
    ],
  },
  {
    type: "list",
    label: "List",
    defaultWidget: {
      type: "list",
      x: 8, y: 8, w: 160, h: 120,
      text: "", icon: null,
      props: { item_height: "20" },
      item_template: [
        { id: "icon",  type: "sprite", x: 2,  y: 2,  w: 16, h: 16, text: "", icon: null, props: { src: "", fit: "fill" } },
        { id: "label", type: "label",  x: 22, y: 6,  w: 120, h: 12, text: "", icon: null, props: {} },
      ],
    },
    propSchema: [
      { key: "item_height", label: "Item Height (px)", type: "number", defaultValue: "20" },
    ],
  },
];

export default WIDGET_REGISTRY;

export function getWidgetDef(type: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find((d) => d.type === type);
}
