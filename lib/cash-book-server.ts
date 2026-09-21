import "server-only";
import { serviceDb, requireStaff } from "./server";
import { can, financeReadOnly } from "./permissions";
import { readAllRows } from "./database-read";
import { buildCashBookReport, type CashDay, type CashEntry } from "./cash-book";
export async function cashAccess(write = false) {
  const a = await requireStaff();
  if (
    (!can(a, "kasse") && !can(a, "finanzen")) ||
    (write && financeReadOnly(a))
  )
    throw Error("FORBIDDEN");
  return a;
}
export async function readCashBook(period: string) {
  const [days, settings] = await Promise.all([
    readAllRows<CashDay>("cash_days", { order: "day" }),
    serviceDb().from("settings").select("value").eq("id", 1).single(),
  ]);
  if (settings.error) throw settings.error;
  const ids = days.filter((d) => d.day.startsWith(period)).map((d) => d.id);
  const entries: CashEntry[] = [];
  if (ids.length) {
    for (let offset = 0; ; offset += 1000) {
      if (offset >= 100000)
        throw new Error(
          "HINWEIS:Bitte das Kassenbuch in kleinere Zeiträume aufteilen.",
        );
      const { data, error } = await serviceDb()
        .from("cash_entries")
        .select("*")
        .in("day_id", ids)
        .order("number")
        .range(offset, offset + 999);
      if (error) throw error;
      entries.push(...(data as CashEntry[]));
      if (data.length < 1000) break;
    }
  }
  return {
    report: buildCashBookReport(days, entries, period),
    allDays: days,
    settings: Object.fromEntries(
      [
        "business_name",
        "business_address",
        "tax_number",
        "vat_id",
        "live_mode",
      ].map((key) => [key, settings.data.value[key]]),
    ),
  };
}
