import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("Codex Chat: opens from the header on the right, keeps the conversation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: true, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  const sent: { provider?: string; mode?: string; prompt?: string; history?: { role: string; text: string }[] }[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    const answer = sent.length === 1 ? "Ich habe das Rubin-Schwert erstellt." : "Es hat **8** Angriffsschaden.";
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: [{ type: "start", port: 1 }, { type: "tool", name: "create_element", detail: "{}" }, { type: "done", ok: true, text: answer }].map((e) => JSON.stringify(e)).join("\n") + "\n",
    });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  // Screen editor toolbar: the button sits left of Export.
  const chatButton = page.getByRole("button", { name: "Codex Chat" });
  await chatButton.click();
  const chat = page.getByTestId("codex-chat");
  await expect(chat).toBeVisible();
  const chatBox = (await chat.boundingBox())!;
  // Docked on the right edge of the window.
  expect(chatBox.x + chatBox.width).toBeGreaterThan((page.viewportSize()!.width) - 2);

  await chat.getByLabel("Chat message").fill("Erstelle ein Rubin-Schwert");
  await chat.getByLabel("Chat message").press("Enter");
  await expect(chat.getByTestId("codex-chat-messages")).toContainText("Ich habe das Rubin-Schwert erstellt.");
  await expect(chat).toContainText("1 editor action");
  expect(sent[0]).toMatchObject({ provider: "codex", mode: "chat", prompt: "Erstelle ein Rubin-Schwert", history: [] });

  await chat.getByLabel("Chat message").fill("Wie viel Schaden?");
  await chat.getByLabel("Chat message").press("Enter");
  await expect(chat.getByTestId("codex-chat-messages")).toContainText("Es hat 8 Angriffsschaden.");
  await expect(chat.getByTestId("codex-chat-messages").locator("b", { hasText: "8" })).toBeVisible();
  expect(sent[1].history).toEqual([
    { role: "user", text: "Erstelle ein Rubin-Schwert" },
    { role: "assistant", text: "Ich habe das Rubin-Schwert erstellt." },
  ]);

  // Survives closing and switching to another view (header bar of the other views).
  await chat.getByTitle("Close chat").click();
  await expect(chat).toBeHidden();
  await page.getByTitle("Entity Models", { exact: true }).click();
  await page.getByRole("button", { name: "Codex Chat" }).click();
  await expect(page.getByTestId("codex-chat-messages")).toContainText("Es hat 8 Angriffsschaden.");
});

test("Claude Chat: switch the chat to Claude Code, enable it from the panel, choice is remembered", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded-ai")) {
      sessionStorage.setItem("seeded-ai", "1");
      localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
        clients: { claude: { enabled: false, model: "" }, codex: { enabled: true, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "codex",
      }));
    }
  });
  const sent: { provider?: string; mode?: string }[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: [{ type: "start", port: 1 }, { type: "done", ok: true, text: "Hallo von Claude." }].map((e) => JSON.stringify(e)).join("\n") + "\n",
    });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  await page.getByRole("button", { name: "Codex Chat" }).click();
  const chat = page.getByTestId("codex-chat");
  await chat.getByRole("radio", { name: "Claude" }).click();
  await expect(page.getByRole("button", { name: "Claude Chat" })).toBeVisible();
  await expect(chat).toContainText("is turned off");
  await chat.getByRole("button", { name: "Enable Claude Code" }).click();

  await chat.getByLabel("Chat message").fill("Hallo");
  await chat.getByLabel("Chat message").press("Enter");
  await expect(chat.getByTestId("codex-chat-messages")).toContainText("Hallo von Claude.");
  expect(sent[0]).toMatchObject({ provider: "claude", mode: "chat" });

  await page.reload();
  await expect(page.getByRole("button", { name: "Claude Chat" })).toBeVisible();
  await page.getByRole("button", { name: "Claude Chat" }).click();
  await expect(page.getByTestId("codex-chat").getByRole("radio", { name: "Claude" })).toHaveAttribute("aria-checked", "true");
});
