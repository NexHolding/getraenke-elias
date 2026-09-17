import { test } from "node:test";
import assert from "node:assert/strict";
import { totals, reorderQuantity } from "../lib/money";
import { productSchema, orderSchema } from "../lib/validation";
import raw from "../data/catalog.json";
test("149 separate SKUs retain source prices and pack sizes", () => {
  assert.equal(raw.length, 149);
  assert.equal(new Set(raw.map((p) => p.id)).size, 149);
  assert.deepEqual(
    raw
      .filter((p) => p.name === "Paulaner Spezi")
      .map((p) => [p.pack_count, p.volume_ml, p.price_cents]),
    [[24, 330, 2090]],
  );
  assert.equal(raw.find((p) => p.name === "Kühlwagen")?.price_cents, 19500);
  assert.ok(
    raw.every(
      (p) =>
        Number.isInteger(p.deposit_cents) && p.stock === null && !p.verified,
    ),
  );
});
test("gross equals net plus tax for mixed tax rates and returns", () => {
  const t = totals([
    {
      id: "water",
      name: "Water",
      quantity: 3,
      price_cents: 990,
      deposit_cents: 330,
      tax_rate: 19,
      deposit_tax_rate: 19,
    },
    {
      id: "food",
      name: "Food",
      quantity: 1,
      price_cents: 107,
      deposit_cents: 0,
      tax_rate: 7,
      deposit_tax_rate: 19,
    },
    {
      id: "return",
      name: "Return",
      quantity: -4,
      price_cents: 0,
      deposit_cents: 25,
      tax_rate: 19,
      deposit_tax_rate: 19,
    },
  ]);
  assert.equal(t.gross, 3967);
  assert.equal(t.gross, t.net + t.tax);
  assert.equal(t.deposit, 890);
  assert.equal(t.taxes[7].tax, 7);
});
test("returns can result in payout and fractional cents are rejected", () => {
  assert.equal(
    totals([
      {
        id: "r",
        name: "r",
        quantity: -2,
        price_cents: 0,
        deposit_cents: 150,
        tax_rate: 19,
        deposit_tax_rate: 19,
      },
    ]).gross,
    -300,
  );
  assert.throws(() =>
    totals([
      {
        id: "x",
        name: "x",
        quantity: 1,
        price_cents: 0.1,
        deposit_cents: 0,
        tax_rate: 19,
        deposit_tax_rate: 19,
      },
    ]),
  );
});
test("integer accounting invariant holds over varied quantities", () => {
  for (let price = 0; price < 3000; price += 37)
    for (const rate of [0, 7, 19]) {
      const t = totals([
        {
          id: "a",
          name: "a",
          quantity: 7,
          price_cents: price,
          deposit_cents: 25,
          tax_rate: rate,
          deposit_tax_rate: 19,
        },
      ]);
      assert.equal(t.gross, t.net + t.tax);
      assert.equal(t.gross, 7 * (price + 25));
    }
});
test("reorder honours threshold and open purchases", () => {
  assert.equal(reorderQuantity(5, 5, 20), 0);
  assert.equal(reorderQuantity(4, 5, 20), 16);
  assert.equal(reorderQuantity(4, 5, 20, 16), 0);
  assert.equal(reorderQuantity(4, 5, 20, 7), 9);
});
test("cannot verify product with unknown deposit or inverted target", () => {
  assert.equal(
    productSchema.safeParse({ ...raw[0], verified: true, deposit_cents: null })
      .success,
    false,
  );
  assert.equal(
    productSchema.safeParse({ ...raw[0], min_stock: 10, target_stock: 9 })
      .success,
    false,
  );
  assert.equal(
    productSchema.safeParse({ ...raw[0], verified: true, deposit_cents: 330 })
      .success,
    true,
  );
});
test("order rejects noninteger or negative quantities and missing adult acknowledgement", () => {
  const value = {
    request_id: "12345678-1234-4234-9234-123456789012",
    customer_name: "Test Person",
    email: "qa@example.invalid",
    phone: "0123456",
    address: "Teststraße 1, Heilbronn",
    adult: "on",
    items: [{ id: "elias-001", quantity: 4 }],
  };
  assert.equal(orderSchema.safeParse(value).success, true);
  assert.equal(
    orderSchema.safeParse({ ...value, adult: undefined }).success,
    false,
  );
  assert.equal(
    orderSchema.safeParse({
      ...value,
      items: [{ id: "elias-001", quantity: -1 }],
    }).success,
    false,
  );
});
