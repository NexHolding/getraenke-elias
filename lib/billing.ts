import { z } from "zod";
import type { Invoice } from "./types";
import { berlinDate } from "./finance-report";
export const paymentLabels = {
  cash: "Barzahlung",
  card: "EC-Karte",
  invoice: "Rechnung",
  bank: "Überweisung",
} as const;
export const invoicePaymentSchema = z.object({
  id: z.uuid(),
  method: z.enum(["bank", "cash", "card"]),
  paid_on: z.iso.date(),
  confirmed: z.literal(true),
});
export function invoiceState(
  i: Invoice,
  today = berlinDate(new Date().toISOString()),
) {
  if (i.status === "paid") return { label: "Bezahlt", tone: "paid" };
  if (i.status === "cancelled") return { label: "Storniert", tone: "neutral" };
  if (i.reminder_stage)
    return {
      label: `Mahnstufe ${i.reminder_stage}${i.reminder_status === "sent" ? "" : i.reminder_status === "pending" ? " · Versand vorgemerkt" : " · Versand prüfen"}`,
      tone: `reminder-${i.reminder_stage}`,
    };
  if (i.due_date && i.due_date < today)
    return { label: "Überfällig", tone: "overdue" };
  return { label: "Offen", tone: "open" };
}
