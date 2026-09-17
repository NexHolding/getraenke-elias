import type { SaleLine } from "./types";
export const euro = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    cents === 0 ? 0 : cents / 100,
  );
export const pack = (p: { pack_count: number; volume_ml: number }) =>
  p.volume_ml
    ? `${p.pack_count} × ${(p.volume_ml / 1000).toLocaleString("de-DE")} l`
    : "pro Einheit";
export function totals(lines: SaleLine[]) {
  let gross = 0,
    net = 0,
    deposit = 0;
  const taxes: Record<string, { gross: number; net: number; tax: number }> = {};
  for (const l of lines) {
    if (
      !Number.isInteger(l.quantity) ||
      !Number.isSafeInteger(l.price_cents) ||
      !Number.isSafeInteger(l.deposit_cents)
    )
      throw new Error("Ungültige Cent-Beträge oder Mengen.");
    for (const [amount, rate] of [
      [l.quantity * l.price_cents, l.tax_rate],
      [l.quantity * l.deposit_cents, l.deposit_tax_rate],
    ]) {
      const n = Math.round((amount * 100) / (100 + rate));
      gross += amount;
      net += n;
      const group = taxes[rate] ?? { gross: 0, net: 0, tax: 0 };
      group.gross += amount;
      group.net += n;
      group.tax += amount - n;
      taxes[rate] = group;
    }
    deposit += l.quantity * l.deposit_cents;
  }
  return { gross, net, tax: gross - net, deposit, taxes };
}
export function reorderQuantity(
  stock: number,
  min: number,
  target: number,
  pending = 0,
) {
  return stock < min ? Math.max(0, target - stock - pending) : 0;
}
