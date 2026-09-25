import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";

function encryptionKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("KEY_ENCRYPTION_SECRET is not set");
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) throw new Error("KEY_ENCRYPTION_SECRET must be 32 bytes, base64-encoded");
  return key;
}

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext). */
export function encryptSecret(plain: Uint8Array): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(encoded: string): Uint8Array {
  const [iv, tag, ct] = encoded.split(".").map((s) => Buffer.from(s, "base64"));
  if (!iv || !tag || !ct) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(ct), decipher.final()]));
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
