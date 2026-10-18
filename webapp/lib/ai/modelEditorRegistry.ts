"use client";

/**
 * The currently mounted Model Editor's controls, for the AI bridge (screenshots, views, tabs,
 * posing). Only one model editor is open at a time.
 */
export interface ModelEditorControls {
  modelId: string;
  screenshot: () => string;
  setView: (view: string) => void;
  setTab: (tab: string) => void;
  /** pose at `time` of `animation` (switches to the Animation tab); undefined animation = rest pose */
  pose: (animation: string | undefined, time: number) => void;
}

let active: ModelEditorControls | null = null;

export function registerModelEditor(controls: ModelEditorControls): () => void {
  active = controls;
  return () => { if (active === controls) active = null; };
}

export const activeModelEditor = () => active;
