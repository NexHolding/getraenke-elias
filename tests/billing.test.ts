import test from "node:test";
import assert from "node:assert/strict";
import { invoiceState, invoicePaymentSchema } from "../lib/billing";
import type { Invoice } from "../lib/types";
test("Invoice state is explicit and payment supersedes every reminder stage", () => {
  const invoice = { status: "open", due_date: "2026-09-21" } as Invoice;
  assert.equal(invoiceState(invoice, "2026-09-21").tone, "open");
  assert.equal(invoiceState(invoice, "2026-09-22").tone, "overdue");
  for (const stage of [1, 2, 3]) {
    assert.equal(
      invoiceState({
        ...invoice,
        reminder_stage: stage,
        reminder_status: "sent",
      }).tone,
      `reminder-${stage}`,
    );
    assert.equal(
      invoiceState({ ...invoice, status: "paid", reminder_stage: stage }).tone,
      "paid",
    );
  }
  assert.match(
    invoiceState({ ...invoice, reminder_stage: 1, reminder_status: "pending" })
      .label,
    /vorgemerkt/,
  );
});
test("Payment booking requires explicit full-payment confirmation and a real date", () => {
  const value = {
    id: crypto.randomUUID(),
    method: "bank",
    paid_on: "2026-09-21",
    confirmed: true,
  };
  assert.equal(invoicePaymentSchema.safeParse(value).success, true);
  for (const invalid of [
    { ...value, confirmed: false },
    { ...value, method: "invoice" },
    { ...value, paid_on: "2026-02-30" },
  ])
    assert.equal(invoicePaymentSchema.safeParse(invalid).success, false);
});
