"use client";
import { useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { pack } from "@/lib/money";
import { berlinToday } from "@/lib/staff-orders";
import type { Product, Supplier } from "@/lib/types";
export default function ManualPurchase({
  products,
  suppliers,
  reload,
}: {
  products: Product[];
  suppliers: Supplier[];
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [supplier, setSupplier] = useState(""),
    [query, setQuery] = useState(""),
    [date, setDate] = useState(""),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ id: string; quantity: number }[]>([]);
  const request = useRef<string | null>(null),
    submitting = useRef(false);
  const selectedSupplier = suppliers.find((s) => s.id === supplier);
  const eligible = (p: Product) =>
    p.active && (!p.supplier_id || p.supplier_id === supplier);
  const selected = items.map((i) => ({
    item: i,
    product: products.find((p) => p.id === i.id),
  }));
  const valid =
    !!selectedSupplier &&
    items.length > 0 &&
    selected.every(
      ({ product, item }) =>
        product &&
        eligible(product) &&
        Number.isInteger(item.quantity) &&
        item.quantity >= 1 &&
        item.quantity <= 100000,
    );
  const options = products
    .filter(
      (p) =>
        eligible(p) &&
        !items.some((i) => i.id === p.id) &&
        `${p.name} ${p.sku} ${p.barcode}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice(0, 40);
  function start() {
    request.current = crypto.randomUUID();
    setSupplier(suppliers.length === 1 ? suppliers[0].id : "");
    setItems([]);
    setDate("");
    setReference("");
    setNotes("");
    setQuery("");
    setMessage("");
    setOpen(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current || !valid) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "purchase-create",
          value: {
            request_id: request.current,
            supplier_id: supplier,
            items,
            requested_date: date || null,
            reference,
            notes,
          },
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setOpen(false);
      request.current = null;
      setMessage(
        `Zusatzbestellung ${result.id.slice(0, 8)} als Entwurf angelegt. Die Bestellautomatik bleibt unverändert. Der Lieferant wurde noch nicht benachrichtigt.`,
      );
      try {
        await reload();
      } catch {
        setMessage((m) => m + " Bitte die Übersicht neu laden.");
      }
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Bestellung konnte nicht angelegt werden.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="manual-purchase staff-orders">
      <div className="panel staff-order-intro">
        <div>
          <span className="eyebrow">Zusätzlicher Bedarf</span>
          <h2>Manuell beim Lieferanten bestellen</h2>
          <p>
            Für Kundenaufträge, Veranstaltungen oder zusätzlichen Vorrat –
            unabhängig vom regulären Bestelllauf.
          </p>
        </div>
        <button className="button" disabled={busy || open} onClick={start}>
          <Plus size={18} /> Zusatzbestellung anlegen
        </button>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {open && (
        <form className="panel staff-order-form" onSubmit={save}>
          <div className="panel-head">
            <h2>Neue Zusatzbestellung</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Zusatzbestellung schließen"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <fieldset disabled={busy}>
            <div className="staff-order-fields">
              <div>
                <label>
                  Lieferant
                  <select
                    aria-label="Lieferant"
                    value={supplier}
                    required
                    onChange={(e) => setSupplier(e.target.value)}
                  >
                    <option value="">Lieferanten auswählen …</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.number
                          ? ` · L-${String(s.number).padStart(4, "0")}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedSupplier && (
                  <p className="staff-order-address">
                    <strong>
                      {selectedSupplier.company || selectedSupplier.name}
                    </strong>
                    <br />
                    {selectedSupplier.email ||
                      "Bestell-E-Mail noch nicht hinterlegt"}
                    <br />
                    {selectedSupplier.phone}
                  </p>
                )}
                {!suppliers.length && (
                  <p className="notice">
                    Bitte zuerst einen Lieferanten im Bereich „Lieferanten“
                    anlegen lassen.
                  </p>
                )}
                <label>
                  Gewünschter Liefertermin (optional)
                  <input
                    type="date"
                    min={berlinToday()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </div>
              <div>
                <label>
                  Bezug / Kundenauftrag (optional)
                  <input
                    maxLength={200}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Zum Beispiel: 100 Kisten Cola für Kundenauftrag EL-…"
                  />
                </label>
                <label>
                  Hinweise an den Lieferanten
                  <textarea
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Besondere Lieferwünsche oder Rückfragen"
                  />
                </label>
              </div>
            </div>
            <div className="staff-order-catalog">
              <label>
                Artikel suchen
                <input
                  disabled={!supplier}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Artikelname, Artikelnummer oder Barcode"
                />
              </label>
              <label>
                Artikel hinzufügen
                <select
                  aria-label="Artikel zur Zusatzbestellung hinzufügen"
                  value=""
                  disabled={!supplier}
                  onChange={(e) => {
                    if (e.target.value)
                      setItems([...items, { id: e.target.value, quantity: 1 }]);
                    setQuery("");
                  }}
                >
                  <option value="">Artikel auswählen …</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {pack(p)} · {p.sku}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                Artikel dieses Lieferanten und Artikel ohne feste
                Lieferantenzuordnung. Die Zuordnung in den Stammdaten wird nicht
                verändert. Über die Suche findest du alle passenden Artikel.
              </small>
            </div>
            <div className="manual-purchase-lines">
              {selected.map(({ item, product }) => (
                <div className="manual-purchase-line" key={item.id}>
                  <div>
                    <strong>{product?.name || item.id}</strong>
                    <small>
                      {product
                        ? `${pack(product)} · ${product.sku}`
                        : "Artikel nicht verfügbar"}
                    </small>
                    {product && !eligible(product) && (
                      <small className="field-error">
                        Inaktiv oder einem anderen Lieferanten zugeordnet –
                        bitte entfernen.
                      </small>
                    )}
                  </div>
                  <label>
                    Menge (Gebinde)
                    <input
                      type="number"
                      inputMode="numeric"
                      required
                      min={1}
                      max={100000}
                      step={1}
                      value={item.quantity || ""}
                      aria-label={`Bestellmenge ${product?.name || item.id}`}
                      onChange={(e) =>
                        setItems(
                          items.map((i) =>
                            i.id === item.id
                              ? { ...i, quantity: Number(e.target.value) }
                              : i,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${product?.name || item.id} entfernen`}
                    onClick={() =>
                      setItems(items.filter((i) => i.id !== item.id))
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
            {!items.length && (
              <p className="notice">
                Bitte mindestens einen Artikel hinzufügen. Eine Menge von 100
                bestellt 100 der angegebenen Gebinde.
              </p>
            )}
            <div className="staff-order-footer">
              <div>
                <strong>
                  {items
                    .reduce(
                      (n, i) =>
                        n + (Number.isInteger(i.quantity) ? i.quantity : 0),
                      0,
                    )
                    .toLocaleString("de-DE")}{" "}
                  Gebinde
                </strong>
                <small>
                  {items.length} Positionen · Manuelle Zusatzbestellung
                </small>
              </div>
              <button className="button" disabled={!valid || busy}>
                {busy
                  ? "Wird gespeichert …"
                  : "Zusatzbestellung als Entwurf speichern"}
              </button>
            </div>
            <p className="staff-order-hint">
              Offene Zusatzbestellungen verringern den automatisch ermittelten
              Bedarf nicht. Mindestbestände, Zielbestände und Bestellzeiten
              bleiben unverändert. Erst ein bestätigter Wareneingang erhöht den
              tatsächlichen Lagerbestand. Nach dem Speichern kannst du die
              Bestellung ausdrücklich per E-Mail senden oder als telefonisch /
              extern bestellt markieren.
            </p>
          </fieldset>
        </form>
      )}
    </section>
  );
}
