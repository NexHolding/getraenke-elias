import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCustomerDeliveryDetails,
  registrationDeliveryDetails,
} from "../lib/customer-delivery-defaults";
import { registrationProfileSchema } from "../lib/registration";
const contact = {
  street: "Teststraße",
  house_number: "12 a",
  postal_code: "01234",
  city: "Musterstadt",
  phone: "0123456789",
};
test("registration validates all delivery fields and preserves leading-zero postal codes", () => {
  const parsed = registrationProfileSchema.parse({
    ...contact,
    name: "Testkunde",
    payment_method: "invoice",
  });
  assert.equal(parsed.postal_code, "01234");
  assert.ok(!("payment_method" in parsed));
  for (const key of Object.keys(contact))
    assert.equal(
      registrationProfileSchema.safeParse({ ...parsed, [key]: "" }).success,
      false,
    );
  assert.equal(
    registrationDeliveryDetails({ ...contact, postal_code: "bad" }).address,
    undefined,
  );
  assert.deepEqual(
    registrationDeliveryDetails({
      street: { value: "invalid" },
      phone: { value: "invalid" },
    }),
    {},
  );
});
test("profile defaults fill blanks but never mix or replace addresses", () => {
  const details = registrationDeliveryDetails(contact);
  assert.deepEqual(
    missingCustomerDeliveryDetails({ id: "c" }, contact),
    details,
  );
  assert.deepEqual(
    missingCustomerDeliveryDetails(
      { id: "c", ...details },
      { ...contact, street: "Another road", phone: "987654" },
    ),
    {},
  );
  assert.deepEqual(
    missingCustomerDeliveryDetails(
      { id: "c", street: "Partially saved street", phone: contact.phone },
      contact,
    ),
    {},
  );
  assert.deepEqual(
    missingCustomerDeliveryDetails(
      { id: "c", address: "Ambiguous old address", phone: contact.phone },
      contact,
    ),
    {},
  );
  assert.deepEqual(
    missingCustomerDeliveryDetails({ id: "c", ...details, phone: "" }, contact),
    { phone: contact.phone },
  );
});
