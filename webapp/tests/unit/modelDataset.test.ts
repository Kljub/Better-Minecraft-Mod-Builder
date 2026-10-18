import { describe, it, expect } from "vitest";
import { modelsInSession, modelIdsFromToolCall } from "@/lib/server/modelDataset";
import { emptyModel } from "@/lib/model3d/geometry";
import { armorTemplate } from "@/lib/model3d/armorModel";

describe("model dataset", () => {
  it("finds entity and armor models in the current history entry", () => {
    const mob = { ...emptyModel(), id: "gnawer", folder: "mobs", entity: { displayName: "Rail Gnawer" } };
    const session = {
      cursor: 1,
      history: [
        { screens: [], elements: {} },
        { screens: [{ id: "main", modId: "mymod" }], mcVersion: "26.2", elements: { entityModel: [mob, { id: "broken" }] },
          armors: [{ id: "ruby", displayName: "Ruby", model: armorTemplate() }, { id: "plain", displayName: "Plain" }] },
      ],
    };
    const { models, modId, mcVersion } = modelsInSession(session);
    expect({ modId, mcVersion }).toEqual({ modId: "mymod", mcVersion: "26.2" });
    expect(models.map((m) => [m.kind, m.elementId, m.name])).toEqual([["entity", "gnawer", "Rail Gnawer"], ["armor", "ruby", "Ruby"]]);
    expect(models[0].model).not.toHaveProperty("folder");
    expect(models[0].model).not.toHaveProperty("entity");
    expect(models[0].settings).toEqual({ displayName: "Rail Gnawer" });
    expect(modelsInSession(null).models).toEqual([]);
  });

  it("reads model ids from generator tool calls", () => {
    expect(modelIdsFromToolCall("create_model", { id: "slime", template: "empty" })).toEqual(["slime"]);
    expect(modelIdsFromToolCall("mcp__mc-designer__create_model", { id: "slime" })).toEqual(["slime"]);
    expect(modelIdsFromToolCall("add_cubes", { model: "slime", cubes: [] })).toEqual(["slime"]);
    expect(modelIdsFromToolCall("get_status", {})).toEqual([]);
  });
});
