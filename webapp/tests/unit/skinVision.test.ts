import { describe, expect, it } from "vitest";
import { validateSkinDescription, validateSkinQuality } from "../../lib/ai/skinVision";

describe("skin vision answers", () => {
  it("keeps one prompt and valid colours", () => {
    const d = validateSkinDescription({ description: "x", colors: ["#ff0000", "red"], prompt: "  ruby   sword, golden hilt " });
    expect(d.prompt).toBe("ruby sword, golden hilt");
    expect(d.colors).toEqual(["#ff0000"]);
    expect(() => validateSkinDescription({ prompt: "" })).toThrow();
  });

  it("drops out-of-range and duplicate ratings, clamps scores", () => {
    const q = validateSkinQuality({ ratings: [
      { index: 1, score: 12, verdict: "good", issues: "" },
      { index: 1, score: 3, verdict: "bad", issues: "" },
      { index: 5, score: 3, verdict: "bad", issues: "" },
      { index: 2, score: 2, verdict: "nope", issues: "noisy" },
    ], best: 9, summary: "s" }, 2);
    expect(q.ratings).toEqual([
      { index: 1, score: 10, verdict: "good", issues: "" },
      { index: 2, score: 2, verdict: "bad", issues: "noisy" },
    ]);
    expect(q.best).toBe(0);
  });
});
