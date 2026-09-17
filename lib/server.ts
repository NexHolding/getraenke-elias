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
export async function requireStaff() {
  const db = await userDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const { data } = await db
    .from("staff")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!data) throw new Error("FORBIDDEN");
  return { db, user, role: data.role };
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
