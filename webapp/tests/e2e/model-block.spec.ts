import { test, expect } from "@playwright/test";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { seedTextures, seedProject, openEditor } from "../support/seed";

// The MCP server owns its port — don't run next to mcp-bridge.spec.
test.describe.configure({ mode: "serial" });

type ToolResult = { content: { type: string; text?: string }[]; isError?: boolean };

test("an entity model becomes a (multi)block: create_block_from_model + the block editor's Custom model fields", async ({ page }) => {
  test.setTimeout(60_000);
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, "../../mcp/server.mjs")], stderr: "pipe" }));
  try {
    await seedTextures(page);
    await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
    await page.addInitScript(() => localStorage.setItem("mc-ui-builder:mcp-bridge", "on"));
    await openEditor(page);
    await expect(page.getByTestId("ai-bridge-toggle")).toContainText("on", { timeout: 15_000 });
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as ToolResult;
      if (r.isError) throw new Error(`${name}: ${r.content[0]?.text}`);
      return JSON.parse(r.content[0].text!);
    };

    await call("create_model", { id: "lamp_post", template: "empty" });
    await call("add_bones", { model: "lamp_post", bones: [{ name: "main", pivot: [0, 0, 0] }] });
    // a 2-block-tall post with a lamp on top
    await call("add_cubes", { model: "lamp_post", cubes: [
      { name: "post", bone: "main", from: [-2, 0, -2], size: [4, 26, 4] },
      { name: "lamp", bone: "main", from: [-5, 24, -5], size: [10, 8, 10] },
    ] });
    await call("pack_uv", { model: "lamp_post" });
    const made = await call("create_block_from_model", { model: "lamp_post", display_name: "Lamp Post", light: 15 });
    expect(made).toMatchObject({ ok: true, id: "lamp_post", size_in_blocks: [1, 2, 1], parts: 2 });

    // the new block is open: Custom model, the model picked, multiblock on, size shown
    await expect(page.getByLabel("Block model")).toHaveValue("custom");
    const fields = page.getByTestId("custom-block-model");
    await expect(fields.getByLabel("Entity model")).toHaveValue("lamp_post");
    await expect(fields.getByRole("checkbox")).toBeChecked();
    await expect(fields).toContainText("1 × 2 × 1 blocks · 2 parts");

    // single block only: a warning that it's too big
    await fields.getByRole("checkbox").uncheck();
    await expect(fields).toContainText("bigger than one block");
  } finally {
    await client.close();
  }
});
