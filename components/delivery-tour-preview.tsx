"use client";
import { useEffect, useState } from "react";
import type { TourPreview } from "@/lib/subscription-preview";
import type { Order } from "@/lib/types";
import { euro } from "@/lib/money";
export default function DeliveryTourPreview({
  date,
  orders,
}: {
  date: string;
  orders: Order[];
}) {
  const [result, setResult] = useState<{
    date: string;
    data?: TourPreview;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    void fetch(`/api/delivery-preview?date=${date}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok)
          throw Error(d.error || "Vorschau konnte nicht geladen werden.");
        if (!controller.signal.aborted) setResult({ date, data: d });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setResult({ date, error: e.message });
      });
    return () => controller.abort();
  }, [date, orders]);
  const data = result?.date === date ? result.data : undefined;
  const load = new Map<string, { name: string; quantity: number }>();
  for (const o of data?.orders || [])
    for (const item of o.items) {
      const quantity = Math.max(
        0,
        item.quantity - (o.delivered?.[item.id] || 0),
      );
      const row = load.get(item.id) || { name: item.name, quantity: 0 };
      row.quantity += quantity;
      load.set(item.id, row);
    }
  return (
    <section className="panel" aria-label="Tourvorschau">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Vorbereitung</span>
          <h2>Tourvorschau · {date.split("-").reverse().join(".")}</h2>
        </div>
        <button
          className="button secondary"
          disabled={!data}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("elias:pdf-preview", {
                detail: `/api/delivery-list?date=${date}&preview=1`,
              }),
            )
          }
        >
          Vorschau als PDF
        </button>
      </div>
      <p>
        Bestätigte offene Aufträge und voraussichtliche Abo-Lieferungen. Die
        Vorschau reserviert keine Ware und verschickt keine Bestellungen.
        Abo-Aufträge werden am Vortag vorbereitet.
      </p>
      {result?.date === date && result.error ? (
        <p role="status" className="notice">
          {result.error}
        </p>
      ) : !data ? (
        <p role="status">Tourvorschau wird geladen …</p>
      ) : (
        <>
          {!data.orders.length && (
            <p>Für diesen Tag sind keine passenden Stopps vorgesehen.</p>
          )}
          {data.orders.map((o) => (
            <div className="load-row" key={o.id}>
              <strong>
                {o.route_position}. {o.customer_name}
                <small>
                  {o.preview_only
                    ? "Abo-Vorschau · noch kein Auftrag"
                    : `Auftrag EL-${o.number}`}
                </small>
              </strong>
              <span>
                Ca. {o.eta_start}–{o.eta_end} Uhr
              </span>
              <span>
                {o.items
                  .map(
                    (i) =>
                      `${Math.max(0, i.quantity - (o.delivered?.[i.id] || 0))} × ${i.name}`,
                  )
                  .join(" · ")}
              </span>
              <b>
                {euro(
                  o.items.reduce(
                    (s, i) =>
                      s +
                      Math.max(0, i.quantity - (o.delivered?.[i.id] || 0)) *
                        (i.price_cents + (i.deposit_cents || 0)),
                    0,
                  ),
                )}
              </b>
            </div>
          ))}
          {!!load.size && (
            <details>
              <summary>Voraussichtliche Beladung · {load.size} Artikel</summary>
              {[...load].map(([id, row]) => (
                <p key={id}>
                  {row.quantity} × {row.name}
                </p>
              ))}
            </details>
          )}
          {!!data.unplanned.length && (
            <div className="notice">
              <h3>Noch nicht einplanbar</h3>
              {data.unplanned.map((o) => (
                <p key={o.id}>
                  {o.name}: {o.reason}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
