// Parse cash input as integer cents. Accept German decimal comma and dot;
// reject signs, exponent notation, grouping separators and fractional cents.
export function cashCents(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,7}(?:[.,]\d{0,2})?$/.test(value)) return null;
  const [whole, decimal = ""] = value.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
export function cashChange(
  total: number,
  received: number | null,
): number | null {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    received === null ||
    !Number.isSafeInteger(received) ||
    received < total
  )
    return null;
  return received - total;
}
