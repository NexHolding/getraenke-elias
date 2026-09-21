import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { businessDocument } from "../lib/documents";
import { totals } from "../lib/money";
import type {
  Settings,
  Order,
  Delivery,
  Invoice,
  SaleLine,
} from "../lib/types";
const settings = {
  business_name: "Musterbetrieb Getränke Elias · Frank Elias",
  business_address: "Musterstraße 3 · 74076 Heilbronn",
  tax_number: "MUSTER - nicht steuerlich verwendbar",
  bank_account_holder: "Erika Mustermann",
  bank_iban: "DE89370400440532013000",
  bank_bic: "COBADEFFXXX",
  bank_name: "Musterbank",
} as Settings;
const items: SaleLine[] = [
  {
    id: "1",
    name: "ALWA Mineralwasser Medium · 12 × 0,7 l",
    quantity: 4,
    price_cents: 749,
    deposit_cents: 330,
    tax_rate: 19,
    deposit_tax_rate: 19,
  },
  {
    id: "2",
    name: "Augustiner Lagerbier Hell · 20 × 0,5 l",
    quantity: 2,
    price_cents: 2199,
    deposit_cents: 310,
    tax_rate: 19,
    deposit_tax_rate: 19,
  },
  {
    id: "3",
    name: "Milch 3,5 % · 1 l (Testposition 7 %)",
    quantity: 3,
    price_cents: 149,
    deposit_cents: 0,
    tax_rate: 7,
    deposit_tax_rate: 19,
  },
];
const returns: SaleLine[] = [
  {
    id: "return-330",
    name: "Pfandrücknahme",
    quantity: -2,
    price_cents: 0,
    deposit_cents: 330,
    tax_rate: 19,
    deposit_tax_rate: 19,
  },
];
const order = {
  id: "qa-order",
  number: 42,
  customer_name: "MUSTER - nicht bezahlen",
  address: "Beispielkundin Erika Mustermann\nBeispielweg 14\n74076 Heilbronn",
  items,
  delivered: { "1": 4, "2": 2, "3": 3 },
} as unknown as Order;
const delivery = {
  id: "qa-delivery",
  number: 42,
  order_id: order.id,
  items,
  deposit_returns: returns,
  status: "delivered",
  signature: null,
  signed_name: "Erika Mustermann",
  delivered_at: "2026-09-21T12:45:00Z",
  created_at: "2026-09-20T09:00:00Z",
  mode: "live",
  payment_method: "invoice",
  total_cents: totals([...items, ...returns]).gross,
} as Delivery;
const sum = totals([...items, ...returns]);
const invoice = {
  id: "qa-invoice",
  number: 42,
  order_id: order.id,
  delivery_id: delivery.id,
  customer_snapshot: {
    name: order.customer_name,
    address: order.address,
    email: "qa@example.test",
  },
  items: [...items, ...returns],
  status: "open",
  mode: "live",
  created_at: "2026-09-22T09:00:00Z",
  service_date: "2026-09-21",
  delivery_number: 42,
  due_date: "2026-10-06",
  payment_terms_days: 14,
  payment_method: "invoice",
  total_cents: sum.gross,
  net_cents: sum.net,
  tax_cents: sum.tax,
  deposit_cents: sum.deposit,
} as Invoice;
await mkdir("output/pdf", { recursive: true });
for (const [name, kind, record] of [
  ["Elias-Musterrechnung", "invoice", invoice],
  ["Elias-Musterlieferschein", "delivery", delivery],
  ["Elias-Einrichtungsrechnung", "invoice", { ...invoice, mode: "setup" }],
] as const) {
  await writeFile(
    `output/pdf/${name}.pdf`,
    businessDocument(kind, record, order, settings).bytes,
  );
}
const many = Array.from({ length: 40 }, (_, i) => ({
  ...items[i % 3],
  id: String(i),
  name: `${items[i % 3].name} - zusätzliche ausführliche Beschreibung für den Umbruch bei langen Bezeichnungen (${i + 1})`,
}));
const manySum = totals(many);
await writeFile(
  "output/pdf/Elias-Mehrseitige-Testrechnung.pdf",
  businessDocument(
    "invoice",
    {
      ...invoice,
      items: many,
      total_cents: manySum.gross,
      net_cents: manySum.net,
      tax_cents: manySum.tax,
    },
    order,
    settings,
  ).bytes,
);
assert.throws(
  () =>
    businessDocument(
      "invoice",
      { ...invoice, tax_cents: invoice.tax_cents + 1 },
      order,
      settings,
    ),
  /stimmen nicht/,
);
console.log("PDF fixtures generated; inconsistent posted totals rejected.");
