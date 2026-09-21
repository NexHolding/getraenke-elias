import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { userDb, serviceDb, sameOrigin, safeError } from "@/lib/server";
import { finishCustomerDeletion } from "@/lib/customer-account-deletion";
export const maxDuration = 60;
// The random request ID is a deletion-status capability, never an account ID.
// This endpoint exposes only processing state; it cannot start a deletion.
export async function GET(req: Request) {
  try {
    const requestId = new URL(req.url).searchParams.get("request_id");
    if (!requestId) {
      const auth = await userDb();
      const {
        data: { user },
      } = await auth.auth.getUser();
      if (!user?.email) throw Error("UNAUTHORIZED");
      const { data: staff, error } = await serviceDb()
        .from("staff")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (staff) throw Error("FORBIDDEN");
      return Response.json(
        { email: user.email },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const id = z.uuid().parse(requestId);
    const { data, error } = await serviceDb()
      .from("customer_account_deletions")
      .select("status,retained_business_records")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return Response.json(data || { status: "unknown" }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (Number(req.headers.get("content-length") || 0) > 5000)
      return Response.json({ error: "Anfrage zu groß." }, { status: 413 });
    const value = z
      .object({
        request_id: z.uuid(),
        password: z.string().min(1).max(256),
        confirmation: z.literal("KONTO LÖSCHEN"),
      })
      .parse(await req.json());
    const auth = await userDb();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user?.email) throw Error("UNAUTHORIZED");
    const db = serviceDb();
    const { data: staff, error: staffError } = await db
      .from("staff")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (staff) throw Error("FORBIDDEN");
    const { data: allowed, error: rateError } = await db.rpc(
      "check_request_limit",
      { p_key: `delete-account:${user.id}` },
    );
    if (rateError) throw rateError;
    if (!allowed)
      return Response.json(
        { error: "Zu viele Versuche. Bitte später erneut versuchen." },
        { status: 429 },
      );
    const verifier = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    try {
      const { data, error } = await verifier.auth.signInWithPassword({
        email: user.email,
        password: value.password,
      });
      if (error || data.user?.id !== user.id)
        return Response.json(
          { error: "Passwort nicht korrekt. Dein Konto wurde nicht gelöscht." },
          { status: 400 },
        );
      const { data: job, error: prepareError } = await db.rpc(
        "prepare_customer_account_deletion",
        { p_user: user.id, p_request: value.request_id },
      );
      if (prepareError) throw prepareError;
      let status = "pending";
      try {
        status = (await finishCustomerDeletion(db, job.id)).status;
      } catch {
        /* Cron completes a durable accepted request. */
      }
      await auth.auth.signOut({ scope: "global" });
      return Response.json(
        {
          request_id: job.id,
          status,
          retained_business_records: job.retained_business_records,
        },
        {
          status: status === "completed" ? 200 : 202,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    } finally {
      await verifier.auth.signOut({ scope: "local" });
    }
  } catch (e) {
    return safeError(e);
  }
}
