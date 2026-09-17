import "server-only";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { serviceDb } from "./server";
export const tokenHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}
export function verifyPin(pin: string, hash: string) {
  const [salt, stored] = hash.split(":");
  if (!salt || !stored) return false;
  const b = Buffer.from(stored, "hex");
  return b.length === 32 && timingSafeEqual(scryptSync(pin, salt, 32), b);
}
export async function terminalDevice() {
  const token = (await cookies()).get("elias-device")?.value;
  if (!token) return null;
  const { data } = await serviceDb()
    .from("terminal_devices")
    .select("id,name")
    .eq("token_hash", tokenHash(token))
    .eq("active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data;
}
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
