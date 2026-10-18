import { describe, it, expect } from "vitest";
import { buildTask, buildPrompt } from "@/app/api/ai/tasks";

describe("AI attributes task", () => {
  it("drops unknown attributes and sanitizes ops/slots/amounts", () => {
    const task = buildTask("attributes", { target: "item", customAttributes: [{ id: "mana", displayName: "Mana", min: 0, max: 100, defaultBase: 10 }] })!;
    const out = task.validate({
      attributes: [
        { attribute: "generic.attack_damage", amount: 8, operation: "add_value", slot: "mainhand" },
        { attribute: "mana", amount: 99999, operation: "bogus", slot: "nowhere" },
        { attribute: "minecraft:not_real", amount: 1, operation: "add_value", slot: "any" },
        { attribute: "generic.luck", amount: "lots", operation: "add_value", slot: "any" },
      ],
    });
    expect(out).toEqual({
      attributes: [
        { attribute: "generic.attack_damage", amount: 8, operation: "add_value", slot: "mainhand" },
        { attribute: "mana", amount: 1024, operation: "add_value", slot: "mainhand" },
      ],
    });
  });

  it("forces slot any for effects and rejects empty answers", () => {
    const task = buildTask("attributes", { target: "effect" })!;
    expect(task.validate({ attributes: [{ attribute: "generic.armor", amount: 2, operation: "add_value", slot: "chest" }] }))
      .toEqual({ attributes: [{ attribute: "generic.armor", amount: 2, operation: "add_value", slot: "any" }] });
    expect(() => task.validate({ attributes: [] })).toThrow();
  });

  it("rejects unknown tasks and frames the prompt with context", () => {
    expect(buildTask("nope", {})).toBeNull();
    expect(buildPrompt("attributes", "hell sword", { target: "item", name: "Hellblade" })).toContain("Name: Hellblade");
  });
});
