"use client";
import { earliestNewDelivery } from "@/lib/delivery-date";
import { useRef, useState } from "react";
import { Plus, Repeat2, Search, Trash2, X } from "lucide-react";
import { useOperations } from "./operations";
import { ProductPhoto } from "./product-photo";
import { euro, pack, totals } from "@/lib/money";
import { deliveryIntervals } from "@/lib/staff-orders";
import type { Product, Subscription } from "@/lib/types";

type Line = { id: string; quantity: number };
type Draft = {
  customer_id: string;
  items: Line[];
  date: string;
  interval: string;
  notes: string;
  active: boolean;
};
const blank = (): Draft => ({
  customer_id: "",
  items: [],
  date: earliestNewDelivery(),
  interval: "",
  notes: "",
  active: true,
});
const dateLabel = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("de-DE");
export default function StaffOrders({
  products,
  reload,
}: {
  products: Product[];
  reload: () => Promise<void>;
}) {
  const op = useOperations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [customerQuery, setCustomerQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const customer = op.data.customers.find((c) => c.id === draft.customer_id);
  const chosen = draft.items.map((i) => ({
    line: i,
    product: products.find((p) => p.id === i.id),
  }));
  const valid = chosen.every(
    ({ product }) => product?.active && product.deposit_cents !== null,
  );
  const sum = totals(
    chosen
      .filter((v): v is { line: Line; product: Product } => !!v.product)
      .map(({ line, product }) => ({
        ...product,
        quantity: Number.isInteger(line.quantity) ? line.quantity : 0,
        deposit_cents: product.deposit_cents ?? 0,
      })),
  );
  const matching = products
    .filter(
      (p) =>
        p.active &&
        !draft.items.some((i) => i.id === p.id) &&
        `${p.name} ${p.sku} ${p.barcode}`
          .toLowerCase()
          .includes(productQuery.toLowerCase()),
    )
    .slice(0, 30);
  const customers = op.data.customers.filter(
    (c) =>
      c.id === draft.customer_id ||
      `${c.name} ${c.number} ${c.email} ${c.address}`
        .toLowerCase()
        .includes(customerQuery.toLowerCase()),
  );
  function start(s?: Subscription) {
    requestId.current = crypto.randomUUID();
    setEditing(s ?? null);
    setMessage("");
    setCustomerQuery("");
    setProductQuery("");
    setDraft(
      s
        ? {
            customer_id: s.customer_id,
            items: s.items.map((i) => ({ ...i })),
            date: s.next_date,
            interval: s.interval,
            notes: s.notes || "",
            active: s.active,
          }
        : blank(),
    );
    setOpen(true);
  }
  async function send(action: string, value: unknown) {
    const r = await fetch("/api/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, value }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }
  async function refresh() {
    try {
      await Promise.all([op.load(), reload()]);
    } catch {
      setMessage(
        (m) =>
          m + " Die Anzeige konnte nicht aktualisiert werden. Bitte neu laden.",
      );
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    try {
      const r = await send(
        editing ? "staff-subscription" : "staff-order",
        editing
          ? {
              id: editing.id,
              revision: editing.revision,
              items: draft.items,
              next_date: draft.date,
              interval: draft.interval,
              notes: draft.notes,
              active: draft.active,
            }
          : {
              request_id: requestId.current,
              customer_id: draft.customer_id,
              items: draft.items,
              delivery_date: draft.date,
              interval: draft.interval || null,
              notes: draft.notes,
            },
      );
      setOpen(false);
      setEditing(null);
      setDraft(blank());
      requestId.current = null;
      setMessage(
        editing
          ? "Lieferautomatik gespeichert. Bereits angelegte Bestellungen bleiben erhalten."
          : `Bestellung EL-${String(r.number).padStart(5, "0")} angelegt.${r.subscription_id ? " Die weiteren Lieferungen werden automatisch angelegt." : ""}`,
      );
      await refresh();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Speichern fehlgeschlagen. Bitte erneut versuchen.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function pause(s: Subscription) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    try {
      await send("staff-subscription", { ...s, active: false });
      setMessage(
        "Lieferautomatik pausiert. Bereits angelegte Bestellungen bleiben erhalten.",
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Pausieren fehlgeschlagen.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="staff-orders">
      <div className="panel staff-order-intro">
        <div>
          <span className="eyebrow">Für deine Kunden</span>
          <h2>Bestellungen & Lieferautomatik</h2>
          <p>
            Telefonisch, persönlich oder regelmäßig: Kunden auswählen und
            Lieferung erfassen.
          </p>
        </div>
        <button
          className="button primary"
          disabled={busy || open}
          onClick={() => start()}
        >
          <Plus size={18} /> Bestellung anlegen
        </button>
      </div>
      {(message || op.message) && (
        <p className="notice" role="status">
          {message || op.message}
        </p>
      )}
      {open && (
        <form className="panel staff-order-form" onSubmit={save}>
          <div className="panel-head">
            <h2>
              {editing ? "Lieferautomatik bearbeiten" : "Neue Kundenbestellung"}
            </h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Bestellerfassung schließen"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <fieldset disabled={busy}>
            <div className="staff-order-fields">
              <div>
                {!editing && (
                  <label>
                    Kunden suchen
                    <input
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                      placeholder="Name, Kundennummer, E-Mail oder Adresse"
                    />
                  </label>
                )}
                <label>
                  Kunde
                  <select
                    aria-label="Kunde"
                    required
                    disabled={!!editing}
                    value={draft.customer_id}
                    onChange={(e) =>
                      setDraft({ ...draft, customer_id: e.target.value })
                    }
                  >
                    <option value="">Kunden auswählen …</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · K-{String(c.number).padStart(5, "0")} ·{" "}
                        {c.email}
                      </option>
                    ))}
                  </select>
                </label>
                {customer && (
                  <div className="staff-order-address">
                    <strong>Lieferadresse</strong>
                    <p>
                      {customer.name}
                      <br />
                      {customer.address || "Lieferadresse fehlt"}
                      <br />
                      {customer.phone || "Telefon fehlt"}
                    </p>
                    {customer.dropoff_allowed && (
                      <small>
                        Abstellen erlaubt:{" "}
                        {customer.dropoff_note || "Keine weiteren Hinweise"}
                      </small>
                    )}
                  </div>
                )}
                {!op.data.customers.length && (
                  <p className="notice">
                    Noch keine Kunden vorhanden. Bitte zuerst unter „Kunden“
                    einen Kunden anlegen lassen.
                  </p>
                )}
              </div>
              <div>
                <label>
                  {editing ? "Nächster Liefertermin" : "Erster Liefertermin"}
                  <input
                    required
                    type="date"
                    min={draft.active ? earliestNewDelivery() : undefined}
                    value={draft.date}
                    onChange={(e) =>
                      setDraft({ ...draft, date: e.target.value })
                    }
                  />
                </label>
                <label>
                  Lieferintervall
                  <select
                    aria-label="Lieferintervall"
                    value={draft.interval}
                    required={!!editing}
                    onChange={(e) =>
                      setDraft({ ...draft, interval: e.target.value })
                    }
                  >
                    {!editing && <option value="">Einmalige Bestellung</option>}
                    {Object.entries(deliveryIntervals).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {editing && (
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      onChange={(e) =>
                        setDraft({ ...draft, active: e.target.checked })
                      }
                    />{" "}
                    Lieferautomatik aktiv
                  </label>
                )}
                <label>
                  Lieferhinweis
                  <textarea
                    maxLength={1000}
                    value={draft.notes}
                    onChange={(e) =>
                      setDraft({ ...draft, notes: e.target.value })
                    }
                    placeholder="Zum Beispiel: Bitte an der Seitentür klingeln"
                  />
                </label>
              </div>
            </div>
            <div className="staff-order-catalog">
              <label>
                <Search size={16} /> Artikel suchen
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Artikelname oder Barcode"
                />
              </label>
              <label>
                Artikel hinzufügen
                <select
                  aria-label="Artikel hinzufügen"
                  value=""
                  onChange={(e) => {
                    if (e.target.value)
                      setDraft({
                        ...draft,
                        items: [
                          ...draft.items,
                          { id: e.target.value, quantity: 1 },
                        ],
                      });
                    setProductQuery("");
                  }}
                >
                  <option value="">Artikel auswählen …</option>
                  {matching.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {pack(p)} · {euro(p.price_cents)}{" "}
                      {p.deposit_cents === null ? "· Pfand offen" : "+ Pfand"}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                {productQuery
                  ? `${matching.length} Treffer (maximal 30)`
                  : "Über die Suche findest du alle aktiven Artikel."}
              </small>
            </div>
            <div className="staff-order-lines">
              {chosen.map(({ line, product }) => (
                <div className="staff-order-line" key={line.id}>
                  {product && <ProductPhoto product={product} />}
                  <div>
                    <strong>{product?.name || line.id}</strong>
                    <small>
                      {product
                        ? `${pack(product)} · ${euro(product.price_cents)} inkl. ${product.tax_rate} % MwSt.`
                        : "Artikel nicht verfügbar"}
                    </small>
                    <small>
                      {product?.deposit_cents == null
                        ? "Pfand muss noch hinterlegt werden"
                        : `+ ${euro(product.deposit_cents)} Pfand je Einheit`}
                    </small>
                    {product && !product.active && (
                      <small>Artikel ist inaktiv</small>
                    )}
                  </div>
                  <label>
                    Menge
                    <input
                      aria-label={`Menge ${product?.name || line.id}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      step={1}
                      required
                      value={line.quantity || ""}
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
                  <strong>
                    {euro(
                      line.quantity *
                        ((product?.price_cents || 0) +
                          (product?.deposit_cents || 0)),
                    )}
                  </strong>
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
            </div>
            {!draft.items.length && (
              <p className="notice">
                Füge mindestens einen Artikel hinzu. Die Menge bezieht sich auf
                das angezeigte Gebinde.
              </p>
            )}
            <div className="staff-order-footer">
              <div>
                <small>Gesamt inkl. MwSt. und Pfand</small>
                <strong>{euro(sum.gross)}</strong>
                <small>
                  Enthaltenes Pfand {euro(sum.deposit)} · Netto {euro(sum.net)}{" "}
                  · MwSt. {euro(sum.tax)}
                </small>
                {!valid && (
                  <p className="notice">
                    Inaktive Artikel oder Artikel ohne Pfandangabe bitte zuerst
                    korrigieren.
                  </p>
                )}
              </div>
              <button
                className="button primary"
                disabled={
                  busy || !draft.customer_id || !draft.items.length || !valid
                }
              >
                {busy
                  ? "Wird gespeichert …"
                  : editing
                    ? "Lieferautomatik speichern"
                    : "Bestellung verbindlich anlegen"}
              </button>
            </div>
            <p className="staff-order-hint">
              {editing
                ? "Änderungen gelten für zukünftige automatisch erzeugte Bestellungen. Bestehende Bestellungen werden nicht geändert oder storniert."
                : "Die Bestellung wird direkt als bestätigt erfasst. Der Warenbestand wird erst mit der tatsächlichen Lieferung gebucht."}
              {draft.interval &&
                " Folgeaufträge entstehen am jeweiligen Fälligkeitstag mit den dann gültigen Artikelpreisen und Pfandbeträgen. Der erste Auftrag wird nur einmal angelegt."}{" "}
              Liefertermine fließen in die Tourenplanung ein; die konkrete
              Zustellung hängt von Liefertagen und Zeitfenstern ab.
            </p>
          </fieldset>
        </form>
      )}
      <details
        className="panel staff-subscriptions"
        open={op.data.subscriptions.some((s) => !!s.last_error)}
      >
        <summary>
          <Repeat2 size={18} /> Lieferautomatiken{" "}
          <span>{op.data.subscriptions.length}</span>
        </summary>
        <p>
          Regelmäßige Bestellungen verwalten. Pausieren stoppt zukünftige
          Aufträge; bereits erzeugte Bestellungen bleiben bestehen.
        </p>
        {!op.data.subscriptions.length && (
          <p>
            Noch keine Lieferautomatik hinterlegt. Wähle beim Anlegen einer
            Bestellung ein Lieferintervall.
          </p>
        )}
        {op.data.subscriptions.map((s) => (
          <article key={s.id} className="staff-subscription">
            <div>
              <strong>
                {op.data.customers.find((c) => c.id === s.customer_id)?.name ||
                  "Kunde"}
              </strong>
              <p>
                {deliveryIntervals[
                  s.interval as keyof typeof deliveryIntervals
                ] || s.interval}{" "}
                · Nächster Termin {dateLabel(s.next_date)} ·{" "}
                {s.active ? "Aktiv" : "Pausiert"}
              </p>
              <small>
                {s.items
                  .map(
                    (i) =>
                      `${i.quantity} × ${products.find((p) => p.id === i.id)?.name || i.id}`,
                  )
                  .join(" · ")}
              </small>
              {s.last_error && (
                <p className="notice" role="status">
                  Aktion erforderlich: {s.last_error}
                </p>
              )}
            </div>
            <div className="staff-subscription-actions">
              <button
                className="button secondary"
                disabled={busy || open}
                onClick={() => start(s)}
              >
                {s.active ? "Bearbeiten" : "Bearbeiten / Fortsetzen"}
              </button>
              {s.active && (
                <button
                  className="text-link"
                  disabled={busy || open}
                  onClick={() => pause(s)}
                >
                  Pausieren
                </button>
              )}
            </div>
          </article>
        ))}
      </details>
    </section>
  );
}
