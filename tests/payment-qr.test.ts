import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import {
  validIban,
  paymentAccountIssue,
  paymentQrPayload,
} from "../lib/payment-qr";
const account = {
  bank_account_holder: "Erika Mustermann",
  bank_iban: "DE89 3704 0044 0532 0130 00",
};
test("EPC payload has correct version, UTF-8, cents, reference and no trailing separator", () => {
  const payload = paymentQrPayload(account, 12345, "Rechnung RE-000042");
  assert.deepEqual(payload.split("\n"), [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    "Erika Mustermann",
    "DE89370400440532013000",
    "EUR123.45",
    "",
    "",
    "Rechnung RE-000042",
  ]);
  assert.ok(
    QRCode.create(payload, { errorCorrectionLevel: "M" }).version <= 13,
  );
  assert.equal(paymentQrPayload(account, 1, "RE-1").split("\n")[7], "EUR0.01");
});
test("invalid bank data, injection and nonpayable amounts cannot generate a payment QR", () => {
  assert.ok(validIban(account.bank_iban));
  assert.ok(!validIban("DE89370400440532013001"));
  assert.ok(!validIban("ZZ89370400440532013000"));
  assert.ok(
    paymentAccountIssue({ ...account, bank_account_holder: "A\nEUR1.00" }),
  );
  assert.ok(paymentAccountIssue({ ...account, bank_bic: "bad" }));
  for (const amount of [0, -1, 1.5, 100000000000, NaN])
    assert.throws(() => paymentQrPayload(account, amount, "RE-1"));
  assert.throws(() => paymentQrPayload(account, 100, "x\nEUR1.00"));
  assert.ok(
    paymentAccountIssue({ ...account, bank_iban: "CH9300762011623852957" }),
  );
  assert.equal(
    paymentAccountIssue({
      ...account,
      bank_iban: "CH9300762011623852957",
      bank_bic: "POFICHBEXXX",
    }),
    null,
  );
});
import { settingsSchema } from "../lib/validation";
test("bank fields survive validated settings and malformed IBAN is rejected", () => {
  const base = {
    auto_reorder: false,
    instagram: "",
    domain: "getraenke-elias.de",
    printer_mode: "browser",
    printer_address: "",
    tse_provider: "",
    smtp_host: "",
    smtp_port: 465,
    smtp_user: "",
    smtp_from: "",
  };
  assert.equal(
    settingsSchema.parse({ ...base, ...account }).bank_iban,
    "DE89370400440532013000",
  );
  assert.ok(
    !settingsSchema.safeParse({ ...base, ...account, bank_iban: "DE000000" })
      .success,
  );
  assert.ok(
    !settingsSchema.safeParse({ ...base, bank_iban: account.bank_iban })
      .success,
  );
  assert.ok(settingsSchema.safeParse(base).success);
});
