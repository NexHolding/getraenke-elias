import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const k = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!k || Buffer.from(k, "hex").length !== 32)
    throw new Error("Encryption key unavailable");
  return Buffer.from(k, "hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  return [
    iv.toString("hex"),
    cipher.update(value, "utf8", "hex") + cipher.final("hex"),
    cipher.getAuthTag().toString("hex"),
  ].join(":");
}
export function decrypt(value: string) {
  const [iv, encrypted, tag] = value.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}
