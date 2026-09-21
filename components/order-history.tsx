"use client";
import { Package, CalendarDays, ArrowUpRight } from "lucide-react";
import type { Order } from "@/lib/types";
import { euro } from "@/lib/money";
const labels: Record<string, string> = {
  new: "Anfrage eingegangen",
  confirmed: "Bestätigt",
  delivering: "In Auslieferung",
  partial: "Teilweise geliefert",
  completed: "Vollständig geliefert",
  cancelled: "Storniert",
};
export default function OrderHistory({ orders }: { orders: Order[] }) {
  return (
    <div className="order-history">
      {orders.map((o) => (
        <article className="order-history-card" key={o.id}>
          <header>
            <div className="order-identity">
              <span className="portal-icon">
                <Package size={22} />
              </span>
              <div>
                <strong>EL-{String(o.number).padStart(5, "0")}</strong>
                <small>
                  {new Date(o.created_at).toLocaleDateString("de-DE", {
                    timeZone: "Europe/Berlin",
                  })}
                </small>
              </div>
            </div>
            <span
              className={`badge ${o.status === "completed" ? "green" : ""}`}
            >
              {labels[o.status] || o.status}
            </span>
          </header>
          {o.delivery_date && (
            <p className="order-eta">
              <CalendarDays size={17} />
              {new Date(o.delivery_date + "T12:00:00Z").toLocaleDateString(
                "de-DE",
              )}
              {o.eta_start && ` · ca. ${o.eta_start}–${o.eta_end} Uhr`}
            </p>
          )}
          <details>
            <summary>
              Artikel und Lieferstatus <ArrowUpRight size={16} />
            </summary>
            <div className="order-item-list">
              {o.items.map((i) => (
                <div key={i.id}>
                  <strong>
                    {i.quantity} × {i.name}
                  </strong>
                  <small>
                    {o.delivered?.[i.id] || 0} geliefert ·{" "}
                    {Math.max(0, i.quantity - (o.delivered?.[i.id] || 0))} offen
                  </small>
                </div>
              ))}
            </div>
          </details>
          <footer>
            <span>
              {o.items.reduce((n, i) => n + i.quantity, 0)} Gebinde / Artikel
            </span>
            <strong>
              {euro(
                o.items.reduce(
                  (n, i) =>
                    n + i.quantity * (i.price_cents + (i.deposit_cents || 0)),
                  0,
                ),
              )}
              <small>inkl. Pfand und MwSt.</small>
            </strong>
          </footer>
        </article>
      ))}
      {!orders.length && (
        <div className="portal-empty">
          <Package size={32} />
          <h3>Noch keine Bestellungen</h3>
          <p>
            Hier findest du deine Auswahl, Liefertermine und den aktuellen
            Status.
          </p>
        </div>
      )}
    </div>
  );
}
