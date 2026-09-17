import { test } from "node:test";
import assert from "node:assert/strict";
import { can } from "../lib/permissions";
import { depositFor } from "../lib/deposits";
import { planDay, nextDate } from "../lib/delivery-plan";
import type { Order, Settings } from "../lib/types";
test("deposit includes crate once and exempts wine profiles", () => {
  assert.equal(depositFor("reusable", 6), 240);
  assert.equal(depositFor("beer", 20), 310);
  assert.equal(depositFor("single", 24), 600);
  assert.equal(depositFor("none", 1), 0);
  assert.equal(depositFor("sixpack", 6), 48);
});
test("module permissions cannot be inferred from login or another grant", () => {
  assert.equal(
    can({ role: "staff", permissions: ["kasse"] }, "finanzen"),
    false,
  );
  assert.equal(can({ role: "owner", active: false }, "kasse"), false);
  assert.equal(can({ role: "staff", permissions: ["rabatt"] }, "kasse"), false);
});
const config = {
  delivery_days: [1, 2, 3, 4, 5],
  delivery_from: "10:00",
  delivery_to: "18:00",
  delivery_stop_minutes: 10,
} as Settings;
const order = (id: string, day: number, from: string, to: string) =>
  ({
    id,
    preference_snapshot: {
      windows: [{ day, from, to }],
      dropoff_allowed: false,
    },
  }) as Order;
test("delivery planner respects availability over distance and reports infeasible orders", () => {
  const plan = planDay(
    [
      order("late", 4, "15:00", "16:00"),
      order("early", 4, "10:00", "11:00"),
      order("wrong-day", 2, "10:00", "12:00"),
      order("too-short", 4, "09:00", "10:01"),
    ],
    "2026-09-17",
    config,
  );
  assert.deepEqual(
    plan.stops.map((s) => s.id),
    ["early", "late"],
  );
  assert.equal(plan.unplanned.length, 2);
  assert.ok(plan.stops[1].eta_start >= "15:00");
});
test("closed delivery day has no route and yearly/monthly recurrences handle month ends", () => {
  assert.equal(
    planDay([order("x", 7, "10:00", "18:00")], "2026-09-20", config).stops
      .length,
    0,
  );
  assert.equal(nextDate("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextDate("2028-02-29", "yearly"), "2029-02-28");
});
