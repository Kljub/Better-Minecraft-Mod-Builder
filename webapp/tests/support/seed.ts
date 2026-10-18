import fs from "node:fs";
import path from "node:path";
import type { Page, Locator } from "@playwright/test";
import type { ScreenSpec, WidgetSpec } from "../../lib/types";

const REAL_TEXTURE_DIR = path.join(__dirname, "../fixtures/real-textures");

/**
 * Loads PNGs from tests/fixtures/real-textures/ — populated by
 * `pnpm run gen:test-textures` (extract-real-textures.mjs) before running tests.
 */
function loadFixtureTextures(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(REAL_TEXTURE_DIR)) return out;
  for (const name of fs.readdirSync(REAL_TEXTURE_DIR)) {
    if (!name.endsWith(".png")) continue;
    out[name] = fs.readFileSync(path.join(REAL_TEXTURE_DIR, name)).toString("base64");
  }
  return out;
}

const FIXTURE_TEXTURES = loadFixtureTextures();

/**
 * Seeds IndexedDB with the fixture textures (real if available, else synthetic)
 * so the app skips the "load a JAR" setup screen. Call before navigating.
 */
export async function seedTextures(page: Page): Promise<void> {
  await page.addInitScript((texData) => {
    (window as unknown as { __seedTexturesPromise: Promise<void> }).__seedTexturesPromise = (async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("mc-ui-builder", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("textures");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const [name, b64] of Object.entries(texData)) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "image/png" });
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("textures", "readwrite");
          tx.objectStore("textures").put(blob, name);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    })();
  }, FIXTURE_TEXTURES);
}

/**
 * Seeds localStorage with a single project ("e2e") containing the given
 * screen, so /editor/e2e loads directly into it. Call before navigating.
 */
/**
 * E2E runs in local mode, as without a configured accounts database: the AuthGate's login screen
 * would otherwise sit in front of every page whenever the dev server has MySQL set up.
 * (tests/e2e/accounts.spec.ts tests the logged-in mode and doesn't call this.)
 */
export async function localMode(page: Page): Promise<void> {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { enabled: false, user: null } }));
}

export async function seedProject(page: Page, screen: ScreenSpec, projectKey = "e2e"): Promise<void> {
  await localMode(page);
  await page.addInitScript(
    ({ screen, projectKey }) => {
      const session = {
        history: [{ screens: [screen], activeIdx: 0 }],
        cursor: 0,
        gridSize: 4,
        showGrid: false,
        scale: 3,
      };
      localStorage.setItem(
        "mc-ui-builder-projects",
        JSON.stringify([{ key: projectKey, session, updatedAt: 1 }])
      );
    },
    { screen, projectKey }
  );
}

/**
 * Loads the editor for `projectKey` and waits for the seeded textures to
 * land in IndexedDB.
 *
 * Also drives the zoom level down to 1 via repeated clicks on the toolbar's
 * zoom-out button. The editor's own zoom-to-fit effect (page.tsx's
 * `computeFit`) derives scale from live layout measurements on a post-mount
 * rAF, and those measurements vary slightly between loads (font metrics,
 * sidebar paint timing) — enough to occasionally flip which integer scale
 * `Math.floor(...)` lands on. `zoomOut` is a plain `s => max(s-1, 1))`
 * reducer, so clicking it enough times always converges on exactly 1
 * regardless of whatever computeFit happened to pick, making widget
 * geometry deterministic for screenshots.
 */
export async function openEditor(page: Page, projectKey = "e2e"): Promise<void> {
  await localMode(page);
  await page.goto(`/editor/${projectKey}`);
  await page.evaluate(() => (window as unknown as { __seedTexturesPromise: Promise<void> }).__seedTexturesPromise);
  await page.reload();
  const zoomOut = page.getByTitle("Zoom out (⌘-)");
  await zoomOut.waitFor({ state: "visible" });
  for (let i = 0; i < 8; i++) {
    if (await zoomOut.isDisabled()) break;
    await zoomOut.click();
  }
}

let widgetIdCounter = 9000;
/** Builds a minimal ScreenSpec containing exactly one widget, for isolated widget snapshots. */
export function screenWithWidget(widget: Omit<WidgetSpec, "id"> & { id?: string }): ScreenSpec {
  const id = widget.id ?? `${widget.type}_${++widgetIdCounter}`;
  return {
    id: "main",
    width: 320,
    height: 180,
    widgets: [{ ...widget, id }],
  };
}

/**
 * Injects a style tag that sets the canvas background to hot pink (#ff00ff),
 * matching the widget-test-harness background. Call after openEditor + try mode
 * so stray transparent pixels in widget renders show up clearly in diffs.
 */
export async function setPinkBackground(page: Page): Promise<void> {
  await page.addStyleTag({
    content: [
      "[data-canvas] { background: #ff00ff !important; }",
      // Hide the world background image and its dark overlay so only widgets
      // and the pink background are visible in screenshots.
      "[data-canvas] img { display: none !important; }",
      "[data-canvas] > div > div[style*='rgba(0,0,0'] { display: none !important; }",
    ].join("\n"),
  });
}

/**
 * Takes a screenshot of `locator` padded by `padding` CSS pixels on all sides,
 * so the pink canvas background is visible around the widget edge.
 * Returns a Buffer suitable for `expect(buf).toMatchSnapshot(name)`.
 */
export async function screenshotWidget(page: Page, locator: Locator, padding = 6): Promise<Buffer> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("locator not found");
  return page.screenshot({
    clip: {
      x: box.x - padding,
      y: box.y - padding,
      width: box.width + padding * 2,
      height: box.height + padding * 2,
    },
  });
}

/**
 * Switches the editor to try mode and injects the pink canvas background.
 * Call this after `openEditor`, then optionally interact with the canvas,
 * then call `screenshotWidget` to capture the result.
 */
export async function enterTryMode(page: Page): Promise<void> {
  await page.keyboard.press("t");
  await setPinkBackground(page);
}

interface HarnessOptions {
  widget: Omit<WidgetSpec, "id"> & { id?: string };
  scale?: number;
  interactState?: "idle" | "hovered" | "pressed";
  toggled?: boolean;
  /** Scrollbar-only: knob position 0-1 (see app/widget-test-harness/page.tsx). */
  scrollPct?: number;
}

/**
 * Loads /widget-test-harness with a single widget rendered on a solid pink
 * background — no editor chrome, no selection outline. Use for per-widget
 * visual regression snapshots (see tests/visual/*.spec.ts).
 */
export async function openWidgetHarness(page: Page, opts: HarnessOptions): Promise<void> {
  const id = opts.widget.id ?? `${opts.widget.type}_${++widgetIdCounter}`;
  await localMode(page);
  await seedTextures(page);
  await page.addInitScript((config) => {
    (window as unknown as { __HARNESS_WIDGET__: unknown }).__HARNESS_WIDGET__ = config;
  }, { ...opts, widget: { ...opts.widget, id } });
  await page.goto("/widget-test-harness");
  await page.evaluate(() => (window as unknown as { __seedTexturesPromise: Promise<void> }).__seedTexturesPromise);
  await page.reload();
  await page.waitForSelector('[data-harness-state="ready"]');
}
