import { test } from "node:test";
import assert from "node:assert/strict";
import { staffOrderSchema, staffSubscriptionSchema } from "../lib/staff-orders";
import { planDay } from "../lib/delivery-plan";
import type { Order, Settings } from "../lib/types";
const value = {
  request_id: crypto.randomUUID(),
  customer_id: crypto.randomUUID(),
  items: [{ id: "a", quantity: 2 }],
  delivery_date: "2026-09-18",
  interval: "biweekly",
  notes: "",
};
test("staff order input rejects duplicate, fractional, empty and unknown interval inputs", () => {
  assert.ok(staffOrderSchema.safeParse(value).success);
  for (const items of [
    [],
    [{ id: "a", quantity: 1.5 }],
    [{ id: "a", quantity: 0 }],
    [
      { id: "a", quantity: 1 },
      { id: "a", quantity: 2 },
    ],
  ])
    assert.equal(
      staffOrderSchema.safeParse({ ...value, items }).success,
      false,
    );
  assert.equal(
    staffOrderSchema.safeParse({ ...value, interval: "daily" }).success,
    false,
  );
  assert.equal(
    staffSubscriptionSchema.safeParse({
      id: crypto.randomUUID(),
      items: value.items,
      next_date: value.delivery_date,
      interval: "weekly",
      active: true,
    }).success,
    false,
  );
});
test("delivery planning never brings a future requested delivery forward", () => {
  const orders = [
    { id: "future", requested_delivery_date: "2026-09-18" },
    { id: "today", requested_delivery_date: "2026-09-17" },
    { id: "undated" },
  ] as Order[];
  const plan = planDay(orders, "2026-09-17", {
    delivery_days: [4],
    delivery_from: "10:00",
    delivery_to: "18:00",
    delivery_stop_minutes: 10,
  } as Settings);
  assert.deepEqual(
    plan.stops.map((s) => s.id),
    ["today", "undated"],
  );
  assert.equal(plan.unplanned[0].id, "future");
});
