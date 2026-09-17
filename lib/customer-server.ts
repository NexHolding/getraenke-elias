import "server-only";
import { isSystemAccountEmail } from "./account-visibility";
import { userDb, serviceDb } from "./server";
export async function signedCustomer() {
  const auth = await userDb();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user?.email || !user.email_confirmed_at) throw new Error("UNAUTHORIZED");
  if (isSystemAccountEmail(user.email)) throw new Error("FORBIDDEN");
  const db = serviceDb();
  const email = user.email.toLowerCase();
  const { data: existing, error } = await db
    .from("customers")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    if (existing.user_id && existing.user_id !== user.id)
      throw new Error("FORBIDDEN");
    if (!existing.user_id) {
      const { error } = await db
        .from("customers")
        .update({ user_id: user.id })
        .eq("id", existing.id)
        .is("user_id", null);
      if (error) throw error;
    }
    return { ...existing, user_id: user.id };
  }
  const { data, error: insertError } = await db
    .from("customers")
    .insert({
      user_id: user.id,
      email,
      name: String(user.user_metadata?.name || email),
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data;
}
