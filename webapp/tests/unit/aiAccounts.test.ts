import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";
import { encryptSecret, decryptSecret } from "@/lib/server/secrets";
import { claudeQuota, codexQuota, isLimitError } from "@/lib/server/aiAccounts";

beforeAll(() => { process.env.MMB_SECRET_KEY = randomBytes(32).toString("base64"); });

describe("secret encryption", () => {
  it("round-trips, hides the plaintext and binds to its owner", () => {
    const enc = encryptSecret("sk-ant-oat01-secret", "mmb-ai:1:claude");
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain("secret");
    expect(encryptSecret("sk-ant-oat01-secret", "mmb-ai:1:claude")).not.toBe(enc); // random IV
    expect(decryptSecret(enc, "mmb-ai:1:claude")).toBe("sk-ant-oat01-secret");
    expect(() => decryptSecret(enc, "mmb-ai:2:claude")).toThrow();
    const [v, iv, tag, ct] = enc.split(":");
    const flipped = Buffer.from(ct, "base64"); flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"), "mmb-ai:1:claude")).toThrow();
  });

  it("refuses to run without a proper key", () => {
    const saved = process.env.MMB_SECRET_KEY;
    process.env.MMB_SECRET_KEY = "short";
    expect(() => encryptSecret("x", "a")).toThrow(/MMB_SECRET_KEY/);
    process.env.MMB_SECRET_KEY = saved;
  });
});

describe("quota parsing", () => {
  it("reads Claude's rate_limit_event", () => {
    const q = claudeQuota({ status: "allowed", unifiedWindows: { five_hour: { utilization: 0.4, resetsAt: 100 }, seven_day: { utilization: 0.14, resetsAt: 200 } } });
    expect(q.status).toBe("allowed");
    expect(q.windows).toEqual([{ label: "5 h", usedPercent: 40, resetsAt: 100 }, { label: "7 days", usedPercent: 14, resetsAt: 200 }]);
    expect(claudeQuota({ status: "rejected", rateLimitType: "five_hour", resetsAt: 300 }).status).toBe("limited");
  });

  it("reads Codex's rate_limits", () => {
    const q = codexQuota({ primary: { used_percent: 4, window_minutes: 43200, resets_at: 500 }, secondary: null, plan_type: "go", rate_limit_reached_type: null });
    expect(q).toMatchObject({ status: "allowed", plan: "go", windows: [{ label: "30 days", usedPercent: 4, resetsAt: 500 }] });
    expect(codexQuota({ primary: { used_percent: 100, window_minutes: 300, resets_at: 1 } }).status).toBe("limited");
  });

  it("tells limit errors from other failures", () => {
    expect(isLimitError("Claude AI usage limit reached|1792346400")).toBe(true);
    expect(isLimitError("You've hit your usage limit. Upgrade to Plus")).toBe(true);
    expect(isLimitError("API Error: 429 Too Many Requests")).toBe(true);
    expect(isLimitError("Failed to authenticate. API Error: 401 OAuth access token is invalid.")).toBe(false);
  });
});
