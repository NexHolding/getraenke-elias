import { isSystemAccountEmail } from "./account-visibility";
import { can } from "./permissions";
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
export function serviceDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function userDb() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (c) => {
          try {
            c.forEach((x) => jar.set(x.name, x.value, x.options));
          } catch {}
        },
      },
    },
  );
}
export async function requireStaff(module?: string) {
  const db = await userDb();
  const jar = await cookies();
  let id: string | undefined;
  if (jar.get("elias-device")) {
    const { terminalDevice, tokenHash } = await import("./terminal");
    const device = await terminalDevice();
    const token = jar.get("elias-operator")?.value;
    if (!device || !token) throw new Error("UNAUTHORIZED");
    const { data } = await serviceDb()
      .from("terminal_sessions")
      .select("user_id")
      .eq("token_hash", tokenHash(token))
      .eq("device_id", device.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    id = data?.user_id;
  } else {
    const {
      data: { user },
    } = await db.auth.getUser();
    id = user?.id;
  }
  if (!id) throw new Error("UNAUTHORIZED");
  const { data } = await serviceDb()
    .from("staff")
    .select(
      "user_id,role,name,email,permissions,active,number,finance_readonly",
    )
    .eq("user_id", id)
    .maybeSingle();
  if (!data || !data.active) throw new Error("FORBIDDEN");
  if (module && !can(data, module)) throw new Error("FORBIDDEN");
  return {
    db,
    user: { id },
    ...data,
    name: isSystemAccountEmail(data.email) ? "Administration" : data.name,
  };
}
export function safeError(e: unknown) {
  const m = e instanceof Error ? e.message : "Fehler";
  return Response.json(
    {
      error:
        m === "UNAUTHORIZED"
          ? "Bitte anmelden."
          : m === "FORBIDDEN"
            ? "Keine Berechtigung."
            : m.startsWith("HINWEIS:")
              ? m.slice(8)
              : "Die Aktion konnte nicht gespeichert werden. Bitte Eingaben prüfen und erneut versuchen.",
    },
    { status: m === "UNAUTHORIZED" ? 401 : m === "FORBIDDEN" ? 403 : 400 },
  );
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    new URL(origin).host !== (req.headers.get("host") || new URL(req.url).host)
  )
    throw new Error("FORBIDDEN");
}
