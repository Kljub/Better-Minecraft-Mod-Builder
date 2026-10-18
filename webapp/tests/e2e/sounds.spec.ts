import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Sounds: upload a video, it comes back converted to Ogg Vorbis and lands in the export", async ({ page }) => {
  let uploaded = 0;
  let mono = "";
  // The real conversion (ffmpeg on the server) is covered separately; here the browser side.
  await page.route("**/api/sounds/convert**", async (route) => {
    uploaded = route.request().postDataBuffer()?.length ?? 0;
    mono = new URL(route.request().url()).searchParams.get("mono") ?? "";
    await route.fulfill({ body: Buffer.from("OggS fake vorbis"), contentType: "audio/ogg", headers: { "x-duration": "2.50" } });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);
  await page.getByTitle("Sounds", { exact: true }).click();
  await page.getByTestId("category-view").getByRole("button", { name: "New" }).first().click();
  const editor = page.getByTestId("element-editor");
  await editor.locator('[data-field="name"] input').fill("Robot Beep");
  await editor.locator('[data-field="subtitle"] input').fill("Robot beeps");
  await editor.getByLabel("Sound file").setInputFiles({ name: "clip.mkv", mimeType: "video/x-matroska", buffer: Buffer.alloc(2048, 1) });
  const field = page.getByTestId("sound-field");
  await expect(field).toContainText("clip.mkv");
  await expect(field).toContainText("Ogg Vorbis, mono");
  await expect(field).toContainText("2.5 s");
  expect(uploaded).toBe(2048);
  expect(mono).toBe("1");
  // Files this element exports (id follows the name).
  await expect(page.getByText("assets/mymod/sounds/robot_beep.ogg")).toBeVisible();
  await expect(page.getByText("assets/mymod/sounds.json")).toBeVisible();
});
