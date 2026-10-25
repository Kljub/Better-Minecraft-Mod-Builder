import { test, expect } from "@playwright/test";
import { seedTextures, seedProject, openEditor } from "../support/seed";

test("AI Builder: opens as a tab, sends a brief, saves the conversation and passes earlier ones as memory", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("mc-ui-builder:ai-settings", JSON.stringify({
    clients: { claude: { enabled: true, model: "" }, codex: { enabled: true, model: "" }, ollama: { enabled: false, model: "" } }, preferred: "claude",
  })));
  const sent: { provider?: string; mode?: string; prompt?: string; memory?: string; history?: { role: string; text: string }[] }[] = [];
  await page.route("**/api/ai/agent", async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    const answer = sent.length === 1 ? "Ich habe das Rubin-Schwert erstellt." : sent.length === 2 ? "Es hat **8** Angriffsschaden." : "Neu hier.";
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: [{ type: "start", port: 1 }, { type: "tool", name: "create_element", detail: "{}" }, { type: "done", ok: true, text: answer }].map((e) => JSON.stringify(e)).join("\n") + "\n",
    });
  });
  await seedTextures(page);
  await seedProject(page, { id: "main", width: 320, height: 180, modId: "mymod", widgets: [] });
  await openEditor(page);

  // Screen editor toolbar button opens the AI Builder tab in the main area.
  await page.getByRole("button", { name: "Codex Builder" }).click();
  const chat = page.getByTestId("codex-chat");
  await expect(chat).toBeVisible();

  // Multi-line brief: Enter is a new line, Ctrl+Enter sends.
  const input = chat.getByLabel("Chat message");
  await chat.getByRole("button", { name: "+ Item" }).click();
  await expect(input).toHaveValue(/^Item: \n- Name: /);
  await input.fill("Erstelle ein Rubin-Schwert");
  await input.press("Enter");
  expect(sent).toHaveLength(0);
  await input.fill("Erstelle ein Rubin-Schwert");
  await input.press("Control+Enter");
  await expect(chat.getByTestId("codex-chat-messages")).toContainText("Ich habe das Rubin-Schwert erstellt.");
  await expect(chat).toContainText("1 editor action");
  expect(sent[0]).toMatchObject({ provider: "codex", mode: "chat", prompt: "Erstelle ein Rubin-Schwert", history: [], memory: "" });

  await input.fill("Wie viel Schaden?");
  await input.press("Control+Enter");
  await expect(chat.getByTestId("codex-chat-messages")).toContainText("Es hat 8 Angriffsschaden.");
  await expect(chat.getByTestId("codex-chat-messages").locator("b", { hasText: "8" })).toBeVisible();
  expect(sent[1].history).toEqual([
    { role: "user", text: "Erstelle ein Rubin-Schwert" },
    { role: "assistant", text: "Ich habe das Rubin-Schwert erstellt." },
  ]);
  await expect(chat.getByTestId("ai-conversations")).toContainText("Erstelle ein Rubin-Schwert");

  // Survives switching views and reloading the page (saved in the browser).
  await page.getByTitle("Entity Models", { exact: true }).click();
  await expect(chat).toBeHidden();
  await page.reload();
  await page.getByTitle("AI Builder", { exact: true }).click();
  await expect(page.getByTestId("codex-chat-messages")).toContainText("Es hat 8 Angriffsschaden.");

  // A new conversation starts empty and gets the earlier one as memory.
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByTestId("codex-chat-messages")).not.toContainText("Es hat 8");
  await page.getByLabel("Chat message").fill("Was habe ich schon gebaut?");
  await page.getByLabel("Chat message").press("Control+Enter");
  await expect(page.getByTestId("codex-chat-messages")).toContainText("Neu hier.");
  expect(sent[2].history).toEqual([]);
  expect(sent[2].memory).toContain("Erstelle ein Rubin-Schwert");
  expect(sent[2].memory).toContain("Es hat **8** Angriffsschaden.");

  // Back to the first conversation from the list.
  await page.getByTestId("ai-conversations").getByText("Erstelle ein Rubin-Schwert").click();
  await expect(page.getByTestId("codex-chat-messages")).toContainText("Es hat 8 Angriffsschaden.");
});

test("Claude Builder: switch the builder to Claude Code, enable it from the panel, choice is remembered", async ({ page }) => {
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

  await page.getByRole("button", { name: "Codex Builder" }).click();
  const chat = page.getByTestId("codex-chat");
  await chat.getByRole("radio", { name: "Claude" }).click();
  await expect(page.getByRole("button", { name: "Claude Builder" })).toBeVisible();
  await expect(chat).toContainText("is turned off");
  await chat.getByRole("button", { name: "Enable Claude Code" }).click();

  await chat.getByLabel("Chat message").fill("Hallo");
  await chat.getByLabel("Chat message").press("Control+Enter");
  await expect(chat.getByTestId("codex-chat-messages")).toContainText("Hallo von Claude.");
  expect(sent[0]).toMatchObject({ provider: "claude", mode: "chat" });

  await page.reload();
  await expect(page.getByRole("button", { name: "Claude Builder" })).toBeVisible();
  await page.getByRole("button", { name: "Claude Builder" }).click();
  await expect(page.getByTestId("codex-chat").getByRole("radio", { name: "Claude" })).toHaveAttribute("aria-checked", "true");
});
