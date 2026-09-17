import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFinanceReport,
  financeCsv,
  validFinancePeriod,
} from "../lib/finance-report";
import { createFinancePdf } from "../lib/finance-pdf";
import { totals } from "../lib/money";
import { can, financeReadOnly } from "../lib/permissions";
import { resolveLoginEmail } from "../lib/login-identity";
import type { Sale, Invoice, SaleLine } from "../lib/types";
function sale(
  id: string,
  date: string,
  items: SaleLine[],
  payment = "cash",
): Sale {
  const t = totals(items);
  return {
    id,
    number: Number(id) || 1,
    created_at: date,
    items,
    payment,
    test_mode: true,
    total_cents: t.gross,
    net_cents: t.net,
    tax_cents: t.tax,
    deposit_cents: t.deposit,
  };
}
const item = (quantity = 1, rate = 19): SaleLine => ({
  id: "a",
  name: "Artikel",
  quantity,
  price_cents: rate === 7 ? 107 : 119,
  deposit_cents: 25,
  tax_rate: rate,
  deposit_tax_rate: 19,
});
test("finance exports reconcile receipts, invoice amounts, mixed VAT, returns and Berlin period boundaries", () => {
  const a = sale("1", "2026-08-31T22:30:00Z", [item(2), item(1, 7)]),
    b = sale("2", "2026-09-30T22:00:00Z", [item()]),
    c = sale("3", "2026-09-17T10:00:00Z", [{ ...item(-1), price_cents: 0 }]);
  const i = {
    ...sale("4", "2026-09-17T12:00:00Z", [item(1, 7)]),
    order_id: "o",
    delivery_id: "d",
    customer_id: "c",
    customer_snapshot: { name: "Kunde", email: "", address: "" },
    status: "open",
    mode: "setup",
  } as Invoice;
  const r = buildFinanceReport([a, b, c], [i], "2026-09", {});
  assert.equal(r.documents.length, 3);
  assert.equal(r.all.gross, a.total_cents + c.total_cents + i.total_cents);
  assert.equal(r.all.gross, r.all.net + r.all.tax);
  assert.equal(r.all.cash, a.total_cents + c.total_cents);
  assert.equal(r.all.openInvoices, i.total_cents);
  assert.equal(r.all.gross, r.all.pos + r.all.invoices);
  assert.equal(
    Object.values(r.taxes).reduce((n, t) => n + t.tax, 0),
    r.all.tax,
  );
  assert.equal(r.days["2026-09-01"].count, 1);
  const csv = financeCsv(r);
  assert.match(csv, /Netto 7% EUR/);
  assert.match(csv, /"-0,25"/);
  assert.doesNotMatch(csv, /"'-0,25"/);
  assert.equal(csv.split("\r\n").filter(Boolean).length, 4);
  assert.ok(csv.startsWith("\ufeff"));
  assert.throws(
    () => buildFinanceReport([{ ...a, total_cents: 1 }], [], "2026-09", {}),
    /Summen/,
  );
  assert.throws(
    () =>
      buildFinanceReport([a, { ...c, test_mode: false }], [], "2026-09", {}),
    /Einrichtungs/,
  );
});
test("finance periods reject invalid dates and readonly staff cannot inherit unrelated modules", () => {
  for (const p of ["2026-02-30", "2026-00", "2026-13", "2026-1", "bad"])
    assert.equal(validFinancePeriod(p), false);
  assert.equal(validFinancePeriod("2024-02-29"), true);
  assert.equal(validFinancePeriod("2026-09"), true);
  const a = {
    role: "staff",
    permissions: ["finanzen", "kasse", "einstellungen"],
    finance_readonly: true,
  };
  assert.equal(can(a, "finanzen"), true);
  assert.equal(can(a, "kasse"), false);
  assert.equal(can(a, "einstellungen"), false);
  assert.equal(financeReadOnly(a), true);
  assert.equal(
    resolveLoginEmail("steuerberater"),
    "steuerberater@getraenke-elias.local",
  );
});
test("daily and monthly PDFs are A4 landscape, include logo and readable report labels", async () => {
  for (const period of ["2026-09", "2026-09-17"]) {
    const report = buildFinanceReport(
      [sale("1", "2026-09-17T10:00:00Z", [item()])],
      [],
      period,
      {},
    );
    const pdf = await createFinancePdf(report);
    assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 297) < 0.1);
    assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 210) < 0.1);
    const raw = pdf.output();
    assert.match(raw, /\/Subtype \/Image/);
    assert.match(raw, /Belegjournal/);
    assert.match(raw, /Einrichtungsdaten/);
  }
});
