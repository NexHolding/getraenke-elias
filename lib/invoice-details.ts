import "server-only";
import { serviceDb } from "./server";
import type { Invoice } from "./types";
// Scope every lookup to the already-authorized invoices and stay below PostgREST row limits.
export async function invoiceDetails<T extends { id: string }>(invoices: T[]) {
  const db = serviceDb();
  const details = new Map<string, Record<string, unknown>>();
  for (let start = 0; start < invoices.length; start += 100) {
    const ids = invoices.slice(start, start + 100).map((i) => i.id);
    const [payments, reminders] = await Promise.all([
      db.from("invoice_payments").select("*").in("invoice_id", ids),
      db
        .from("invoice_reminders")
        .select("invoice_id,stage,mail:mail_outbox(status)")
        .in("invoice_id", ids)
        .order("stage", { ascending: false }),
    ]);
    if (payments.error) throw payments.error;
    if (reminders.error) throw reminders.error;
    for (const id of ids) {
      const reminder = reminders.data?.find((r) => r.invoice_id === id);
      const mail = reminder?.mail as unknown as { status: string } | undefined;
      details.set(id, {
        payment_entry: payments.data?.find((p) => p.invoice_id === id) || null,
        reminder_stage: reminder?.stage || 0,
        reminder_status: mail?.status,
      });
    }
  }
  return invoices.map((i) => ({ ...i, ...details.get(i.id) })) as (T &
    Pick<Invoice, "payment_entry" | "reminder_stage" | "reminder_status">)[];
}
