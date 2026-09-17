import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deliveryAddressFields,
  formatDeliveryAddress,
} from "../lib/delivery-address";
import { customerSchema } from "../lib/operations-validation";
import { orderSchema } from "../lib/validation";
const address = {
  street: "Straße des 17. Juni",
  house_number: "12 a",
  postal_code: "01234",
  city: "Bad Musterstadt",
};
test("structured addresses preserve suffixes and leading-zero postcodes; server ignores forged combined address", () => {
  const input = {
    ...address,
    name: "Test Kunde",
    email: "kunde@example.test",
    address: "Falsche Adresse 99, 99999 Irgendwo",
  };
  const parsed = customerSchema.parse(input);
  assert.equal(
    parsed.address,
    "Straße des 17. Juni 12 a, 01234 Bad Musterstadt",
  );
  assert.equal(parsed.postal_code, "01234");
  for (const postal_code of ["1234", "123456", "74A76", ""])
    assert.equal(
      customerSchema.safeParse({ ...input, postal_code }).success,
      false,
    );
  assert.equal(
    customerSchema.safeParse({ ...input, house_number: "" }).success,
    false,
  );
});
test("safe legacy prefill handles comma and newline but leaves incomplete or ambiguous addresses for review", () => {
  for (const s of [
    "Wartbergstraße 3, 74076 Heilbronn",
    "Wartbergstraße 3\n74076 Heilbronn",
  ])
    assert.deepEqual(deliveryAddressFields({ address: s }), {
      street: "Wartbergstraße",
      house_number: "3",
      postal_code: "74076",
      city: "Heilbronn",
    });
  assert.deepEqual(
    deliveryAddressFields({ address: formatDeliveryAddress(address) }),
    address,
  );
  assert.equal(
    deliveryAddressFields({ address: "Hinter dem Bahnhof, Lieferanteneingang" })
      .street,
    "",
  );
  assert.deepEqual(
    deliveryAddressFields({ ...address, address: "Anderer Altwert" }),
    address,
  );
});
test("checkout requires all four address components and keeps order-specific address", () => {
  const order = {
    ...address,
    request_id: crypto.randomUUID(),
    customer_name: "Test Kunde",
    email: "kunde@example.test",
    phone: "0123456789",
    adult: "on",
    items: [{ id: "elias-036-v1", quantity: 4 }],
  };
  assert.equal(
    orderSchema.parse(order).address,
    formatDeliveryAddress(address),
  );
  assert.equal(
    orderSchema.safeParse({ ...order, city: undefined }).success,
    false,
  );
});
