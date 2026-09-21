import type { SupabaseClient } from "@supabase/supabase-js";
import { isSystemAccountEmail } from "./account-visibility";

export const CUSTOMER_LINK_REQUIRED =
  "HINWEIS:Dein Online-Zugang ist angelegt. Für die Zuordnung zu einer bereits vorhandenen Kundenakte kontaktiere bitte Getränke Elias unter 07131 / 797 52 25. Bestehende Kundendaten werden erst nach Prüfung freigeschaltet.";

// An automatically confirmed Supabase account is not proof of email ownership.
// Existing records can only be read through their explicit auth-user association.
export async function provisionCustomer(
  db: SupabaseClient,
  user: {
    id: string;
    email?: string;
    email_confirmed_at?: string;
    user_metadata?: Record<string, unknown>;
  },
) {
  if (!user.email || !user.email_confirmed_at) throw new Error("UNAUTHORIZED");
  if (isSystemAccountEmail(user.email)) throw new Error("FORBIDDEN");
  const readLinked = () =>
    db.from("customers").select("*").eq("user_id", user.id).maybeSingle();
  const { data: linked, error } = await readLinked();
  if (error) throw error;
  if (linked) return linked;
  const { data: created, error: insertError } = await db
    .from("customers")
    .insert({
      user_id: user.id,
      email: user.email.trim().toLowerCase(),
      name: String(user.user_metadata?.name || user.email).slice(0, 150),
    })
    .select("*")
    .single();
  if (insertError?.code === "23505") {
    // Parallel first loads may create the same account; never claim another
    // record just because its email address matches an unverified login.
    const { data: concurrent, error: readError } = await readLinked();
    if (readError) throw readError;
    if (concurrent) return concurrent;
    throw new Error(CUSTOMER_LINK_REQUIRED);
  }
  if (insertError) throw insertError;
  return created;
}
