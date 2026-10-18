import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * The dev server is also reached over plain HTTP on a LAN IP — not a secure context, where
 * crypto.randomUUID and navigator.clipboard don't exist and calling them crashes the page.
 * Use genId() / copyToClipboard() from lib/utils instead.
 */
const ALLOWED = new Set(["lib/utils.ts", "lib/bbmodel.ts"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("secure-context-only browser APIs", () => {
  it("aren't called directly", () => {
    const offenders = ["app", "components", "lib"].flatMap(files)
      .filter((f) => !ALLOWED.has(f) && !f.startsWith("app/api/"))
      .filter((f) => /crypto\.randomUUID\(|navigator\.clipboard/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
