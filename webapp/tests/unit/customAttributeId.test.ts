import { describe, expect, it } from "vitest";
import { followCustomAttributeId, suggestCustomAttributeId } from "../../lib/itemRegistry";

describe("custom attribute ids", () => {
  it("are generated as {modid}_attribute_{name}", () => {
    expect(suggestCustomAttributeId("mymod", "Mana Regen")).toBe("mymod_attribute_mana_regen");
  });

  it("follow the display name while still generated", () => {
    expect(followCustomAttributeId("mymod", "mymod_attribute_new_attribute", "New Attribute", "Mana")).toBe("mymod_attribute_mana");
    expect(followCustomAttributeId("mymod", "mymod_attribute_mana_2", "Mana", "Mana Regen")).toBe("mymod_attribute_mana_regen");
    // the older "{modid}_{name}" form moves to the new one
    expect(followCustomAttributeId("mymod", "mymod_mana", "Mana", "Mana Regen")).toBe("mymod_attribute_mana_regen");
  });

  it("stay put once renamed by hand", () => {
    expect(followCustomAttributeId("mymod", "my_custom_id", "Mana", "Mana Regen")).toBeNull();
  });
});
