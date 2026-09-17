import type { SaleLine } from "./types";

export const discountReasons = [
  "Kurzes Mindesthaltbarkeitsdatum",
  "Beschädigte Verpackung",
  "Aktion",
  "Kulanz",
  "Mengenrabatt",
  "Sonstiger Preisnachlass",
] as const;
export function discountedPrice(cents: number, percent: number) {
  if (
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    !Number.isInteger(percent) ||
    percent < 0 ||
    percent > 100
  )
    throw new Error("Ungültiger Preis oder Rabatt.");
  // Cent rounding per unit; identical to PostgreSQL round() for positive prices.
  return Math.round((cents * (100 - percent)) / 100);
}
export function discountTotal(lines: SaleLine[]) {
  return lines.reduce(
    (sum, line) =>
      sum +
      (line.quantity > 0
        ? Math.max(
            0,
            (line.original_price_cents ?? line.price_cents) - line.price_cents,
          ) * line.quantity
        : 0),
    0,
  );
}
