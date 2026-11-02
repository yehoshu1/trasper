import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import { isWeakSecret } from "./security-env";

/**
 * Small authenticated-encryption helper for settings that are secrets (the AI
 * API key). The key is derived from AUTH_SECRET (or SETTINGS_SECRET when set),
 * so the ciphertext in SQLite is useless without the environment key.
 */

function encryptionKey(): Buffer {
  const secret = process.env.SETTINGS_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  const devLike = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  if (!devLike && (secret.length < 32 || isWeakSecret(secret))) {
    throw new Error(
      "AUTH_SECRET (or SETTINGS_SECRET) must be a strong 32+ character key before encrypting settings",
    );
  }
  return scryptSync(secret, "app-settings-v1", 32);
}

export function encryptSettingSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSettingSecret(value: string): string | null {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const encrypted = Buffer.from(parts[3], "base64");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
