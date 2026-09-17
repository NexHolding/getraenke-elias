import { timingSafeEqual } from "node:crypto";
import { dispatchAuthMail } from "@/lib/auth-mail-dispatch";
import { dispatchMail } from "@/lib/mail";
import { serviceDb } from "@/lib/server";
export const maxDuration = 120;
export async function GET(req: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`,
    actual = req.headers.get("authorization") || "";
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });
  const { data } = await serviceDb()
    .from("settings")
    .select("value")
    .eq("id", 1)
    .single();
  try {
    const auth = await dispatchAuthMail();
    if (!data?.value.smtp_enabled)
      return Response.json({ skipped: true, auth_sent: auth.sent });
    const mail = await dispatchMail();
    return Response.json({ ...mail, auth_sent: auth.sent });
  } catch {
    return Response.json(
      { error: "E-Mail-Verbindung nicht verfügbar." },
      { status: 503 },
    );
  }
}
