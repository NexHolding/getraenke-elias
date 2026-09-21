import { canUseTerminal, terminalRoster } from "@/lib/terminal-access";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  userDb,
  serviceDb,
  requireStaff,
  sameOrigin,
  safeError,
} from "@/lib/server";
import {
  terminalDevice,
  newToken,
  tokenHash,
  verifyPin,
  cookieOptions,
} from "@/lib/terminal";
export async function GET() {
  try {
    const device = await terminalDevice();
    if (!device) return Response.json({ registered: false }, { headers: { "Cache-Control": "no-store" } });
    const { data, error } = await serviceDb()
      .from("staff")
      .select("user_id,name,number,email,pin_hash,role,permissions,active,finance_readonly")
      .eq("active", true);
    if (error) throw error;
    return Response.json(
      { registered: true, name: device.name, employees: terminalRoster(data || []) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const body = await req.json();
    const jar = await cookies();
    const db = serviceDb();
    if (body.action === "enroll") {
      const staff = await requireStaff();
      if (staff.role !== "owner") throw new Error("FORBIDDEN");
      const token = newToken();
      const { error } = await db.from("terminal_devices").insert({
        name: z.string().min(2).max(80).parse(body.name),
        token_hash: tokenHash(token),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      if (error) throw error;
      jar.set("elias-device", token, { ...cookieOptions, maxAge: 30 * 86400 });
      jar.delete("elias-operator");
    } else if (body.action === "unlock") {
      const device = await terminalDevice();
      if (!device) throw new Error("UNAUTHORIZED");
      const v = z
        .object({ user_id: z.uuid(), pin: z.string().regex(/^\d{4}$/) })
        .parse(body);
      const { data: allowed } = await db.rpc("check_request_limit", {
        p_key: `pin:${device.id}:${v.user_id}`,
      });
      if (!allowed)
        throw new Error(
          "HINWEIS:Zu viele PIN-Versuche. Bitte später erneut versuchen.",
        );
      const { data: s } = await db
        .from("staff")
        .select("user_id,pin_hash,role,permissions,active,finance_readonly")
        .eq("user_id", v.user_id)
        .eq("active", true)
        .maybeSingle();
      if (!s || !canUseTerminal(s) || !s.pin_hash || !verifyPin(v.pin, s.pin_hash))
        throw new Error("HINWEIS:PIN nicht korrekt.");
      const previousToken = jar.get("elias-operator")?.value;
      if (previousToken) {
        const { error } = await db.from("terminal_sessions").delete().eq("token_hash", tokenHash(previousToken));
        if (error) throw error;
      }
      const token = newToken();
      const { error } = await db.from("terminal_sessions").insert({
        device_id: device.id,
        user_id: s.user_id,
        token_hash: tokenHash(token),
        expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
      });
      if (error) throw error;
      jar.set("elias-operator", token, { ...cookieOptions, maxAge: 8 * 3600 });
      // Successful unlocks do not use up the failed-PIN allowance.
      await db.from("request_limits").delete().eq("key", `pin:${device.id}:${v.user_id}`);
    } else if (body.action === "lock") {
      if (!(await terminalDevice())) {
        // The existing password login authorizes pairing this register on first lock.
        // A stale device cookie must not make password-based recovery impossible.
        const auth = await userDb();
        const { data: { user } } = await auth.auth.getUser();
        if (!user) throw new Error("UNAUTHORIZED");
        const { data: staff } = await db.from("staff")
          .select("role,permissions,active,finance_readonly").eq("user_id", user.id).maybeSingle();
        if (!staff || !canUseTerminal(staff)) throw new Error("FORBIDDEN");
        const deviceToken = newToken();
        const { error } = await db.from("terminal_devices").insert({
          name: "Elias Kasse", token_hash: tokenHash(deviceToken),
          expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        });
        if (error) throw error;
        jar.set("elias-device", deviceToken, { ...cookieOptions, maxAge: 30 * 86400 });
      }
      const token = jar.get("elias-operator")?.value;
      if (token) {
        const { error } = await db.from("terminal_sessions").delete().eq("token_hash", tokenHash(token));
        if (error) throw error;
      }
      jar.delete("elias-operator");
      // Do not leave a parallel password session that could bypass the lock.
      const auth = await userDb();
      const { error: signOutError } = await auth.auth.signOut({ scope: "local" });
      if (signOutError && signOutError.name !== "AuthSessionMissingError") throw signOutError;
    } else if (body.action === "password-login") {
      const auth = await userDb();
      const { data: { user } } = await auth.auth.getUser();
      if (!user) throw new Error("UNAUTHORIZED");
      const { data: staff } = await db.from("staff").select("active").eq("user_id", user.id).maybeSingle();
      if (!staff?.active) throw new Error("FORBIDDEN");
      const token = jar.get("elias-operator")?.value;
      if (token) {
        const { error } = await db.from("terminal_sessions").delete().eq("token_hash", tokenHash(token));
        if (error) throw error;
      }
      jar.delete("elias-operator");
      jar.delete("elias-device");
    } else if (body.action === "release") {
      // A full owner password session is required to unpair, not a cashier PIN.
      const auth = await userDb();
      const {
        data: { user },
      } = await auth.auth.getUser();
      if (!user) throw new Error("UNAUTHORIZED");
      const { data: s } = await db
        .from("staff")
        .select("role")
        .eq("user_id", user.id)
        .eq("active", true)
        .single();
      if (s?.role !== "owner") throw new Error("FORBIDDEN");
      const device = await terminalDevice();
      if (device)
        await db
          .from("terminal_devices")
          .update({ active: false })
          .eq("id", device.id);
      jar.delete("elias-device");
      jar.delete("elias-operator");
    } else throw new Error("Invalid");
    return Response.json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
