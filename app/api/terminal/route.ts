import { SYSTEM_ACCOUNT_EMAIL } from "@/lib/account-visibility";
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
    if (!device) return Response.json({ registered: false });
    const { data, error } = await serviceDb()
      .from("staff")
      .select("user_id,name,number")
      .eq("active", true)
      .neq("email", SYSTEM_ACCOUNT_EMAIL)
      .not("pin_hash", "is", null);
    if (error) throw error;
    return Response.json(
      { registered: true, name: device.name, employees: data },
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
        .select("user_id,pin_hash")
        .eq("user_id", v.user_id)
        .eq("active", true)
        .neq("email", SYSTEM_ACCOUNT_EMAIL)
        .maybeSingle();
      if (!s?.pin_hash || !verifyPin(v.pin, s.pin_hash))
        throw new Error("HINWEIS:PIN nicht korrekt.");
      const token = newToken();
      const { error } = await db.from("terminal_sessions").insert({
        device_id: device.id,
        user_id: s.user_id,
        token_hash: tokenHash(token),
        expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
      });
      if (error) throw error;
      jar.set("elias-operator", token, { ...cookieOptions, maxAge: 8 * 3600 });
    } else if (body.action === "lock") {
      const token = jar.get("elias-operator")?.value;
      if (token)
        await db
          .from("terminal_sessions")
          .delete()
          .eq("token_hash", tokenHash(token));
      jar.delete("elias-operator");
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
