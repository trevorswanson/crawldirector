import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, secretsEqual } from "@/server/crypto";

// Envelope encryption for BYO AI keys (invariant #6). These run with the
// AI_KEYS_SECRET that dotenv loads from .env; a couple of cases tweak the env var
// to assert KDF behavior, restoring it afterward.

const ORIGINAL_SECRET = process.env.AI_KEYS_SECRET;

beforeEach(() => {
  process.env.AI_KEYS_SECRET = ORIGINAL_SECRET ?? "test-secret-value-please-change";
});

afterEach(() => {
  process.env.AI_KEYS_SECRET = ORIGINAL_SECRET;
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret and never stores it in the clear", () => {
    const plaintext = "sk-ant-abc123-super-secret-key";
    const cipher = encryptSecret(plaintext);

    expect(cipher).not.toContain(plaintext);
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(decryptSecret(cipher)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-key");
    const b = encryptSecret("same-key");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-key");
    expect(decryptSecret(b)).toBe("same-key");
  });

  it("rejects a tampered ciphertext (GCM auth tag)", () => {
    const cipher = encryptSecret("hello-world");
    const parts = cipher.split(":");
    // Flip a byte in the ciphertext segment.
    const data = Buffer.from(parts[3], "base64");
    data[0] ^= 0xff;
    parts[3] = data.toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow("Malformed encrypted secret.");
    expect(() => decryptSecret("v2:a:b:c")).toThrow("Malformed encrypted secret.");
  });

  it("cannot decrypt with a different secret", () => {
    const cipher = encryptSecret("rotate-me");
    process.env.AI_KEYS_SECRET = "an-entirely-different-secret-value";
    expect(() => decryptSecret(cipher)).toThrow();
  });

  it("throws when AI_KEYS_SECRET is missing or too short", () => {
    process.env.AI_KEYS_SECRET = "";
    expect(() => encryptSecret("x")).toThrow(/AI_KEYS_SECRET/);
    process.env.AI_KEYS_SECRET = "short";
    expect(() => encryptSecret("x")).toThrow(/AI_KEYS_SECRET/);
  });
});

describe("secretsEqual", () => {
  it("is true only for identical values", () => {
    expect(secretsEqual("abc", "abc")).toBe(true);
    expect(secretsEqual("abc", "abd")).toBe(false);
    expect(secretsEqual("abc", "abcd")).toBe(false);
  });
});
