import { describe, expect, it } from "vitest";
import { runTool, type EditorApi } from "@/lib/ai/editorTools";

function fakeApi() {
  const state: { builtins: Record<string, Record<string, unknown>[]>; opened?: number } = { builtins: { items: [{ id: "ruby", displayName: "Ruby" }] } };
  const api = (): EditorApi => ({
    projectName: "p", modId: "mymod", mcVersion: "26.2", elements: {}, kinds: [], activeDoc: "screen", activeElement: null, counts: {}, packTextures: {},
    setElements: () => {}, openElement: () => {}, uploadTexture: async () => "",
    builtins: state.builtins,
    setBuiltin: (key, list, open) => { state.builtins = { ...state.builtins, [key]: list }; state.opened = open; },
  });
  return { api, state };
}
(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);

describe("built-in record tools", () => {
  it("describe_collection explains items incl. attack damage", async () => {
    const { api } = fakeApi();
    const d = (await runTool(api, "describe_collection", { collection: "items" })) as { example: Record<string, unknown>; notes: string };
    expect(d.example).toMatchObject({ displayName: "New Item", stackSize: 64 });
    expect(d.notes).toMatch(/attack_damage amount 7/);
  });

  it("create_record merges onto defaults, keeps ids unique and opens it", async () => {
    const { api, state } = fakeApi();
    const res = (await runTool(api, "create_record", { collection: "items", record: {
      id: "Ruby", displayName: "Rubin-Schwert", stackSize: 1, durability: 1200,
      attributes: [{ attribute: "generic.attack_damage", amount: 7, operation: "add_value", slot: "mainhand" }],
    } })) as { id: string; warning?: string };
    expect(res.id).toBe("ruby_2");
    expect(res.warning).toBeUndefined();
    expect(state.builtins.items[1]).toMatchObject({ id: "ruby_2", displayName: "Rubin-Schwert", rarity: "common", category: "simple", durability: 1200 });
    expect(state.opened).toBe(1);
  });

  it("update_record / delete_record", async () => {
    const { api, state } = fakeApi();
    await runTool(api, "update_record", { collection: "items", id: "ruby", changes: { rarity: "rare" } });
    expect(state.builtins.items[0]).toMatchObject({ id: "ruby", rarity: "rare" });
    await runTool(api, "delete_record", { collection: "items", id: "ruby" });
    expect(state.builtins.items).toEqual([]);
    await expect(runTool(api, "create_record", { collection: "spells", record: {} })).rejects.toThrow(/unknown collection/);
  });
});
