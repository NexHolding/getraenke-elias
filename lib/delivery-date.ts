/** Business dates are calendar dates in Germany, never UTC days or 24-hour offsets. */
export function berlinDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    now,
  );
}
export function followingDay(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
export function earliestNewDelivery(now = new Date()) {
  return followingDay(berlinDate(now));
}
export function earliestOrderDelivery(order: {
  created_at: string;
  requested_delivery_date?: string | null;
}) {
  const received = new Date(order.created_at);
  if (!Number.isFinite(received.getTime())) return null;
  const earliest = earliestNewDelivery(received);
  return order.requested_delivery_date &&
    order.requested_delivery_date > earliest
    ? order.requested_delivery_date
    : earliest;
}
export function berlinMinute(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return (
    Number(parts.find((p) => p.type === "hour")!.value) * 60 +
    Number(parts.find((p) => p.type === "minute")!.value)
  );
}
