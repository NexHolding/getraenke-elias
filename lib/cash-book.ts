import { z } from "zod";
export type CashDay = {
  id: string;
  day: string;
  test_mode: boolean;
  opening_cents: number;
  opened_at: string;
  opened_by: string;
  closed_at: string | null;
  closed_by: string | null;
  expected_cents: number | null;
  counted_cents: number | null;
  difference_cents: number | null;
  next_opening_cents: number | null;
  closing_note: string;
  transfer_note: string;
};
export type CashEntry = {
  id: string;
  number: number;
  day_id: string;
  created_at: string;
  kind: string;
  amount_cents: number;
  balance_cents: number;
  description: string;
  category: string;
  reference: string;
  document_date: string | null;
  actor_name: string;
  has_document: boolean;
  source_key: string | null;
  original_id: string | null;
};
export type CashBookReport = {
  period: string;
  days: CashDay[];
  entries: (CashEntry & { day: string; test_mode: boolean })[];
  opening: number;
  ending: number;
  income: number;
  expenses: number;
  difference: number;
  mode: string;
};
export function buildCashBookReport(
  days: CashDay[],
  entries: CashEntry[],
  period: string,
): CashBookReport {
  const selected = days
    .filter((d) => d.day.startsWith(period))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (selected.some((d) => d.test_mode) && selected.some((d) => !d.test_mode))
    throw new Error(
      "Einrichtungs- und Echtbelege dürfen nicht in einem Kassenbuchbericht vermischt werden.",
    );
  const lookup = new Map(selected.map((d) => [d.id, d]));
  const rows = entries
    .filter((e) => lookup.has(e.day_id))
    .sort((a, b) => a.number - b.number)
    .map((e) => ({
      ...e,
      day: lookup.get(e.day_id)!.day,
      test_mode: lookup.get(e.day_id)!.test_mode,
    }));
  return {
    period,
    days: selected,
    entries: rows,
    opening: rows.length ? rows[0].balance_cents - rows[0].amount_cents : 0,
    ending: rows.at(-1)?.balance_cents || 0,
    income: rows.reduce((n, e) => n + Math.max(e.amount_cents, 0), 0),
    expenses: rows.reduce((n, e) => n + Math.max(-e.amount_cents, 0), 0),
    difference: selected.reduce((n, d) => n + (d.difference_cents || 0), 0),
    mode: !selected.length
      ? "Keine Buchungen"
      : selected.some((d) => d.test_mode)
        ? "EINRICHTUNG / TESTDATEN"
        : "Echtbetrieb",
  };
}
const cents = z.number().int().min(0).max(100000000);
export const cashCommandSchema = z.object({
  request_id: z.uuid(),
  action: z.enum(["open", "movement", "reverse", "close", "delivery-transfer"]),
  day_id: z.uuid().optional(),
  opening_cents: cents.optional(),
  counted_cents: cents.optional(),
  next_opening_cents: cents.optional(),
  revision: z.number().int().min(0).optional(),
  confirmed: z.boolean().optional(),
  amount_cents: z.number().int().min(-100000000).max(100000000).optional(),
  description: z.string().trim().max(1000).optional(),
  category: z
    .enum([
      "Betriebsausgabe",
      "Privatentnahme",
      "Privateinlage",
      "Bank / Tresor",
      "Sonstige Einlage",
      "Sonstige Entnahme",
    ])
    .optional(),
  reference: z.string().trim().max(200).optional(),
  document_date: z.iso.date().optional(),
  note: z.string().trim().max(1000).optional(),
  transfer_note: z.string().trim().max(200).optional(),
  entry_id: z.uuid().optional(),
  payment_id: z.uuid().optional(),
  document: z
    .object({
      filename: z.string().min(1).max(200),
      mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      base64: z.string().max(2800000),
    })
    .optional(),
});
export type CashCommand = z.infer<typeof cashCommandSchema>;
const money = (n: number) => (n / 100).toFixed(2).replace(".", ",");
const quote = (v: string, column: number) =>
  '"' +
  (![9, 10, 11, 15, 16, 17, 18].includes(column) && /^[\s]*[=+@-]/.test(v)
    ? "'" + v
    : v
  ).replaceAll('"', '""') +
  '"';
export function cashBookCsv(r: CashBookReport) {
  const header = [
    "Kassenbuch",
    "Datenstatus",
    "Datum",
    "KB-Nummer",
    "Buchung UTC",
    "Belegdatum",
    "Kategorie",
    "Zweck",
    "Referenz",
    "Einnahme EUR",
    "Ausgabe EUR",
    "Bestand EUR",
    "Erfasst durch",
    "Belegdatei",
    "Gegenbuchung zu",
    "Sollbestand vor Zählung EUR",
    "Gezählt EUR",
    "Zähldifferenz EUR",
    "Nächster Anfang EUR",
  ];
  const closing = (e: CashEntry) =>
    e.kind === "difference" ? r.days.find((d) => d.id === e.day_id) : undefined;
  const rows = r.entries.map((e) => [
    r.period,
    e.test_mode ? "TESTDATEN" : "Echtbetrieb",
    e.day,
    `KB-${e.number}`,
    e.created_at,
    e.document_date || "",
    e.category,
    e.description,
    e.reference,
    money(Math.max(e.amount_cents, 0)),
    money(Math.max(-e.amount_cents, 0)),
    money(e.balance_cents),
    e.actor_name,
    e.has_document ? "Ja" : "Nein",
    e.original_id || "",
    closing(e)?.expected_cents == null
      ? ""
      : money(closing(e)!.expected_cents!),
    closing(e)?.counted_cents == null ? "" : money(closing(e)!.counted_cents!),
    closing(e)?.difference_cents == null
      ? ""
      : money(closing(e)!.difference_cents!),
    closing(e)?.next_opening_cents == null
      ? ""
      : money(closing(e)!.next_opening_cents!),
  ]);
  return (
    "\ufeff" +
    [header, ...rows].map((row) => row.map(quote).join(";")).join("\r\n") +
    "\r\n"
  );
}
