import test from "node:test";
import assert from "node:assert/strict";
import { initialOrderPaymentApproval } from "../lib/order-payment-policy";
test("cash and EC require no invoice credit", () => {
  assert.equal(initialOrderPaymentApproval("cash", undefined, null), "cash");
  assert.equal(initialOrderPaymentApproval("card", undefined, null), "card");
});
test("invoice credit belongs only to the authenticated linked customer", () => {
  const customer = { user_id: "customer-a", payment_method: "invoice" };
  assert.equal(
    initialOrderPaymentApproval("invoice", undefined, customer),
    null,
  );
  assert.equal(initialOrderPaymentApproval("invoice", "other", customer), null);
  assert.equal(
    initialOrderPaymentApproval("invoice", "customer-a", {
      ...customer,
      payment_method: "cash",
    }),
    null,
  );
  assert.equal(
    initialOrderPaymentApproval("invoice", "customer-a", customer),
    "invoice",
  );
});
