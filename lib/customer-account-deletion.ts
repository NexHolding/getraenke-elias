import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
/** Retryable second phase: hard-delete Supabase Auth, not just disable the login. */
export async function finishCustomerDeletion(db: SupabaseClient, id: string) {
  const { data: job, error } = await db
    .from("customer_account_deletions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (job.status === "completed") return job;
  if (!job.auth_user_id) throw Error("Missing deletion subject");
  const { error: attemptError } = await db
    .from("customer_account_deletions")
    .update({
      attempts: job.attempts + 1,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (attemptError) throw attemptError;
  const { error: deleteError } = await db.auth.admin.deleteUser(
    job.auth_user_id,
    false,
  );
  // An already removed auth record means a previous attempt completed before the
  // job marker was saved. Only explicit user-not-found is accepted as success.
  if (deleteError && deleteError.code !== "user_not_found") throw deleteError;
  const { data: done, error: doneError } = await db
    .from("customer_account_deletions")
    .update({
      status: "completed",
      auth_user_id: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (doneError) throw doneError;
  return done;
}
export async function finishPendingCustomerDeletions(db: SupabaseClient) {
  const { data, error } = await db
    .from("customer_account_deletions")
    .select("id")
    .eq("status", "pending")
    .order("requested_at")
    .limit(20);
  if (error) throw error;
  let completed = 0;
  for (const job of data || [])
    try {
      await finishCustomerDeletion(db, job.id);
      completed++;
    } catch {
      /* Keep durable pending record for retry and admin inspection. */
    }
  const { error: cleanup } = await db
    .from("customer_account_deletions")
    .delete()
    .eq("status", "completed")
    .lt("completed_at", new Date(Date.now() - 30 * 86400000).toISOString());
  if (cleanup) throw cleanup;
  return { completed, pending: (data || []).length - completed };
}
