import { fillCustomerDeliveryDefaults } from "@/lib/customer-delivery-defaults";
import { initialOrderPaymentApproval } from "@/lib/order-payment-policy";
import { isSystemAccountEmail } from "@/lib/account-visibility";
import { createHash } from "node:crypto";
import { serviceDb, sameOrigin, userDb } from "@/lib/server";
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
            "Bitte vervollständige Kontaktdaten, Straße, Hausnummer, fünfstellige Postleitzahl, Ort und Altersbestätigung.",
        },
        { status: 400 },
      );
    const v = parsed.data;
    if (isSystemAccountEmail(v.email))
      return Response.json(
        { error: "Bitte eine Kunden-E-Mail-Adresse verwenden." },
        { status: 400 },
      );
    const db = serviceDb();
    const auth = await userDb();
    const {
      data: { user },
    } = await auth.auth.getUser();
    const { data: cfg } = await db
      .from("settings")
      .select("value")
      .eq("id", 1)
      .single();
    if (!user && cfg?.value?.guest_orders === false)
      return Response.json(
        {
          error:
            "Bitte im Kundenkonto anmelden. Gastbestellungen sind deaktiviert.",
        },
        { status: 401 },
      );
    let customer = null;
    if (user) {
      const { signedCustomer } = await import("@/lib/customer-server");
      customer = await signedCustomer();
      v.email = customer.email;
    }
    const existing = await db
      .from("orders")
      .select("number,status,auto_confirmed_at,approved_payment_method")
      .eq("request_id", v.request_id)
      .maybeSingle();
    if (existing.data)
      return Response.json({
        number: `EL-${String(existing.data.number).padStart(5, "0")}`,
        status: existing.data.status,
        payment_pending: !existing.data.approved_payment_method,
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
        tax_rate: p.tax_rate,
        deposit_tax_rate: p.deposit_tax_rate,
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
    if (!customer) {
      const { data: found } = await db
        .from("customers")
        .select("*")
        .eq("email", v.email.toLowerCase())
        .maybeSingle();
      customer = found;
      if (!customer) {
        const { data: created, error } = await db
          .from("customers")
          .insert({
            payment_method: "cash",
            name: v.customer_name,
            email: v.email.toLowerCase(),
            phone: v.phone,
            address: v.address,
            street: v.street,
            house_number: v.house_number,
            postal_code: v.postal_code,
            city: v.city,
          })
          .select("*")
          .single();
        if (error?.code === "23505") {
          const { data: repeat } = await db
            .from("customers")
            .select("*")
            .eq("email", v.email.toLowerCase())
            .single();
          customer = repeat;
        } else if (error) throw error;
        else customer = created;
      }
    }
    if (user && customer) {
      customer = await fillCustomerDeliveryDefaults(db, customer, user.id, v);
    }
    const { data: order, error: insertError } = await db
      .from("orders")
      .insert({
        request_id: v.request_id,
        requested_payment_method: v.requested_payment_method,
        approved_payment_method: initialOrderPaymentApproval(
          v.requested_payment_method,
          user?.id,
          customer,
        ),
        customer_id: customer?.id,
        preference_snapshot: user
          ? {
              windows: customer?.windows,
              dropoff_allowed: customer?.dropoff_allowed,
              dropoff_note: customer?.dropoff_note,
              latitude:
                customer?.address === v.address ? customer?.latitude : null,
              longitude:
                customer?.address === v.address ? customer?.longitude : null,
            }
          : {},
        customer_name: v.customer_name,
        email: v.email,
        phone: v.phone,
        address: v.address,
        street: v.street,
        house_number: v.house_number,
        postal_code: v.postal_code,
        city: v.city,
        notes: v.notes,
        items,
      })
      .select("number,status,auto_confirmed_at,approved_payment_method")
      .single();
    if (insertError?.code === "23505") {
      const repeat = await db
        .from("orders")
        .select("number,status,auto_confirmed_at,approved_payment_method")
        .eq("request_id", v.request_id)
        .single();
      if (repeat.data)
        return Response.json({
          number: `EL-${String(repeat.data.number).padStart(5, "0")}`,
          status: repeat.data.status,
          payment_pending: !repeat.data.approved_payment_method,
        });
    }
    if (insertError) throw insertError;
    return Response.json(
      {
        number: `EL-${String(order.number).padStart(5, "0")}`,
        status: order.status,
        payment_pending: !order.approved_payment_method,
      },
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
