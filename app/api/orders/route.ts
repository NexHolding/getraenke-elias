import { createHash } from "node:crypto";
import { serviceDb, sameOrigin } from "@/lib/server";
import { orderSchema } from "@/lib/validation";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (Number(req.headers.get("content-length") || 0) > 30000)
      return Response.json({ error: "Anfrage zu groß." }, { status: 413 });
    const parsed = orderSchema.safeParse(await req.json());
    if (!parsed.success)
      return Response.json(
        {
          error:
            "Bitte vervollständige deine Kontaktdaten und die Altersbestätigung.",
        },
        { status: 400 },
      );
    const v = parsed.data;
    const db = serviceDb();
    const existing = await db
      .from("orders")
      .select("number")
      .eq("request_id", v.request_id)
      .maybeSingle();
    if (existing.data)
      return Response.json({
        number: `EL-${String(existing.data.number).padStart(5, "0")}`,
      });
    const ip =
      req.headers.get("x-vercel-forwarded-for") ||
      req.headers.get("x-forwarded-for") ||
      "local";
    const key = createHash("sha256")
      .update(ip + (process.env.RATE_LIMIT_SALT || "elias"))
      .digest("hex");
    const { data: allowed, error: limitError } = await db.rpc(
      "check_request_limit",
      { p_key: key },
    );
    if (limitError) throw limitError;
    if (!allowed)
      return Response.json(
        {
          error:
            "Zu viele Anfragen. Bitte versuche es später erneut oder rufe uns an.",
        },
        { status: 429 },
      );
    if (new Set(v.items.map((i) => i.id)).size !== v.items.length)
      return Response.json(
        { error: "Doppelte Artikel. Bitte Auswahl aktualisieren." },
        { status: 400 },
      );
    const { data: products, error } = await db
      .from("products")
      .select("*")
      .in(
        "id",
        v.items.map((i) => i.id),
      )
      .eq("active", true);
    if (error || !products || products.length !== v.items.length)
      throw new Error("Products unavailable");
    const items = v.items.map((i) => {
      const p = products.find((p) => p.id === i.id)!;
      return {
        id: p.id,
        name: p.name,
        quantity: i.quantity,
        price_cents: p.price_cents,
        deposit_cents: p.deposit_cents,
        pack_count: p.pack_count,
        kind: p.kind,
      };
    });
    if (
      items.reduce(
        (s, i) =>
          s + (i.kind === "beverage" && i.pack_count > 1 ? i.quantity : 0),
        0,
      ) < 4
    )
      return Response.json(
        { error: "Die Mindestabnahmemenge beträgt vier Kisten." },
        { status: 400 },
      );
    const { data: order, error: insertError } = await db
      .from("orders")
      .insert({
        request_id: v.request_id,
        customer_name: v.customer_name,
        email: v.email,
        phone: v.phone,
        address: v.address,
        notes: v.notes,
        items,
      })
      .select("number")
      .single();
    if (insertError?.code === "23505") {
      const repeat = await db
        .from("orders")
        .select("number")
        .eq("request_id", v.request_id)
        .single();
      if (repeat.data)
        return Response.json({
          number: `EL-${String(repeat.data.number).padStart(5, "0")}`,
        });
    }
    if (insertError) throw insertError;
    return Response.json(
      { number: `EL-${String(order.number).padStart(5, "0")}` },
      { status: 201 },
    );
  } catch {
    return Response.json(
      {
        error:
          "Deine Anfrage konnte nicht gespeichert werden. Bitte versuche es erneut oder rufe 07131 / 797 52 25 an.",
      },
      { status: 503 },
    );
  }
}
