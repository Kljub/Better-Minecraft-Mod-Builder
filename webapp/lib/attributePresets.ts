import type { AttributeModifierSpec } from "./types";

export interface AttributePreset {
  id: string;
  name: string;
  attributes: AttributeModifierSpec[];
  createdAt: number;
}

const KEY = "mc-ui-builder-attribute-presets";

export function loadAttributePresets(): AttributePreset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AttributePreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAttributePresets(presets: AttributePreset[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(presets)); } catch { /* quota */ }
}
