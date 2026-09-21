import test from "node:test";
import assert from "node:assert/strict";
import { cashCents, cashChange } from "../lib/cash-payment";
test("cash input accepts comma/dot without floating-point rounding or implicit zero", () => {
  for (const [input, cents] of [
    ["20", 2000],
    ["20,50", 2050],
    ["0.01", 1],
    ["0,10", 10],
    ["10,", 1000],
    [" 100.5 ", 10050],
    ["0", 0],
  ] as const)
    assert.equal(cashCents(input), cents);
  for (const input of [
    "",
    " ",
    "-10",
    "+20",
    "1e3",
    "10,123",
    "1.000,00",
    "10.0.0",
    "NaN",
    "Infinity",
    "100000000",
  ])
    assert.equal(cashCents(input), null, input);
});
test("change is exact and insufficient/missing/invalid tender cannot be confirmed", () => {
  assert.equal(cashChange(1307, 2000), 693);
  assert.equal(cashChange(1307, 1307), 0);
  for (const given of [null, 0, 1306, -200, 1000.5, Infinity])
    assert.equal(cashChange(1307, given), null);
  assert.equal(cashChange(-330, 1000), null);
  assert.equal(cashChange(0, 0), 0);
});
