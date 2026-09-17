import { serviceDb } from "./server";

// Supabase caps each response at 1,000 rows. Never silently truncate accounts,
// delivery backlogs, or a finance export at that boundary.
export async function readAllRows<T = Record<string, unknown>>(
  table: string,
  options: {
    customerId?: string;
    columns?: string;
    kind?: string;
    runId?: string;
    order?: string;
    ascending?: boolean;
  } = {},
): Promise<T[]> {
  const rows: T[] = [];
  const db = serviceDb();
  for (let offset = 0; offset < 100000; offset += 1000) {
    let query = db.from(table).select(options.columns || "*");
    if (options.kind) query = query.eq("kind", options.kind);
    if (options.runId) query = query.eq("run_id", options.runId);
    if (options.customerId) query = query.eq("customer_id", options.customerId);
    query = query.order(options.order || "id", {
      ascending: options.ascending ?? true,
    });
    if (options.order && options.order !== "id" && options.order !== "user_id")
      query = query.order("id");
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data as T[]));
    if (data.length < 1000) return rows;
  }
  throw new Error(
    "HINWEIS:Zu viele Datensätze für diesen Abruf. Bitte die Auswertung zeitlich aufteilen lassen.",
  );
}
