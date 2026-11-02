import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decryptSettingSecret, encryptSettingSecret } from "../src/lib/setting-secrets";

process.env.AUTH_SECRET ??= "test-secret-for-settings-encryption";

describe("encrypted settings", () => {
  it("round-trips the AI key without storing plaintext", () => {
    const plain = "sk-test-123456789";
    const cipher = encryptSettingSecret(plain);
    assert.notEqual(cipher, plain);
    assert.equal(cipher.includes(plain), false);
    assert.equal(decryptSettingSecret(cipher), plain);
  });

  it("rejects tampered ciphertext", () => {
    const cipher = encryptSettingSecret("sk-test");
    const parts = cipher.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    assert.equal(decryptSettingSecret(parts.join(":")), null);
  });
});
