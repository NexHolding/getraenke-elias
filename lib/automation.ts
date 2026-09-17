import "server-only";
import { serviceDb } from "./server";
import { planDay } from "./delivery-plan";
export async function dailyAutomation() {
  const db = serviceDb();
  const { error } = await db.rpc("generate_subscription_orders");
  if (error) throw error;
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
  const { data: cfg } = await db
    .from("settings")
    .select("value")
    .eq("id", 1)
    .single();
  const day = new Date(date + "T12:00:00Z").getUTCDay() || 7;
  if (!cfg?.value.delivery_days.includes(day)) return;
  const { error: stale } = await db
    .from("orders")
    .update({
      delivery_date: null,
      eta_start: null,
      eta_end: null,
      route_position: null,
    })
    .in("status", ["confirmed", "partial", "delivering"])
    .lt("delivery_date", date);
  if (stale) throw stale;
  const { data: orders, error: oe } = await db
    .from("orders")
    .select("*")
    .in("status", ["confirmed", "partial"])
    .is("delivery_date", null)
    .or(`requested_delivery_date.is.null,requested_delivery_date.lte.${date}`);
  if (oe) throw oe;
  if (!orders?.length) return;
  const { error: lock } = await db
    .from("automation_runs")
    .insert({ kind: "daily-plan", slot: date });
  if (lock?.code === "23505") return;
  if (lock) throw lock;
  const result = planDay(orders, date, cfg.value);
  for (const s of result.stops) {
    const { error } = await db
      .from("orders")
      .update({
        delivery_date: date,
        eta_start: s.eta_start,
        eta_end: s.eta_end,
        route_position: s.position,
      })
      .eq("id", s.id)
      .is("delivery_date", null);
    if (error) throw error;
  }
  return result;
}
