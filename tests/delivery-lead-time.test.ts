import { test } from "node:test";
import assert from "node:assert/strict";
import { earliestNewDelivery } from "../lib/delivery-date";
import { planDay } from "../lib/delivery-plan";
import type { Order, Settings } from "../lib/types";
const cfg = {
  delivery_days: [1, 2, 3, 4, 5],
  delivery_from: "10:00",
  delivery_to: "18:00",
  delivery_stop_minutes: 10,
} as Settings;
const order = (created_at: string, extra = {}) =>
  ({ id: "a", created_at, ...extra }) as Order;
const now = new Date("2026-09-21T12:17:40Z"); // Monday 14:17 Berlin

test("today's orders cannot be planned today, but can be planned tomorrow", () => {
  const orders = [order("2026-09-21T08:00:00Z")];
  const today = planDay(orders, "2026-09-21", cfg, now);
  assert.equal(today.stops.length, 0);
  assert.match(today.unplanned[0].reason, /22.09.2026/);
  assert.equal(
    planDay(orders, "2026-09-22", cfg, now).stops[0].eta_start,
    "10:20",
  );
});
test("older orders planned today never receive expired windows", () => {
  const orders = [order("2026-09-20T08:00:00Z")];
  assert.equal(
    planDay(orders, "2026-09-21", cfg, now).stops[0].eta_start,
    "14:38",
  );
  assert.equal(
    planDay(orders, "2026-09-21", cfg, new Date("2026-09-21T15:50:00Z")).stops
      .length,
    0,
  );
  assert.equal(planDay(orders, "2026-09-20", cfg, now).stops.length, 0);
});
test("Berlin midnight, DST and year boundaries use calendar days", () => {
  assert.equal(
    earliestNewDelivery(new Date("2026-09-21T22:05:00Z")),
    "2026-09-23",
  );
  assert.equal(
    earliestNewDelivery(new Date("2026-03-28T23:05:00Z")),
    "2026-03-30",
  );
  assert.equal(
    earliestNewDelivery(new Date("2026-10-24T22:05:00Z")),
    "2026-10-26",
  );
  assert.equal(
    earliestNewDelivery(new Date("2026-12-31T22:59:00Z")),
    "2027-01-01",
  );
});
test("lead time still respects closed days, later requests and customer windows", () => {
  const received = order("2026-09-21T08:00:00Z", {
    requested_delivery_date: "2026-09-23",
  });
  assert.equal(planDay([received], "2026-09-22", cfg, now).stops.length, 0);
  assert.equal(planDay([received], "2026-09-23", cfg, now).stops.length, 1);
  assert.equal(planDay([received], "2026-09-26", cfg, now).stops.length, 0);
  const early = order("2026-09-20T08:00:00Z", {
    preference_snapshot: { windows: [{ day: 1, from: "10:00", to: "11:00" }] },
  });
  assert.equal(planDay([early], "2026-09-21", cfg, now).stops.length, 0);
  assert.equal(
    planDay([{ id: "missing" } as Order], "2026-09-22", cfg, now).stops.length,
    0,
  );
});
