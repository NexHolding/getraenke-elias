import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTourPreview,
  subscriptionNext,
} from "../lib/subscription-preview";
import { deliveryWindowsSchema } from "../lib/delivery-windows";
import type {
  Customer,
  Product,
  Subscription,
  Settings,
  Order,
} from "../lib/types";
const now = new Date("2026-09-21T12:00:00Z"),
  date = "2026-09-22";
const customer = {
  id: "c",
  name: "Kunde",
  windows: [{ day: 2, from: "12:00", to: "15:00" }],
} as Customer;
const sub = {
  id: "s",
  customer_id: "c",
  items: [{ id: "p", quantity: 4 }],
  active: true,
  next_date: date,
  interval: "weekly",
} as Subscription;
const product = {
  id: "p",
  name: "Wasser",
  active: true,
  price_cents: 1000,
  deposit_cents: 300,
} as Product;
const cfg = {
  delivery_days: [1, 2, 3, 4, 5],
  delivery_from: "10:00",
  delivery_to: "18:00",
} as Settings;
const run = (
  orders: Order[] = [],
  subs = [sub],
  customers = [customer],
  day = date,
) => buildTourPreview(orders, subs, customers, [product], day, cfg, now);
test("tomorrow and next week's tour show a subscription without creating an order or advancing it", () => {
  const before = JSON.stringify(sub);
  const preview = run();
  assert.equal(preview.orders.length, 1);
  assert.equal(preview.orders[0].eta_start, "12:00");
  assert.equal(preview.orders[0].preview_only, true);
  assert.equal(preview.orders[0].items[0].quantity, 4);
  assert.equal(run([], undefined, undefined, "2026-09-29").orders.length, 1);
  assert.equal(JSON.stringify(sub), before);
  assert.equal(run([], undefined, undefined, "2026-09-21").orders.length, 0);
});
test("existing recurrence replaces forecast even if cancelled; pending requests remain visible", () => {
  const o = {
    ...run().orders[0],
    id: "real",
    preview_only: undefined,
    created_at: "2026-09-20T12:00:00Z",
  };
  assert.equal(run([o]).orders.length, 1);
  assert.equal(run([o]).orders[0].id, "real");
  assert.equal(run([{ ...o, status: "cancelled" }]).orders.length, 0);
  const pending = run([{ ...o, status: "new" }]);
  assert.equal(pending.orders.length, 0);
  assert.match(pending.unplanned[0].reason, /Freigabe/);
});
test("missing windows, paused subscriptions and unavailable products do not get a misleading stop", () => {
  assert.match(
    run([], undefined, [{ ...customer, windows: [] }]).unplanned[0].reason,
    /Lieferzeiten fehlen/,
  );
  assert.equal(run([], [{ ...sub, active: false }]).orders.length, 0);
  assert.match(
    run([], [{ ...sub, items: [{ id: "missing", quantity: 1 }] }]).unplanned[0]
      .reason,
    /Artikel/,
  );
});
test("monthly recurrence keeps its anchor after February", () => {
  assert.equal(subscriptionNext("2027-02-28", "monthly", 31), "2027-03-31");
  assert.equal(subscriptionNext("2026-01-31", "monthly", 31), "2026-02-28");
});
test("delivery windows require a valid weekday and strictly later end time", () => {
  assert.ok(deliveryWindowsSchema.safeParse(customer.windows).success);
  for (const value of [
    [],
    [{ day: 0, from: "10:00", to: "11:00" }],
    [{ day: 2, from: "12:00", to: "12:00" }],
    [{ day: 2, from: "26:00", to: "27:00" }],
  ])
    assert.equal(deliveryWindowsSchema.safeParse(value).success, false);
});
