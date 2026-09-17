import type { Order, Settings } from "./types";
export const minutes = (s: string) =>
  Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const hhmm = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function nextDate(date: string, interval: string) {
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDate();
  if (interval === "weekly" || interval === "biweekly")
    d.setUTCDate(day + (interval === "weekly" ? 7 : 14));
  else {
    const months: Record<string, number> = {
      monthly: 1,
      quarterly: 3,
      halfyearly: 6,
      yearly: 12,
    };
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + (months[interval] || 1));
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0, 10);
}
export function km(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const v =
    Math.sin(((b[0] - a[0]) * r) / 2) ** 2 +
    Math.cos(a[0] * r) *
      Math.cos(b[0] * r) *
      Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
}
export function planDay(orders: Order[], date: string, cfg: Settings) {
  const day = new Date(date + "T12:00:00Z").getUTCDay() || 7;
  if (!(cfg.delivery_days || [1, 2, 3, 4, 5]).includes(day))
    return {
      stops: [],
      unplanned: orders.map((o) => ({ id: o.id, reason: "Kein Liefertag" })),
    };
  let clock = minutes(cfg.delivery_from || "10:00");
  const end = minutes(cfg.delivery_to || "18:00");
  let point: [number, number] = [49.1507, 9.2199];
  const remaining = orders.filter(
    (o) => !o.requested_delivery_date || o.requested_delivery_date <= date,
  );
  const stops: {
    id: string;
    eta_start: string;
    eta_end: string;
    position: number;
    estimated: boolean;
  }[] = [];
  const unplanned: { id: string; reason: string }[] = orders
    .filter(
      (o) => o.requested_delivery_date && o.requested_delivery_date > date,
    )
    .map((o) => ({ id: o.id, reason: "Liefertermin liegt in der Zukunft" }));
  while (remaining.length) {
    const candidates = remaining
      .map((o) => {
        const p = o.preference_snapshot || {};
        const coordinates = p.latitude != null && p.longitude != null;
        const travel = coordinates
          ? Math.max(
              5,
              Math.ceil(
                ((km(point, [p.latitude!, p.longitude!]) * 1.4) / 30) * 60,
              ),
            )
          : 20;
        const arrival = clock + travel;
        const windows =
          p.dropoff_allowed || !p.windows?.length
            ? [
                {
                  day,
                  from: cfg.delivery_from || "10:00",
                  to: cfg.delivery_to || "18:00",
                },
              ]
            : p.windows.filter((w) => w.day === day);
        const feasible = windows
          .map((w) => ({
            start: Math.max(arrival, minutes(w.from)),
            finish: Math.min(end, minutes(w.to)),
          }))
          .filter(
            (w) => w.start + (cfg.delivery_stop_minutes || 10) <= w.finish,
          )
          .sort((a, b) => a.start - b.start)[0];
        return { o, travel, feasible, coordinates };
      })
      .filter((x) => x.feasible)
      .sort(
        (a, b) =>
          a.feasible!.finish - b.feasible!.finish ||
          a.feasible!.start - b.feasible!.start ||
          a.travel - b.travel,
      );
    const choice = candidates[0];
    if (!choice) {
      unplanned.push(
        ...remaining.map((o) => ({
          id: o.id,
          reason: "Kein passendes Zeitfenster oder Tour bereits voll",
        })),
      );
      break;
    }
    const start = choice.feasible!.start;
    stops.push({
      id: choice.o.id,
      eta_start: hhmm(start),
      eta_end: hhmm(Math.min(start + 30, choice.feasible!.finish)),
      position: stops.length + 1,
      estimated: true,
    });
    clock = start + (cfg.delivery_stop_minutes || 10);
    if (choice.coordinates)
      point = [
        choice.o.preference_snapshot!.latitude!,
        choice.o.preference_snapshot!.longitude!,
      ];
    remaining.splice(
      remaining.findIndex((o) => o.id === choice.o.id),
      1,
    );
  }
  return { stops, unplanned };
}
