import { timingSafeEqual } from "node:crypto";
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
  const { data, error } = await serviceDb().rpc("generate_reorders");
  if (error)
    return Response.json(
      { error: "Nachbestellungen konnten nicht erzeugt werden." },
      { status: 500 },
    );
  return Response.json({ drafts_created: data });
}
