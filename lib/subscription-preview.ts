import { isSystemAccountEmail } from "./account-visibility";
import type { Customer, Order, Product, Settings, Subscription } from "./types";
import { earliestNewDelivery, earliestOrderDelivery } from "./delivery-date";
import { nextDate, planDay } from "./delivery-plan";
export type PreviewOrder = Order & { preview_only?: boolean };
export type TourPreview = {
  orders: PreviewOrder[];
  unplanned: { id: string; name: string; reason: string }[];
  subscriptions: number;
};
export function subscriptionNext(
  date: string,
  interval: string,
  anchor: number,
) {
  const next = nextDate(date, interval);
  if (interval === "weekly" || interval === "biweekly") return next;
  const d = new Date(next + "T12:00:00Z");
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(anchor, last));
  return d.toISOString().slice(0, 10);
}
/** Read-only forecast: no order, reservation, message or subscription advance. */
export function buildTourPreview(
  orders: Order[],
  subscriptions: (Subscription & { anchor_day?: number })[],
  customers: Customer[],
  products: Product[],
  date: string,
  cfg: Settings,
  now = new Date(),
): TourPreview {
  orders = orders.filter((o) => !isSystemAccountEmail(o.email));
  const candidates: PreviewOrder[] = orders.filter(
    (o) =>
      ["confirmed", "partial"].includes(o.status) &&
      (!o.delivery_date || o.delivery_date === date),
  );
  const issues: TourPreview["unplanned"] = [];
  for (const o of orders.filter(
    (o) => o.status === "new" && (earliestOrderDelivery(o) || "9999") <= date,
  ))
    issues.push({
      id: o.id,
      name: o.customer_name,
      reason: "Auftrag wartet noch auf Verfügbarkeit oder Freigabe",
    });
  let count = 0;
  for (const sub of subscriptions) {
    if (!sub.active || sub.next_date > date) continue;
    const customer = customers.find((c) => c.id === sub.customer_id);
    if (!customer || isSystemAccountEmail(customer.email)) continue;
    // Find the recurrence on/before the selected day without creating old backlog.
    let due = sub.next_date;
    const anchor = sub.anchor_day || Number(sub.next_date.slice(-2));
    for (let i = 0; i < 600; i++) {
      const next = subscriptionNext(due, sub.interval, anchor);
      if (next > date) break;
      due = next;
    }
    if (
      orders.some(
        (o) => o.subscription_id === sub.id && o.recurrence_date === due,
      )
    )
      continue;
    const earliest =
      due > earliestNewDelivery(now) ? due : earliestNewDelivery(now);
    if (date < earliest) continue;
    // An overdue occurrence remains visible as an outstanding request until generated.
    const id = `subscription:${sub.id}:${due}`;
    count++;
    if (!customer.windows?.length) {
      issues.push({
        id,
        name: customer.name,
        reason: "Lieferzeiten fehlen im Kundenprofil",
      });
      continue;
    }
    const items = sub.items.map((i) => {
      const p = products.find((p) => p.id === i.id && p.active);
      return p && p.deposit_cents !== null
        ? {
            id: p.id,
            name: p.name,
            quantity: i.quantity,
            price_cents: p.price_cents,
            deposit_cents: p.deposit_cents,
            tax_rate: p.tax_rate,
            deposit_tax_rate: p.deposit_tax_rate,
            pack_count: p.pack_count,
            kind: p.kind,
          }
        : null;
    });
    if (items.some((i) => !i)) {
      issues.push({
        id,
        name: customer.name,
        reason: "Artikel nicht verfügbar oder Pfand ungeklärt",
      });
      continue;
    }
    candidates.push({
      id,
      number: 0,
      preview_only: true,
      created_at: now.toISOString(),
      requested_delivery_date: earliest,
      customer_id: customer.id,
      customer_name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      street: customer.street,
      house_number: customer.house_number,
      postal_code: customer.postal_code,
      city: customer.city,
      status: "confirmed",
      notes: "Abo-Vorschau – noch kein Auftrag",
      items: items as Order["items"],
      delivered: {},
      preference_snapshot: {
        windows: customer.windows,
        dropoff_allowed: customer.dropoff_allowed,
        dropoff_note: customer.dropoff_note,
        latitude: customer.latitude,
        longitude: customer.longitude,
      },
      subscription_id: sub.id,
      recurrence_date: due,
    } as PreviewOrder);
  }
  const plan = planDay(candidates, date, cfg, now);
  return {
    orders: plan.stops.map((s) => ({
      ...candidates.find((o) => o.id === s.id)!,
      delivery_date: date,
      eta_start: s.eta_start,
      eta_end: s.eta_end,
      route_position: s.position,
    })),
    unplanned: [
      ...issues,
      ...plan.unplanned.map((u) => ({
        ...u,
        name:
          candidates.find((o) => o.id === u.id)?.customer_name || "Bestellung",
      })),
    ],
    subscriptions: count,
  };
}
