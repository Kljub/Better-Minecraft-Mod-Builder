import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM for secrets at rest (linked AI account tokens). The key comes from MMB_SECRET_KEY
 * (32 bytes, base64) in .env.local and never touches the database. `aad` binds a ciphertext to
 * its owner/row so a value copied into another user's row doesn't decrypt.
 * Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
 */
function key(): Buffer {
  const raw = process.env.MMB_SECRET_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) throw new Error("MMB_SECRET_KEY is missing or not 32 bytes (base64) — set it in webapp/.env.local");
  return k;
}

export function encryptSecret(plain: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(stored: string, aad: string): string {
  const [v, iv, tag, ct] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
