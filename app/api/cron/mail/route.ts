import { timingSafeEqual } from "node:crypto";
import { dispatchMail } from "@/lib/mail";
import { serviceDb } from "@/lib/server";
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
  if (!data?.value.smtp_enabled) return Response.json({ skipped: true });
  try {
    return Response.json(await dispatchMail());
  } catch {
    return Response.json(
      { error: "E-Mail-Verbindung nicht verfügbar." },
      { status: 503 },
    );
  }
}
