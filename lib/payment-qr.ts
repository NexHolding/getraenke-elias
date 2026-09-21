/** EPC069-12 v3.1 / payload version 002 (SEPA credit transfer). */
const sepaLengths: Record<string, number> = {
  AT: 20,
  BE: 16,
  BG: 22,
  HR: 21,
  CY: 28,
  CZ: 24,
  DK: 18,
  EE: 20,
  FI: 18,
  FR: 27,
  DE: 22,
  GR: 27,
  HU: 28,
  IS: 26,
  IE: 22,
  IT: 27,
  LV: 21,
  LI: 21,
  LT: 20,
  LU: 20,
  MT: 31,
  NL: 18,
  NO: 15,
  PL: 28,
  PT: 25,
  RO: 24,
  SK: 24,
  SI: 19,
  ES: 24,
  SE: 24,
  CH: 21,
  GB: 22,
  MC: 27,
  SM: 27,
  AD: 24,
  VA: 22,
  AL: 28,
  ME: 22,
  MK: 19,
  MD: 24,
  RS: 22,
};
const eea = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE".split(
    " ",
  ),
);
export const normalizeIban = (value: string) =>
  value.replace(/\s/g, "").toUpperCase();
export function validIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (
    !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban) ||
    iban.length !== sepaLengths[iban.slice(0, 2)]
  )
    return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}
export type PaymentAccount = {
  bank_account_holder?: string;
  bank_iban?: string;
  bank_bic?: string;
  bank_name?: string;
};
export function paymentAccountIssue(account: PaymentAccount): string | null {
  if (
    !account.bank_account_holder?.trim() ||
    account.bank_account_holder.trim().length > 70 ||
    /[\r\n\x00-\x1f]/.test(account.bank_account_holder)
  )
    return "Kontoinhaber (maximal 70 Zeichen) hinterlegen.";
  if (!validIban(account.bank_iban || ""))
    return "Gültige SEPA-IBAN hinterlegen.";
  const bic = account.bank_bic?.trim().toUpperCase() || "";
  if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic))
    return "BIC muss aus 8 oder 11 gültigen Zeichen bestehen.";
  if (!eea.has(normalizeIban(account.bank_iban || "").slice(0, 2)) && !bic)
    return "Für dieses SEPA-Konto außerhalb des EWR ist eine BIC erforderlich.";
  return null;
}
export function paymentQrPayload(
  account: PaymentAccount,
  cents: number,
  reference: string,
): string {
  const issue = paymentAccountIssue(account);
  if (issue) throw Error(issue);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 99999999999)
    throw Error("Ungültiger SEPA-Zahlbetrag.");
  if (!reference || reference.length > 140 || /[\r\n\x00-\x1f]/.test(reference))
    throw Error("Ungültiger SEPA-Verwendungszweck.");
  const payload = [
    "BCD",
    "002",
    "1",
    "SCT",
    account.bank_bic?.trim().toUpperCase() || "",
    account.bank_account_holder!.trim(),
    normalizeIban(account.bank_iban!),
    `EUR${(cents / 100).toFixed(2)}`,
    "",
    "",
    reference,
  ].join("\n");
  if (new TextEncoder().encode(payload).length > 331)
    throw Error("SEPA-QR-Code überschreitet 331 Bytes.");
  return payload;
}
