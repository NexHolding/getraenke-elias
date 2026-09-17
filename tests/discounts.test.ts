import test from "node:test";
import assert from "node:assert/strict";
import { discountedPrice, discountTotal } from "../lib/discounts";
import { saleItemSchema } from "../lib/sale-validation";
import { totals } from "../lib/money";

test("discounts use whole cents, leave deposits intact and support 100%", () => {
  assert.equal(discountedPrice(890, 50), 445);
  assert.equal(discountedPrice(125, 10), 113);
  assert.equal(discountedPrice(890, 100), 0);
  const items = [
    {
      id: "near-expiry",
      name: "Saft",
      quantity: 2,
      original_price_cents: 890,
      price_cents: 445,
      deposit_cents: 240,
      tax_rate: 7,
      deposit_tax_rate: 19,
    },
  ];
  assert.equal(discountTotal(items), 890);
  const total = totals(items);
  assert.equal(total.gross, 1370);
  assert.equal(total.deposit, 480);
  assert.equal(total.net + total.tax, total.gross);
  assert.equal(discountTotal([{ ...items[0], quantity: -2 }]), 0);
  assert.equal(
    discountTotal([{ ...items[0], original_price_cents: undefined }]),
    0,
  );
});

test("discount input rejects invalid rates and untrusted reasons", () => {
  for (const rate of [-1, 101, 0.5, NaN, Infinity]) {
    assert.throws(() => discountedPrice(890, rate));
    assert.equal(
      saleItemSchema.safeParse({ id: "x", quantity: 1, discount_percent: rate })
        .success,
      false,
    );
  }
  assert.equal(
    saleItemSchema.safeParse({
      id: "x",
      quantity: 1,
      discount_percent: 50,
      discount_reason: "Kurzes Mindesthaltbarkeitsdatum",
    }).success,
    true,
  );
  assert.equal(
    saleItemSchema.safeParse({
      id: "x",
      quantity: 1,
      discount_reason: "forged",
    }).success,
    false,
  );
  assert.equal(
    saleItemSchema.parse({ id: "x", quantity: 1 }).discount_percent,
    0,
  );
});
