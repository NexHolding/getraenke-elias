import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inventoryValue,
  inventoryRequest,
  quantityLabel,
} from "../lib/inventory";
import { inventoryCsv } from "../lib/inventory-documents";
import type { InventoryRun, InventoryLine } from "../lib/inventory";
test("inventory values use purchase cost per pack, zero is zero, missing cost stays unknown", () => {
  assert.equal(inventoryValue(13, 6, 899), 1948);
  assert.equal(inventoryValue(0, 6, null), 0);
  assert.equal(inventoryValue(1, 6, null), null);
  assert.equal(inventoryValue(null, 6, 899), null);
  assert.equal(inventoryValue(-1, 6, 600), -100);
  assert.equal(inventoryValue(-1, 20, 1250), -63);
  assert.equal(quantityLabel(59, 6), "9 Geb. + 5 einzeln");
});
test("inventory API rejects fractional/zero corrections and unconfirmed token text", () => {
  const value = {
    id: crypto.randomUUID(),
    product_id: "qa",
    delta_units: -1,
    reason: "breakage",
    note: "Zerbrochen",
    occurred_on: "2026-09-17",
  };
  assert.ok(inventoryRequest.safeParse({ action: "adjust", value }).success);
  for (const delta_units of [0, 0.5, NaN])
    assert.ok(
      !inventoryRequest.safeParse({
        action: "adjust",
        value: { ...value, delta_units },
      }).success,
    );
  assert.ok(
    !inventoryRequest.safeParse({
      action: "apply",
      value: { run_id: crypto.randomUUID(), revision: 1, confirmation: "ja" },
    }).success,
  );
});
test("CSV escapes user supplied formula cells and keeps missing values explicit", () => {
  const run = {
    number: 1,
    status: "counting",
    inventory_date: "2026-09-17",
    location: "Lager",
  } as InventoryRun;
  const line = {
    product_snapshot: {
      sku: "TEST",
      name: '=HYPERLINK("bad")',
      pack_count: 6,
      volume_ml: 1000,
    },
    book_units: null,
    counted_units: 0,
    cost_net_cents: null,
    reason: "initial",
    note: "@SUM(1)",
    counted_name: "Team",
  } as InventoryLine;
  const csv = inventoryCsv(run, [line]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'@SUM"));
  assert.ok(csv.includes("Erstbestand"));
});
