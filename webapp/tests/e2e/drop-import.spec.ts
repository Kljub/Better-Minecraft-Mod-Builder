import { test, expect, type Page } from "@playwright/test";
import JSZip from "jszip";
import { seedTextures, seedProject, openEditor } from "../support/seed";
import { BLOCK_DEFAULT } from "../../lib/blockRegistry";
import { ITEM_DEFAULT } from "../../lib/itemRegistry";

/** Drops a file on the editor the way the OS does (dragenter, then drop). */
async function dropFile(page: Page, name: string, bytes: Uint8Array, type: string) {
  const dt = await page.evaluateHandle(({ name, bytes, type }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name, { type }));
    return dt;
  }, { name, bytes: [...bytes], type });
  await page.dispatchEvent("body", "dragenter", { dataTransfer: dt });
  await expect(page.getByTestId("drop-import-overlay")).toBeVisible();
  await page.dispatchEvent("body", "drop", { dataTransfer: dt });
  await expect(page.getByTestId("drop-import-overlay")).toHaveCount(0);
}

test("dropped exports are detected and land in the right category", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, widgets: [] });
  await openEditor(page);

  // a single block export (plain JSON, no telling file name) — recognised by its fields
  const block = JSON.stringify({ ...BLOCK_DEFAULT, id: "ruby_block", displayName: "Ruby Block" });
  await dropFile(page, "ruby_block.json", new TextEncoder().encode(block), "application/json");
  await expect(page.getByText(/^Imported into Blocks \(recognised by its fields\): 1 added/)).toBeVisible();

  // an "Export all" zip of items — recognised by its file name
  const zip = new JSZip();
  zip.file("mymod.items.json", JSON.stringify([{ ...ITEM_DEFAULT, id: "ruby", displayName: "Ruby" }]));
  await dropFile(page, "mymod.items.zip", await zip.generateAsync({ type: "uint8array" }), "application/zip");
  await expect(page.getByText(/^Imported into Items \(file name\): 1 added/)).toBeVisible();

  await page.getByTitle("Blocks", { exact: true }).click();
  await expect(page.getByTestId("category-view").getByText("Ruby Block")).toBeVisible();
  await page.getByTitle("Items", { exact: true }).click();
  await expect(page.getByTestId("category-view").getByText("Ruby", { exact: true })).toBeVisible();
});

test("an unrecognisable file is refused with a message", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, widgets: [] });
  await openEditor(page);
  await dropFile(page, "notes.json", new TextEncoder().encode(JSON.stringify({ hello: "world" })), "application/json");
  await expect(page.getByText(/^Could not import notes\.json/)).toBeVisible();
});

test("many exports dropped at once all land (each builds on the previous one)", async ({ page }) => {
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, widgets: [] });
  await openEditor(page);
  const zipOf = async (name: string, content: unknown) => { const z = new JSZip(); z.file(name, JSON.stringify(content)); return z.generateAsync({ type: "uint8array" }); };
  const files = [
    { name: "mymod.items.zip", bytes: await zipOf("mymod.items.json", [{ ...ITEM_DEFAULT, id: "ruby" }, { ...ITEM_DEFAULT, id: "sapphire" }]) },
    { name: "mymod.blocks.zip", bytes: await zipOf("mymod.blocks.json", [{ ...BLOCK_DEFAULT, id: "ruby_block" }]) },
    { name: "emerald.zip", bytes: await zipOf("emerald.json", { ...ITEM_DEFAULT, id: "emerald" }) },
    // a screen exported as zip (it has a custom sprite texture)
    { name: "menu.zip", bytes: await zipOf("menu.json", { id: "menu", width: 176, height: 166, widgets: [] }) },
  ];
  const dt = await page.evaluateHandle((list) => {
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: "application/zip" }));
    return dt;
  }, files.map((f) => ({ name: f.name, bytes: [...f.bytes] })));
  await page.dispatchEvent("body", "dragenter", { dataTransfer: dt });
  await page.dispatchEvent("body", "drop", { dataTransfer: dt });
  await expect(page.getByText(/^Imported into Screens/)).toBeVisible();

  await page.getByTitle("Items", { exact: true }).click();
  const view = page.getByTestId("category-view");
  for (const id of ["ruby", "sapphire", "emerald"]) await expect(view.getByRole("button", { name: new RegExp(`\\b${id}$`) })).toBeVisible();
  await page.getByTitle("Blocks", { exact: true }).click();
  await expect(page.getByTestId("category-view").locator("[data-entry]")).toHaveCount(1);
  await page.getByTitle("Screens", { exact: true }).click();
  await expect(page.getByTestId("category-view").getByText("menu", { exact: true })).toBeVisible();
});
