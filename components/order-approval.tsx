"use client";
import { useState } from "react";
import { paymentLabels } from "@/lib/billing";
import type { Order } from "@/lib/types";
export default function OrderApproval({
  order,
  busy,
  save,
}: {
  order: Order;
  busy: boolean;
  save: (value: Record<string, unknown>) => Promise<unknown>;
}) {
  const [method, setMethod] = useState(
    order.approved_payment_method || order.requested_payment_method || "cash",
  );
  const [status, setStatus] = useState(
    order.status === "new" ? "confirmed" : order.status,
  );
  const closed = ["completed", "cancelled"].includes(order.status);
  return (
    <section
      className="order-payment-approval"
      aria-label={`Zahlungsfreigabe Auftrag ${order.number}`}
    >
      <p>
        Kundenwunsch:{" "}
        <strong>
          {order.requested_payment_method
            ? paymentLabels[order.requested_payment_method]
            : "Nicht angegeben"}
        </strong>{" "}
        · Freigabe:{" "}
        <strong>
          {order.approved_payment_method
            ? paymentLabels[order.approved_payment_method]
            : "Ausstehend"}
        </strong>
      </p>
      {!closed && (
        <form
          className="form-grid two-columns"
          onSubmit={async (e) => {
            e.preventDefault();
            await save({
              id: order.id,
              status,
              payment_method: method,
              expected_revision: order.payment_revision || 0,
            });
          }}
        >
          <label>
            Zahlungsart freigeben
            <select
              aria-label={`Zahlungsart Auftrag ${order.number}`}
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              disabled={busy}
            >
              <option value="cash">Bar bei Lieferung</option>
              <option value="card">EC-Karte bei Lieferung</option>
              <option value="invoice">Rechnung</option>
            </select>
          </label>
          <label>
            Auftragsstatus
            <select
              aria-label={`Status Anfrage ${order.number}`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={busy || order.status === "partial"}
            >
              <option value="new">Neu / noch prüfen</option>
              <option value="confirmed">Bestätigt</option>
              <option value="delivering">In Lieferung</option>
              {order.status === "partial" && (
                <option value="partial">Restlieferung offen</option>
              )}
              <option value="cancelled">Storniert</option>
            </select>
          </label>
          <p className="fineprint span-two">
            Abweichende Zahlungsart mit dem Kunden abstimmen. Diese Freigabe
            gilt für den Auftrag. Die dauerhafte Vorgabe lässt sich in der
            Kundenakte ändern.
          </p>
          <button className="button span-two" disabled={busy}>
            {order.status === "new"
              ? "Zahlungsart bestätigen & Auftrag freigeben"
              : "Auftrag & Zahlungsart speichern"}
          </button>
        </form>
      )}
    </section>
  );
}
