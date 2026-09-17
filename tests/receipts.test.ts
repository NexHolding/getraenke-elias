import test from "node:test";
import assert from "node:assert/strict";
import { createReceiptPdf, receiptOperatorName } from "../lib/receipt";
import { totals } from "../lib/money";
import type { Sale } from "../lib/types";
import { settingsSchema } from "../lib/validation";
const items = [
  {
    id: "a",
    name: "Milchmischgetränk",
    quantity: 2,
    price_cents: 107,
    original_price_cents: 214,
    discount_percent: 50,
    discount_reason: "Kurzes Mindesthaltbarkeitsdatum",
    discount_scope: "item" as const,
    deposit_cents: 15,
    tax_rate: 7,
    deposit_tax_rate: 7,
  },
  {
    id: "b",
    name: "Mineralwasser",
    quantity: 1,
    price_cents: 119,
    deposit_cents: 25,
    tax_rate: 19,
    deposit_tax_rate: 19,
  },
];
const t = totals(items);
export const receiptFixture: Sale = {
  id: "test",
  number: 321,
  items,
  created_at: "2026-09-17T14:00:00Z",
  total_cents: t.gross,
  net_cents: t.net,
  tax_cents: t.tax,
  deposit_cents: t.deposit,
  payment: "card",
  test_mode: true,
  actor_name: "QA",
  issuer_snapshot: {
    business_name: "Getränkeshop Elias · Frank Elias",
    business_address: "Wartbergstraße 3 · 74076 Heilbronn",
    tax_number: "TESTNUMMER - KEINE ECHTE STEUERNUMMER",
    vat_id: "",
    register_id: "ELIAS-KASSE-01",
    website: "getraenke-elias.de",
  },
};
test("receipt embeds original logo, uses 80-mm content-sized pages and preserves stored taxes", async () => {
  const pdf = await createReceiptPdf(receiptFixture);
  assert.equal(Math.round(pdf.internal.pageSize.getWidth()), 80);
  assert.ok(pdf.internal.pageSize.getHeight() < 300);
  const raw = pdf.output();
  assert.match(raw, /\/Subtype \/Image/);
  assert.match(raw, /\/PrintScaling \/None/);
  const bad = {
    ...receiptFixture,
    total_cents: receiptFixture.total_cents + 1,
  };
  await assert.rejects(createReceiptPdf(bad), /Belegsumme/);
  await assert.rejects(
    createReceiptPdf({ ...receiptFixture, test_mode: false }),
    /TSE-Daten/,
  );
});
test("long receipt continues with bounded 80-mm pages", async () => {
  const lines = Array.from({ length: 60 }, (_, i) => ({
    ...items[i % 2],
    name:
      "Langer Getränkename zur Prüfung von Zeilenumbrüchen und der korrekten Seitentrennung " +
      i,
  }));
  const total = totals(lines);
  const pdf = await createReceiptPdf({
    ...receiptFixture,
    items: lines,
    total_cents: total.gross,
    net_cents: total.net,
    tax_cents: total.tax,
    deposit_cents: total.deposit,
  });
  assert.ok(pdf.getNumberOfPages() > 1);
  for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
    pdf.setPage(i);
    assert.equal(Math.round(pdf.internal.pageSize.getWidth()), 80);
    assert.ok(pdf.internal.pageSize.getHeight() <= 346);
  }
});
test("tax defaults only accept current DE rates and tax ID has a separate validated field", () => {
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
  assert.equal(settingsSchema.parse(base).default_tax_rate, 19);
  assert.equal(
    settingsSchema.parse({ ...base, default_tax_rate: 7 }).default_tax_rate,
    7,
  );
  for (const rate of [0, 5, 16, 21, -1])
    assert.equal(
      settingsSchema.safeParse({ ...base, default_tax_rate: rate }).success,
      false,
    );
  assert.equal(
    settingsSchema.safeParse({ ...base, vat_id: "DE123" }).success,
    false,
  );
});

test("historical administrator labels remain hidden on customer receipts", () => {
  for (const name of [
    "Global Administrator",
    "global_admin",
    "GLOBAL ADMIN",
    "global_admin@getraenke-elias.local",
  ])
    assert.equal(receiptOperatorName(name), "Administration");
  assert.equal(receiptOperatorName("Frank Elias"), "Frank Elias");
});
