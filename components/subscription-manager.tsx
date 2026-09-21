"use client";
import { earliestNewDelivery } from "@/lib/delivery-date";
import { useRef, useState } from "react";
import { Plus, Repeat2, Search, Trash2, CalendarDays } from "lucide-react";
import {
  deliveryAddressFields,
  formatDeliveryAddress,
} from "@/lib/delivery-address";
import type { Customer, Product, Subscription } from "@/lib/types";
import { deliveryIntervals } from "@/lib/staff-orders";
import type { SubscriptionCommand } from "@/lib/subscriptions";
import { euro, pack } from "@/lib/money";
import { ProductPhoto } from "./product-photo";
import NumberInput from "./number-input";
const dateLabel = (s: string) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("de-DE");
export default function SubscriptionManager({
  customer,
  subscriptions,
  products,
  staff = false,
  onChanged,
  onEditProfile,
}: {
  customer: Customer;
  subscriptions: Subscription[];
  products: Product[];
  staff?: boolean;
  onChanged: () => Promise<void>;
  onEditProfile?: () => void;
}) {
  const [draft, setDraft] = useState<SubscriptionCommand | null>(null),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<SubscriptionCommand | null>(null);
  const lock = useRef(false);
  const address = deliveryAddressFields(customer);
  const missing = [
    [address.street, "Straße"],
    [address.house_number, "Hausnummer"],
    [
      /^\d{5}$/.test(address.postal_code) ? address.postal_code : "",
      "Postleitzahl",
    ],
    [address.city, "Ort"],
    [customer.phone, "Telefonnummer"],
  ]
    .filter(([value]) => !value?.trim())
    .map(([, label]) => label);
  const complete = missing.length === 0;
  function start(s?: Subscription) {
    setMessage("");
    setQuery("");
    setDraft({
      id: s?.id || crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      revision: s?.revision ?? null,
      customer_id: customer.id,
      items: s?.items.map((i) => ({ ...i })) || [],
      interval: (s?.interval || "weekly") as SubscriptionCommand["interval"],
      next_date: s?.next_date || earliestNewDelivery(),
      notes: s?.notes || "",
      active: s?.active ?? true,
    });
  }
  async function save(value: SubscriptionCommand) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setPending(value);
    try {
      const r = await fetch(staff ? "/api/operations" : "/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delivery-subscription", value }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status < 500) setPending(null);
        throw Error(d.error || "Speichern fehlgeschlagen.");
      }
      setPending(null);
      setDraft(null);
      setMessage(
        value.active
          ? "Lieferabo gespeichert. Der nächste Auftrag wird am Vortag des gewählten Termins automatisch vorbereitet."
          : "Lieferabo pausiert. Bereits angelegte Bestellungen bleiben bestehen.",
      );
      try {
        await onChanged();
      } catch {
        setMessage("Lieferabo gespeichert. Bitte die Ansicht neu laden.");
      }
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Verbindung unterbrochen. Bitte denselben Vorgang erneut prüfen.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const chosen =
    draft?.items.map((i) => ({
      line: i,
      product: products.find((p) => p.id === i.id),
    })) || [];
  const crates = chosen.reduce(
    (s, { line, product }) =>
      s +
      (product?.kind === "beverage" && product.pack_count > 1
        ? line.quantity
        : 0),
    0,
  );
  const valid = chosen.every(
    ({ product, line }) =>
      product?.active &&
      product.deposit_cents !== null &&
      Number.isInteger(line.quantity) &&
      line.quantity > 0 &&
      line.quantity <= 100,
  );
  const total = chosen.reduce(
    (s, { line, product }) =>
      s +
      line.quantity *
        ((product?.price_cents || 0) + (product?.deposit_cents || 0)),
    0,
  );
  const matches = products
    .filter(
      (p) =>
        p.active &&
        (staff || p.kind === "beverage") &&
        `${p.name} ${p.sku} ${p.variant || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        !draft?.items.some((i) => i.id === p.id),
    )
    .slice(0, 12);
  return (
    <section className="subscription-manager">
      <div className="portal-section-head">
        <div>
          <span className="eyebrow">REGELMÄSSIG GUT VERSORGT</span>
          <h2>Lieferabos</h2>
          <p>
            Deine Auswahl, dein Rhythmus. Jederzeit bearbeiten oder pausieren.
          </p>
        </div>
        {!draft && (
          <button
            className="button"
            disabled={busy || !!pending}
            onClick={() => start()}
          >
            <Plus size={18} />
            Lieferabo anlegen
          </button>
        )}
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {pending && !busy && (
        <div className="notice">
          <p>
            Der Buchungsstatus ist noch unklar. Dieser Vorgang wird mit
            derselben Kennung erneut geprüft.
          </p>
          <button className="button" onClick={() => save(pending)}>
            Speicherstatus erneut prüfen
          </button>
        </div>
      )}
      <div className="notice">
        {complete ? (
          <p>
            <strong>Lieferadresse:</strong> {formatDeliveryAddress(address)}
            <br />
            Telefon: {customer.phone}
          </p>
        ) : (
          <p>
            Bitte im Profil ergänzen: {missing.join(", ")}. Bereits gespeicherte
            Angaben werden übernommen. Bestehende Abos können weiterhin pausiert
            werden.
          </p>
        )}
        {onEditProfile && (
          <button type="button" className="text-link" onClick={onEditProfile}>
            {complete
              ? "Lieferadresse im Profil ändern"
              : "Profil vervollständigen"}
          </button>
        )}
      </div>
      {draft ? (
        <form
          className="subscription-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save(pending || draft);
          }}
        >
          <div className="portal-section-head">
            <h3>
              {draft.revision === null
                ? "Neues Lieferabo"
                : "Lieferabo bearbeiten"}
            </h3>
            <button
              type="button"
              className="text-link"
              disabled={busy || !!pending}
              onClick={() => setDraft(null)}
            >
              Abbrechen
            </button>
          </div>
          <fieldset disabled={busy || !!pending}>
            <div className="subscription-schedule">
              <label>
                Lieferintervall
                <select
                  aria-label="Lieferintervall"
                  value={draft.interval}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      interval: e.target
                        .value as SubscriptionCommand["interval"],
                    })
                  }
                >
                  {Object.entries(deliveryIntervals).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {draft.revision === null ? "Starttermin" : "Nächster Termin"}
                <input
                  type="date"
                  required
                  min={draft.active ? earliestNewDelivery() : undefined}
                  value={draft.next_date}
                  onChange={(e) =>
                    setDraft({ ...draft, next_date: e.target.value })
                  }
                />
              </label>
              <p className="muted">
                Neue Liefertermine sind frühestens ab morgen möglich. Die
                konkrete Tour richtet sich nach unseren Liefertagen und deinen
                Zeitfenstern.
              </p>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) =>
                    setDraft({ ...draft, active: e.target.checked })
                  }
                />
                Lieferabo aktiv
              </label>
            </div>
            <h3>1. Getränke auswählen</h3>
            <label className="subscription-search">
              <Search size={18} />
              <span>Artikel suchen</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Marke, Sorte oder Artikelnummer"
              />
            </label>
            <div className="subscription-results">
              {matches.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      items: [...draft.items, { id: p.id, quantity: 1 }],
                    })
                  }
                >
                  <ProductPhoto product={p} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>{pack(p)}</small>
                    <small>
                      {euro(p.price_cents)} +{" "}
                      {p.deposit_cents === null
                        ? "Pfand ungeklärt"
                        : euro(p.deposit_cents) + " Pfand"}
                    </small>
                  </span>
                  <Plus size={18} />
                </button>
              ))}
            </div>
            {!matches.length && (
              <p>Keine weiteren passenden Artikel. Bitte die Suche ändern.</p>
            )}
            <h3>2. Mengen festlegen</h3>
            {!chosen.length && (
              <p className="portal-empty">Wähle oben deine Getränke aus.</p>
            )}
            {chosen.map(({ line, product }) => (
              <div className="subscription-selected" key={line.id}>
                <div>
                  <strong>
                    {product?.name || "Artikel nicht mehr verfügbar"}
                  </strong>
                  <small>{product ? pack(product) : line.id}</small>
                </div>
                <label>
                  Menge
                  <NumberInput
                    aria-label={`Menge ${product?.name || line.id}`}
                    min={1}
                    max={100}
                    required
                    value={line.quantity}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        items: draft.items.map((i) =>
                          i.id === line.id
                            ? { ...i, quantity: Number(e.target.value) }
                            : i,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${product?.name || line.id} entfernen`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      items: draft.items.filter((i) => i.id !== line.id),
                    })
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            <label>
              Lieferhinweis
              <textarea
                maxLength={1000}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Zum Beispiel: Bitte am Seiteneingang klingeln"
              />
            </label>
            {!valid && chosen.length > 0 && (
              <p className="notice">
                Bitte inaktive Artikel oder Artikel ohne bestätigten Pfandbetrag
                aus der Auswahl entfernen bzw. durch Elias prüfen lassen.
              </p>
            )}
            <div className="subscription-total">
              <div>
                <small>Aktuelle Auswahl inkl. MwSt. und Pfand</small>
                <strong>{euro(total)}</strong>
                <small>
                  {staff ? "" : `${crates} von mindestens 4 Kisten · `}Preise
                  werden bei Auftragserstellung aktualisiert.
                </small>
              </div>
              <button
                className="button"
                disabled={
                  busy ||
                  !draft.items.length ||
                  (draft.active &&
                    (!complete || !valid || (!staff && crates < 4)))
                }
              >
                {busy ? "Wird gespeichert …" : "Lieferabo speichern"}
              </button>
            </div>
            <p className="fineprint">
              Zum Fälligkeitstag entsteht eine Lieferanfrage zu den dann
              gültigen Preisen. Elias bestätigt Verfügbarkeit und Liefertermin.
              Die konkrete Zustellung erfolgt nach Tourenplanung und deinen
              Lieferzeiten. Änderungen gelten für zukünftige Aufträge.
            </p>
          </fieldset>
        </form>
      ) : (
        <div className="subscription-cards">
          {subscriptions.map((s) => (
            <article className="subscription-card" key={s.id}>
              <div className="portal-section-head">
                <Repeat2 size={24} />
                <span className={`badge ${s.active ? "green" : ""}`}>
                  {s.active ? "Aktiv" : "Pausiert"}
                </span>
              </div>
              <h3>
                {
                  deliveryIntervals[
                    s.interval as keyof typeof deliveryIntervals
                  ]
                }
              </h3>
              <p>
                <CalendarDays size={17} />
                Nächste Anfrage: {dateLabel(s.next_date)}
              </p>
              <ul>
                {s.items.map((i) => (
                  <li key={i.id}>
                    {i.quantity} ×{" "}
                    {products.find((p) => p.id === i.id)?.name || i.id}
                  </li>
                ))}
              </ul>
              {s.notes && <p>{s.notes}</p>}
              {s.last_error && <p className="notice">{s.last_error}</p>}
              <div className="inline-actions">
                <button
                  className="button secondary"
                  disabled={busy || !!pending}
                  onClick={() => start(s)}
                >
                  {s.active ? "Bearbeiten" : "Bearbeiten / Fortsetzen"}
                </button>
                {s.active && (
                  <button
                    className="text-link"
                    disabled={busy || !!pending}
                    onClick={() =>
                      save({
                        id: s.id,
                        request_id: crypto.randomUUID(),
                        revision: s.revision,
                        customer_id: customer.id,
                        items: s.items,
                        interval: s.interval as SubscriptionCommand["interval"],
                        next_date: s.next_date,
                        active: false,
                        notes: s.notes || "",
                      })
                    }
                  >
                    Pausieren
                  </button>
                )}
              </div>
            </article>
          ))}
          {!subscriptions.length && (
            <div className="portal-empty">
              <Repeat2 size={32} />
              <h3>Deine Lieblingsgetränke im Rhythmus</h3>
              <p>
                Lege dein erstes Lieferabo an und spare dir die wiederholte
                Auswahl.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
