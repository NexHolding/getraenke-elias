import { invoiceDetails } from "@/lib/invoice-details";
import { subscriptionCommandSchema } from "@/lib/subscriptions";
import { deliveryAddressFields } from "@/lib/delivery-address";
import { serviceDb, sameOrigin, safeError } from "@/lib/server";
import { readAllRows } from "@/lib/database-read";
import { signedCustomer } from "@/lib/customer-server";
import { customerSchema } from "@/lib/operations-validation";
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
        deliveries: deliveries.filter((d) => d.status === "delivered"),
        invoices: await invoiceDetails(invoices as { id: string }[]),
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
        payment_method: c.payment_method || "invoice",
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
    } else if (b.action === "delivery-subscription") {
      const value = subscriptionCommandSchema.parse({
        ...b.value,
        customer_id: c.id,
      });
      const { data, error } = await db.rpc("save_delivery_subscription", {
        p_value: value,
        p_actor: c.user_id,
        p_customer: true,
      });
      if (error) throw new Error(error.message);
      return Response.json(data);
    } else throw new Error("Invalid");
    return Response.json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
