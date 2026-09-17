import type { PotionSpec } from "./types";

export const POTION_DEFAULT: Omit<PotionSpec, "id"> = {
  displayName: "New Potion",
  effects: [],
};
