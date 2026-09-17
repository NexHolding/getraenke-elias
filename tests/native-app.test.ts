import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeCartSchema, nativeApp } from "../lib/native-app";
test("Native checkout only accepts versioned IDs and bounded unique item quantities", () => {
  const cart = {
    version: 1,
    request_id: "33a9d424-5559-4e53-b12b-346972c18905",
    items: [{ id: "cola", quantity: 100, price_cents: 1 }],
  };
  assert.deepEqual(nativeCartSchema.parse(cart).items, [
    { id: "cola", quantity: 100 },
  ]);
  for (const value of [
    { ...cart, version: 2 },
    { ...cart, request_id: "bad" },
    { ...cart, items: [] },
    { ...cart, items: [{ id: "cola", quantity: 101 }] },
    { ...cart, items: [...cart.items, ...cart.items] },
    { ...cart, items: [{ id: "cola", quantity: 1.5 }] },
  ])
    assert.equal(nativeCartSchema.safeParse(value).success, false);
  assert.equal(nativeApp(), null);
});
