import { deliveryAddressFields } from "@/lib/delivery-address";
import { serviceDb, sameOrigin, safeError } from "@/lib/server";
import { readAllRows } from "@/lib/database-read";
import { signedCustomer } from "@/lib/customer-server";
import {
  customerSchema,
  subscriptionSchema,
} from "@/lib/operations-validation";
export async function GET() {
  try {
    const c = await signedCustomer();
    const read = (table: string) =>
      readAllRows(table, {
        customerId: c.id,
        order: "created_at",
        ascending: false,
      });
    const [orders, deliveries, invoices, subscriptions] = await Promise.all(
      ["orders", "deliveries", "invoices", "subscriptions"].map(read),
    );
    return Response.json(
      {
        customer: { ...c, ...deliveryAddressFields(c), notes: "" },
        orders,
        deliveries,
        invoices,
        subscriptions,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const c = await signedCustomer();
    const db = serviceDb();
    const b = await req.json();
    if (b.action === "profile") {
      const v = customerSchema.parse({
        ...b.value,
        id: c.id,
        email: c.email,
        notes: c.notes,
        latitude: c.latitude,
        longitude: c.longitude,
      });
      const { id, ...record } = v;
      if (record.address !== c.address) {
        record.latitude = null;
        record.longitude = null;
      }
      const { error } = await db
        .from("customers")
        .update({
          ...record,
          ...(record.address !== c.address
            ? { latitude: null, longitude: null }
            : {}),
        })
        .eq("id", id);
      if (error) throw error;
      const { data: pending } = await db
        .from("orders")
        .select("id,address")
        .eq("customer_id", c.id)
        .in("status", ["new", "confirmed", "partial", "delivering"]);
      for (const order of pending || [])
        await db
          .from("orders")
          .update({
            preference_snapshot: {
              windows: record.windows,
              dropoff_allowed: record.dropoff_allowed,
              dropoff_note: record.dropoff_note,
              latitude:
                record.address === order.address ? record.latitude : null,
              longitude:
                record.address === order.address ? record.longitude : null,
            },
          })
          .eq("id", order.id);
    } else if (b.action === "subscription") {
      const v = subscriptionSchema.parse(b.value);
      if (new Set(v.items.map((i) => i.id)).size !== v.items.length)
        throw new Error("Invalid");
      const { data: p, error } = await db
        .from("products")
        .select("id,pack_count,kind")
        .in(
          "id",
          v.items.map((i) => i.id),
        )
        .eq("active", true);
      if (error || p?.length !== v.items.length)
        throw new Error("HINWEIS:Ein Artikel ist nicht mehr verfügbar.");
      if (
        v.items.reduce(
          (s, i) =>
            s + (p.find((x) => x.id === i.id)!.pack_count > 1 ? i.quantity : 0),
          0,
        ) < 4
      )
        throw new Error(
          "HINWEIS:Ein Lieferabo benötigt mindestens vier Kisten.",
        );
      const today = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Berlin",
      }).format(new Date());
      if (v.active && v.next_date < today)
        throw new Error("HINWEIS:Bitte einen zukünftigen Starttermin wählen.");
      const { id, ...record } = v;
      const result = id
        ? await db
            .from("subscriptions")
            .update(record)
            .eq("id", id)
            .eq("customer_id", c.id)
            .select("id")
        : await db
            .from("subscriptions")
            .insert({ ...record, customer_id: c.id })
            .select("id");
      if (result.error || !result.data?.length) throw new Error("FORBIDDEN");
    } else throw new Error("Invalid");
    return Response.json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
