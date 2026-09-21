"use client";
import type { DeliveryWindow } from "@/lib/delivery-windows";
import { weekdays } from "@/lib/delivery-windows";
export default function SubscriptionWindows({
  value,
  onChange,
  date,
}: {
  value: DeliveryWindow[];
  onChange: (value: DeliveryWindow[]) => void;
  date: string;
}) {
  return (
    <section className="notice span-two" aria-label="Lieferzeiten für das Abo">
      <h3>Wann können wir liefern?</h3>
      <p>
        Im Kundenprofil fehlen Lieferzeiten. Bitte mindestens einen Wochentag
        mit Zeitfenster ergänzen. Die Zeiten werden zusammen mit dem Abo im
        Kundenprofil gespeichert.
      </p>
      {value.map((w, i) => (
        <div className="window-row" key={i}>
          <label>
            Wochentag
            <select
              aria-label={`Lieferwochentag ${i + 1}`}
              value={w.day}
              onChange={(e) =>
                onChange(
                  value.map((x, k) =>
                    k === i ? { ...x, day: Number(e.target.value) } : x,
                  ),
                )
              }
            >
              {weekdays.map((day, k) => (
                <option key={day} value={k + 1}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label>
            Von
            <input
              required
              type="time"
              aria-label={`Lieferzeit von ${i + 1}`}
              value={w.from}
              onChange={(e) =>
                onChange(
                  value.map((x, k) =>
                    k === i ? { ...x, from: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            Bis
            <input
              required
              type="time"
              aria-label={`Lieferzeit bis ${i + 1}`}
              min={w.from || undefined}
              value={w.to}
              onChange={(e) =>
                onChange(
                  value.map((x, k) =>
                    k === i ? { ...x, to: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() => onChange(value.filter((_, k) => k !== i))}
          >
            Zeitfenster entfernen
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-link"
        disabled={value.length >= 21}
        onClick={() =>
          onChange([
            ...value,
            {
              day: new Date(date + "T12:00:00Z").getUTCDay() || 7,
              from: "",
              to: "",
            },
          ])
        }
      >
        Lieferzeit hinzufügen
      </button>
      {!value.length && <p role="status">Bitte eine Lieferzeit hinzufügen.</p>}
    </section>
  );
}
