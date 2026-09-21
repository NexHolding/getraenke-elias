import type { CashBookReport } from "./cash-book";
import type {
  Sale,
  Invoice,
  SaleLine,
  Settings,
  InvoicePayment,
} from "./types";
import { totals } from "./money";
export type FinanceClosing = {
  id?: string;
  kind: string;
  period: string;
  created_at: string;
  totals: {
    gross: number;
    count: number;
    cash?: number;
    card?: number;
    opening?: number;
    counted?: number;
    difference?: number;
  };
};
export type FinanceDocument = {
  id: string;
  number: string;
  kind: "Kassenbon" | "Lieferrechnung";
  created_at: string;
  day: string;
  payment: string;
  status: string;
  reference: string;
  reason: string;
  setup: boolean;
  items: SaleLine[];
  net: number;
  tax: number;
  gross: number;
  deposit: number;
  taxes: ReturnType<typeof totals>["taxes"];
};
export const berlinDate = (date: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(date),
  );
export function validFinancePeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(period))
    return false;
  return (
    period.length === 7 ||
    new Date(period + "T12:00:00Z").toISOString().slice(0, 10) === period
  );
}
export function buildFinanceReport(
  sales: Sale[],
  invoices: Invoice[],
  period: string,
  settings: Partial<Settings>,
  closings: FinanceClosing[] = [],
  now = new Date().toISOString(),
  invoicePayments: InvoicePayment[] = [],
) {
  if (!validFinancePeriod(period))
    throw new Error("Bitte einen gültigen Tag oder Monat auswählen.");
  const documents: FinanceDocument[] = [];
  function add(row: Sale | Invoice, kind: FinanceDocument["kind"]) {
    const day = berlinDate(row.created_at);
    if (!day.startsWith(period)) return;
    const sum = totals(row.items);
    if (
      sum.gross !== row.total_cents ||
      sum.net !== row.net_cents ||
      sum.tax !== row.tax_cents ||
      sum.deposit !== row.deposit_cents
    )
      throw new Error(
        `Beleg ${row.number}: Summen stimmen nicht mit den gespeicherten Positionen überein.`,
      );
    const sale = kind === "Kassenbon" ? (row as Sale) : null,
      invoice = sale ? null : (row as Invoice);
    documents.push({
      id: row.id,
      number: `${sale ? "E" : "RE"}-${row.number}`,
      kind,
      created_at: row.created_at,
      day,
      payment: sale ? (sale.payment === "cash" ? "Bar" : "Karte") : "Rechnung",
      status: invoice
        ? invoice.status === "paid"
          ? "Bezahlt"
          : "Offen"
        : sale?.record_type === "return"
          ? "Rückgabe"
          : sale?.record_type === "cancellation"
            ? "Storno"
            : "Erfasst",
      reference: sale?.original_number ? `E-${sale.original_number}` : "",
      reason: sale?.reversal_reason || "",
      setup: sale ? !!sale.test_mode : invoice!.mode === "setup",
      items: row.items,
      net: sum.net,
      tax: sum.tax,
      gross: sum.gross,
      deposit: sum.deposit,
      taxes: sum.taxes,
    });
  }
  sales.forEach((s) => add(s, "Kassenbon"));
  invoices
    .filter((i) => i.status === "open" || i.status === "paid")
    .forEach((i) => add(i, "Lieferrechnung"));
  documents.sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      a.number.localeCompare(b.number),
  );
  const all = {
    gross: 0,
    net: 0,
    tax: 0,
    deposit: 0,
    cash: 0,
    card: 0,
    invoices: 0,
    openInvoices: 0,
    pos: 0,
  };
  const taxes: Record<string, { gross: number; net: number; tax: number }> = {},
    days: Record<
      string,
      {
        gross: number;
        net: number;
        tax: number;
        deposit: number;
        count: number;
      }
    > = {};
  for (const d of documents) {
    for (const k of ["gross", "net", "tax", "deposit"] as const) all[k] += d[k];
    if (d.kind === "Kassenbon") {
      all.pos += d.gross;
      all[d.payment === "Bar" ? "cash" : "card"] += d.gross;
    } else {
      all.invoices += d.gross;
      if (d.status === "Offen") all.openInvoices += d.gross;
    }
    for (const [rate, t] of Object.entries(d.taxes)) {
      const x = taxes[rate] || { gross: 0, net: 0, tax: 0 };
      x.gross += t.gross;
      x.net += t.net;
      x.tax += t.tax;
      taxes[rate] = x;
    }
    const day = days[d.day] || {
      gross: 0,
      net: 0,
      tax: 0,
      deposit: 0,
      count: 0,
    };
    for (const k of ["gross", "net", "tax", "deposit"] as const) day[k] += d[k];
    day.count++;
    days[d.day] = day;
  }
  const invoiceIndex = new Map(invoices.map((i) => [i.id, i]));
  const payments = invoicePayments
    .filter((p) => berlinDate(p.paid_at).startsWith(period))
    .map((p) => ({
      ...p,
      number: invoiceIndex.get(p.invoice_id)?.number,
      customer: invoiceIndex.get(p.invoice_id)?.customer_snapshot.name || "",
    }));
  const received = { cash: 0, card: 0, bank: 0 };
  for (const p of payments) received[p.method] += p.amount_cents;
  if (payments.some((p) => !invoiceIndex.has(p.invoice_id)))
    throw new Error("Zahlung ohne zugehörige Rechnung im Export.");
  const recordModes = [
    ...documents.map((d) => d.setup),
    ...payments.map((p) => invoiceIndex.get(p.invoice_id)?.mode === "setup"),
  ];
  const setupCount = recordModes.filter(Boolean).length;
  const mode = recordModes.length
    ? setupCount === recordModes.length
      ? "Einrichtungsdaten"
      : setupCount
        ? "Gemischte Daten: Einrichtung + Echtbetrieb"
        : "Echtbetrieb"
    : settings.live_mode
      ? "Echtbetrieb"
      : "Einrichtungsdaten";
  if (setupCount > 0 && setupCount < recordModes.length)
    throw new Error(
      "Einrichtungs- und Echtbelege dürfen nicht in einem gemeinsamen Umsatzbericht summiert werden.",
    );
  return {
    period,
    title: period.length === 7 ? "Monatsbericht" : "Tagesbericht",
    created_at: now,
    business_name: settings.business_name || "Getränkeshop Elias · Frank Elias",
    business_address:
      settings.business_address || "Wartbergstraße 3 · 74076 Heilbronn",
    tax_number: settings.tax_number || "",
    vat_id: settings.vat_id || "",
    mode,
    documents,
    payments,
    received,
    all,
    taxes,
    days,
    closings: closings.filter(
      (c) =>
        c.period === period ||
        (period.length === 7 &&
          c.kind === "day" &&
          c.period.startsWith(period)),
    ),
  };
}
export type FinanceReport = ReturnType<typeof buildFinanceReport>;
const money = (n: number) => (n / 100).toFixed(2).replace(".", ",");
// Fixed rectangular schema: numeric amounts stay numeric, untrusted text cannot run formulas.
export function financeCsv(report: FinanceReport, cashBook?: CashBookReport) {
  const rates = [
    ...new Set(["0", "7", "19", ...Object.keys(report.taxes)]),
  ].sort((a, b) => Number(a) - Number(b));
  const header = [
    "Bericht",
    "Zeitraum",
    "Datenstatus",
    "Erstellt UTC",
    "Belegart",
    "Belegnummer",
    "Beleg-ID",
    "Zeitpunkt UTC",
    "Datum Berlin",
    "Zahlart",
    "Zahlstatus",
    "Netto EUR",
    "USt EUR",
    "Brutto EUR",
    "Pfandsaldo brutto EUR",
    "Originalbeleg",
    "Korrekturgrund",
    ...rates.flatMap((r) => [
      `Netto ${r}% EUR`,
      `USt ${r}% EUR`,
      `Brutto ${r}% EUR`,
    ]),
    "Zahlungseingang EUR",
  ];
  const rows = report.documents.map((d) => [
    report.title,
    report.period,
    report.mode,
    report.created_at,
    d.kind,
    d.number,
    d.id,
    d.created_at,
    d.day,
    d.payment,
    d.status,
    money(d.net),
    money(d.tax),
    money(d.gross),
    money(d.deposit),
    d.reference,
    d.reason,
    ...rates.flatMap((r) => [
      money(d.taxes[r]?.net || 0),
      money(d.taxes[r]?.tax || 0),
      money(d.taxes[r]?.gross || 0),
    ]),
    money(0),
  ]);
  for (const p of report.payments)
    rows.push([
      report.title,
      report.period,
      report.mode,
      report.created_at,
      "Zahlungseingang Lieferrechnung",
      `RE-${p.number}`,
      p.id,
      p.paid_at,
      berlinDate(p.paid_at),
      p.method === "cash"
        ? "Bar"
        : p.method === "card"
          ? "Karte"
          : "Überweisung",
      "Bezahlt",
      money(0),
      money(0),
      money(0),
      money(0),
      `RE-${p.number}`,
      "Kein zusätzlicher Umsatz",
      ...rates.flatMap(() => [money(0), money(0), money(0)]),
      money(p.amount_cents),
    ]);
  if (cashBook) {
    const width = header.length;
    header.push(
      "Kassenbuch KB-Nummer",
      "Kassenbuch Kategorie",
      "Kassenbuch Eingang EUR",
      "Kassenbuch Ausgang EUR",
      "Kassenbuch Bestand EUR",
      "Kassenbuch Bearbeiter",
      "Kassenbuch Anhang",
    );
    for (const row of rows) row.push("", "", "", "", "", "", "");
    for (const e of cashBook.entries) {
      const row = Array<string>(width).fill("");
      row[0] = report.title;
      row[1] = report.period;
      row[2] = e.test_mode ? "TESTDATEN" : "Echtbetrieb";
      row[3] = report.created_at;
      row[4] = "Kassenbuch (kein weiterer Umsatz)";
      row[5] = e.reference;
      row[6] = e.id;
      row[7] = e.created_at;
      row[8] = e.day;
      row[9] = "Bar";
      row[16] = e.description;
      row.push(
        `KB-${e.number}`,
        e.category,
        money(Math.max(e.amount_cents, 0)),
        money(Math.max(-e.amount_cents, 0)),
        money(e.balance_cents),
        e.actor_name,
        e.has_document ? "Ja" : "Nein",
      );
      rows.push(row);
    }
  }
  const quote = (v: string, col: number) =>
    '"' +
    ((col < 11 ||
      col === 15 ||
      col === 16 ||
      (cashBook &&
        col >= header.length - 7 &&
        ![header.length - 5, header.length - 4, header.length - 3].includes(
          col,
        ))) &&
    /^[\s]*[=+@-]/.test(v)
      ? "'" + v
      : v
    ).replace(/"/g, '""') +
    '"';
  return (
    "\ufeff" +
    [header, ...rows].map((row) => row.map(quote).join(";")).join("\r\n") +
    "\r\n"
  );
}
