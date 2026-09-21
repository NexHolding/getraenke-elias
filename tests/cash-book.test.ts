import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCashBookReport,
  cashBookCsv,
  type CashDay,
  type CashEntry,
} from "../lib/cash-book";
import { buildFinanceReport, financeCsv } from "../lib/finance-report";
const day = {
  id: "day",
  day: "2026-09-21",
  test_mode: true,
  opening_cents: 25000,
  difference_cents: -500,
} as CashDay;
const entries = [
  {
    id: "a",
    number: 1,
    day_id: "day",
    kind: "opening",
    amount_cents: 25000,
    balance_cents: 25000,
    description: "Anfang",
    created_at: "2026-09-21T06:00:00Z",
    actor_name: "Mitarbeiter",
    category: "Vortrag",
  },
  {
    id: "b",
    number: 2,
    day_id: "day",
    kind: "manual",
    amount_cents: -1000,
    balance_cents: 24000,
    description: '=HYPERLINK("https://example.test")',
    created_at: "2026-09-21T07:00:00Z",
    actor_name: "@bad",
    category: "Betriebsausgabe",
  },
].map((e) => ({
  reference: "",
  document_date: null,
  original_id: null,
  source_key: null,
  has_document: false,
  ...e,
})) as CashEntry[];
test("cash book periods preserve running balances and reject mixing test and real records", () => {
  const r = buildCashBookReport([day], entries, "2026-09");
  assert.equal(r.ending, 24000);
  assert.equal(r.income, 25000);
  assert.equal(r.expenses, 1000);
  assert.equal(r.difference, -500);
  assert.equal(
    buildCashBookReport([day], entries, "2026-10").entries.length,
    0,
  );
  assert.throws(
    () =>
      buildCashBookReport(
        [day, { ...day, id: "other", test_mode: false }],
        entries,
        "2026-09",
      ),
    /vermischt/,
  );
});
test("cash book CSV escapes spreadsheet formulas; optional finance appendix never adds to revenue", () => {
  const r = buildCashBookReport([day], entries, "2026-09");
  assert.ok(cashBookCsv(r).includes("'="));
  assert.ok(cashBookCsv(r).includes("'@bad"));
  const finance = buildFinanceReport([], [], "2026-09", {});
  assert.equal(finance.all.gross, 0);
  assert.ok(!financeCsv(finance).includes("Kassenbuch KB-Nummer"));
  const combined = financeCsv(finance, r);
  assert.ok(combined.includes("Kassenbuch KB-Nummer"));
  assert.ok(combined.includes("'="));
  assert.ok(combined.includes("'@bad"));
  assert.equal(finance.all.gross, 0);
});
