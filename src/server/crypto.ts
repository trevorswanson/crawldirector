import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

// Server-only by convention (lives under src/server/, like db.ts and the
// services). Envelope encryption for secrets at rest (M4 — invariant #6: BYO API keys never
// reach the client, logs, or provenance). AES-256-GCM with a per-message random
// IV; the auth tag detects tampering. The data key is derived from the
// AI_KEYS_SECRET env var via scrypt with a fixed application salt, so rotating
// the env var invalidates old ciphertexts (intentional — re-enter the keys).
//
// Storage format (single column): "v1:<saltUnused?>". We keep it simple and
// version-prefixed: `v1:<ivB64>:<tagB64>:<ciphertextB64>`.

const VERSION = "v1";
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM standard nonce length
// Fixed, non-secret application salt for the scrypt KDF. The real secret is the
// env var; the salt only domain-separates this derivation.
const KDF_SALT = "crawldirector:ai-keys:v1";

let cachedKey: Buffer | null = null;
let cachedSecret: string | null = null;

function dataKey(): Buffer {
  const secret = process.env.AI_KEYS_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AI_KEYS_SECRET is not set (or too short). Set a strong value in your environment to store AI keys.",
    );
  }
  // Cache the derived key, but re-derive if the env var changed (tests).
  if (cachedKey && cachedSecret === secret) return cachedKey;
  cachedKey = scryptSync(secret, KDF_SALT, KEY_LEN);
  cachedSecret = secret;
  return cachedKey;
}

// Encrypt a plaintext secret for storage. Returns an opaque, versioned string.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

// Decrypt a value produced by encryptSecret. Throws on tamper / wrong key / bad
// format — callers treat that as an unusable key, never as plaintext.
export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed encrypted secret.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// Constant-time compare for any secret-equality checks (not used for keys here,
// exported for reuse). Returns false on length mismatch without leaking timing.
export function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
