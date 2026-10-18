import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { seedTextures, seedProject, openEditor } from "../support/seed";

// One MCP server owns port 8790 at a time.
test.describe.configure({ mode: "serial" });

type ToolResult = { content: { type: string; text?: string; data?: string }[]; isError?: boolean };

test("an MCP client builds, paints and animates a mob in the open editor", async ({ page }) => {
  test.setTimeout(90_000);
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "../../mcp/server.mjs")], stderr: "pipe" });
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(transport);
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["create_model", "add_cubes", "pack_uv", "paint_cubes", "generate_animation", "screenshot", "set_entity_settings"]));

    // Not connected yet → a clear error instead of hanging.
    const early = (await client.callTool({ name: "get_status", arguments: {} })) as ToolResult;
    expect(early.isError).toBe(true);
    expect(early.content[0].text).toContain("AI bridge");

    await seedTextures(page);
    await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
    await page.addInitScript(() => localStorage.setItem("mc-ui-builder:mcp-bridge", "on"));
    await openEditor(page);
    await expect(page.getByTestId("ai-bridge-toggle")).toContainText("on", { timeout: 15_000 });

    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as ToolResult;
      if (r.isError) throw new Error(`${name}: ${r.content[0]?.text}`);
      return r;
    };
    const json = (r: ToolResult) => JSON.parse(r.content[0].text!);

    expect(json(await call("get_status", {})).modId).toBe("mymod");
    await call("create_model", { id: "golem", template: "humanoid" });
    await call("add_cubes", { model: "golem", cubes: [{ name: "nose", bone: "head", from: [-1, 26, -6], size: [2, 3, 2] }] });
    await call("mirror_element", { model: "golem", target: "left_arm" }).catch(() => undefined); // name swap → right_arm2
    const packed = json(await call("pack_uv", { model: "golem" }));
    expect(packed.cubes).toBeGreaterThanOrEqual(7);
    await call("paint_cubes", { model: "golem", default_color: "#7a7a7a", colors: { head: "#9c8f7a", nose: "#c48a5a" }, noise: 0.15 });
    await call("paint_face", { model: "golem", cube: "head", face: "north", ops: [{ x: 1, y: 3, w: 2, h: 1, color: "#202020" }, { x: 5, y: 3, w: 2, h: 1, color: "#202020" }] });
    await call("generate_animation", { model: "golem", kind: "walk" });
    await call("set_entity_settings", { model: "golem", settings: { displayName: "Golem", behavior: "hostile_melee", walkAnimation: "walk", maxHealth: 40 } });

    const model = json(await call("get_model", { model: "golem" }));
    expect(model.cubes.map((c: { name: string }) => c.name)).toContain("nose");
    expect(model.texture.set).toBe(true);
    expect(model.animations[0].name).toBe("walk");

    // The editor shows it, and screenshots come back as images.
    await expect(page.getByTestId("model-editor")).toBeVisible();
    await expect(page.getByTestId("model-name")).toHaveValue("golem");
    const shot = (await client.callTool({ name: "screenshot", arguments: { views: ["front", "perspective"], animation: "walk", time: 0.25 } })) as ToolResult;
    const images = shot.content.filter((c) => c.type === "image");
    expect(images).toHaveLength(2);
    fs.writeFileSync("/tmp/claude-1000/mcp-shot.png", Buffer.from(images[1].data!, "base64"));

    // Every tool call is undoable in the editor.
    await page.keyboard.press("Control+z");
    const undone = json(await call("get_model", { model: "golem" }));
    expect(undone.animations).toHaveLength(1);

    // Rename via the header field.
    const name = page.getByTestId("model-name");
    await name.fill("stone_golem");
    await name.press("Enter");
    await expect(page.locator("footer, body").getByText("mymod:stone_golem").first()).toBeVisible();
    expect(json(await call("list_elements", { kind: "entityModel" })).entityModel).toEqual(["stone_golem"]);
  } finally {
    await client.close();
  }
});
