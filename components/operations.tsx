"use client";
import { CommunicationHistory } from "./communication-history";
import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Users, Truck, FileText, Check, ArrowRight } from "lucide-react";
import type {
  Customer,
  Employee,
  Order,
  Delivery,
  Invoice,
  Subscription,
} from "@/lib/types";
import { DeliveryAddressFields } from "./delivery-address-fields";
import { formatDeliveryAddress } from "@/lib/delivery-address";
import { euro } from "@/lib/money";
export type OperationsData = {
  customers: Customer[];
  employees: Employee[];
  deliveries: Delivery[];
  invoices: Invoice[];
  subscriptions: Subscription[];
};
export function useOperations() {
  const [data, setData] = useState<OperationsData>({
    customers: [],
    employees: [],
    deliveries: [],
    invoices: [],
    subscriptions: [],
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/operations", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/operations", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      setMessage("Gespeichert.");
      return d;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { data, message, busy, load, act };
}
export const customerDefaults: Partial<Customer> = {
  name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  invoice_email: true,
  dropoff_allowed: false,
  dropoff_note: "",
  windows: [],
  latitude: null,
  longitude: null,
};
export function CustomerFields({
  value,
  onChange,
  internal = false,
}: {
  value: Partial<Customer>;
  onChange: (v: Partial<Customer>) => void;
  internal?: boolean;
}) {
  const text = (
    key: "name" | "email" | "phone" | "address" | "notes" | "dropoff_note",
    label: string,
    type = "text",
  ) => (
    <label>
      {label}
      <input
        type={type}
        readOnly={!internal && key === "email"}
        required={["name", "email", "phone", "address"].includes(key)}
        value={value[key] || ""}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <>
      {text("name", "Name / Firma")}
      {text("email", "E-Mail", "email")}
      {text("phone", "Telefon", "tel")}
      <DeliveryAddressFields
        value={value}
        onChange={(address) =>
          onChange({
            ...value,
            ...address,
            address: formatDeliveryAddress(address),
            latitude: null,
            longitude: null,
          })
        }
      />
      {internal && text("notes", "Interne Notizen")}
      {internal &&
        (["latitude", "longitude"] as const).map((key, i) => (
          <label key={key}>
            {i === 0 ? "Breitengrad (optional)" : "Längengrad (optional)"}
            <input
              type="number"
              step="any"
              value={value[key] ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  [key]: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
        ))}
      <label className="checkline">
        <input
          type="checkbox"
          checked={value.invoice_email ?? true}
          onChange={(e) =>
            onChange({ ...value, invoice_email: e.target.checked })
          }
        />
        Rechnungen automatisch per E-Mail erhalten
      </label>
      <label className="checkline">
        <input
          type="checkbox"
          checked={value.dropoff_allowed || false}
          onChange={(e) =>
            onChange({ ...value, dropoff_allowed: e.target.checked })
          }
        />
        Abstellung ohne persönliche Übergabe erlaubt
      </label>
      {value.dropoff_allowed && text("dropoff_note", "Erlaubter Abstellort")}
      <div className="span-two">
        <h3>Deine möglichen Lieferzeiten</h3>
        <p className="muted">
          Ohne Eintrag gelten die allgemeinen Lieferzeiten. Ohne
          Abstellgenehmigung planen wir nur innerhalb deiner angegebenen
          Zeitfenster.
        </p>
        {(value.windows || []).map((w, i) => (
          <div className="window-row" key={i}>
            <select
              aria-label="Wochentag"
              value={w.day}
              onChange={(e) =>
                onChange({
                  ...value,
                  windows: value.windows!.map((x, k) =>
                    k === i ? { ...x, day: Number(e.target.value) } : x,
                  ),
                })
              }
            >
              {[
                "Montag",
                "Dienstag",
                "Mittwoch",
                "Donnerstag",
                "Freitag",
                "Samstag",
                "Sonntag",
              ].map((d, k) => (
                <option value={k + 1} key={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              aria-label="Von"
              type="time"
              value={w.from}
              onChange={(e) =>
                onChange({
                  ...value,
                  windows: value.windows!.map((x, k) =>
                    k === i ? { ...x, from: e.target.value } : x,
                  ),
                })
              }
            />
            <input
              aria-label="Bis"
              type="time"
              value={w.to}
              onChange={(e) =>
                onChange({
                  ...value,
                  windows: value.windows!.map((x, k) =>
                    k === i ? { ...x, to: e.target.value } : x,
                  ),
                })
              }
            />
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                onChange({
                  ...value,
                  windows: value.windows!.filter((_, k) => k !== i),
                })
              }
            >
              Entfernen
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-link"
          onClick={() =>
            onChange({
              ...value,
              windows: [
                ...(value.windows || []),
                { day: 5, from: "14:00", to: "18:00" },
              ],
            })
          }
        >
          <Plus size={16} />
          Zeitfenster ergänzen
        </button>
      </div>
    </>
  );
}
export function DocumentsList({
  deliveries,
  invoices,
}: {
  deliveries: Delivery[];
  invoices: Invoice[];
}) {
  return (
    <div className="document-list">
      {deliveries.map((d) => (
        <a target="_blank" key={d.id} href={`/api/documents/delivery/${d.id}`}>
          <FileText size={18} />
          <span>
            Lieferschein LS-{String(d.number).padStart(6, "0")}
            <small>{d.status === "delivered" ? "Übergeben" : "Entwurf"}</small>
          </span>
          <ArrowRight size={16} />
        </a>
      ))}
      {invoices.map((i) => (
        <a target="_blank" key={i.id} href={`/api/documents/invoice/${i.id}`}>
          <FileText size={18} />
          <span>
            Rechnung RE-{String(i.number).padStart(6, "0")}
            <small>
              {euro(i.total_cents)} ·{" "}
              {i.status === "paid" ? "Bezahlt" : "Offen"}
            </small>
          </span>
          <ArrowRight size={16} />
        </a>
      ))}
    </div>
  );
}
export function CustomerManager({ orders }: { orders: Order[] }) {
  const op = useOperations();
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const [query, setQuery] = useState("");
  const [customerTab, setCustomerTab] = useState("profile");
  const c = op.data.customers.find((c) => c.id === selected);
  const own = orders.filter((o) => o.customer_id === selected);
  return (
    <>
      <div className="table-toolbar">
        <input
          placeholder="Kunden suchen"
          aria-label="Kunden suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="button"
          onClick={() => setEdit({ ...customerDefaults })}
        >
          <Plus size={17} />
          Kunde anlegen
        </button>
      </div>
      {op.message && (
        <p role="status" className="notice">
          {op.message}
        </p>
      )}
      <div className="customer-layout">
        <section className="panel customer-list">
          {op.data.customers
            .filter((c) =>
              `${c.name} ${c.email} ${c.number}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((c) => (
              <button
                key={c.id}
                className={selected === c.id ? "selected" : ""}
                onClick={() => {
                  setSelected(c.id);
                  setCustomerTab("profile");
                }}
              >
                <span className="avatar">
                  <Users size={20} />
                </span>
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    K-{String(c.number).padStart(5, "0")} · {c.email}
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          {!op.data.customers.length && <p>Noch keine Kunden angelegt.</p>}
        </section>
        <section className="panel">
          {c ? (
            <>
              <div className="panel-head">
                <div>
                  <span className="eyebrow">
                    KUNDENAKTE · K-{String(c.number).padStart(5, "0")}
                  </span>
                  <h2>{c.name}</h2>
                </div>
                <button className="button secondary" onClick={() => setEdit(c)}>
                  Bearbeiten
                </button>
              </div>
              <div className="category-tabs" aria-label="Kundenprofil">
                <button
                  className={customerTab === "profile" ? "selected" : ""}
                  onClick={() => setCustomerTab("profile")}
                >
                  Profil & Belege
                </button>
                <button
                  className={customerTab === "communication" ? "selected" : ""}
                  onClick={() => setCustomerTab("communication")}
                >
                  Kommunikation
                </button>
              </div>
              {customerTab === "communication" ? (
                <CommunicationHistory key={c.id} customerId={c.id} />
              ) : (
                <>
                  <p>
                    {c.address}
                    <br />
                    {c.phone} · {c.email}
                  </p>
                  <p>
                    {c.user_id ? "Kundenkonto verknüpft" : "Ohne Kundenlogin"} ·{" "}
                    {c.invoice_email
                      ? "Rechnungsversand per E-Mail"
                      : "Rechnungsversand deaktiviert"}
                  </p>
                  <div className="stats-grid">
                    <div className="stat">
                      <small>Bestellungen</small>
                      <strong>{own.length}</strong>
                    </div>
                    <div className="stat">
                      <small>Offen</small>
                      <strong>
                        {
                          own.filter(
                            (o) =>
                              !["completed", "cancelled"].includes(o.status),
                          ).length
                        }
                      </strong>
                    </div>
                    <div className="stat">
                      <small>Teillieferungen</small>
                      <strong>
                        {own.filter((o) => o.status === "partial").length}
                      </strong>
                    </div>
                  </div>
                  <h3>Bestellverlauf</h3>
                  {own.map((o) => (
                    <div className="ledger-row" key={o.id}>
                      <strong>EL-{o.number}</strong>
                      <span>
                        {o.status === "partial"
                          ? "Restlieferung offen"
                          : o.status === "completed"
                            ? "Abgeschlossen"
                            : o.status === "cancelled"
                              ? "Storniert"
                              : "Offen"}
                      </span>
                      <small>
                        {o.items
                          .map((i) => `${i.quantity} × ${i.name}`)
                          .join(", ")}
                      </small>
                    </div>
                  ))}
                  <h3>Dokumente</h3>
                  <DocumentsList
                    deliveries={op.data.deliveries.filter(
                      (d) => d.customer_id === c.id,
                    )}
                    invoices={op.data.invoices.filter(
                      (i) => i.customer_id === c.id,
                    )}
                  />
                  <h3>Lieferabos</h3>
                  {op.data.subscriptions
                    .filter((s) => s.customer_id === c.id)
                    .map((s) => (
                      <p key={s.id}>
                        {s.active ? "Aktiv" : "Pausiert"} · nächster Auftrag{" "}
                        {s.next_date} · {s.interval}
                      </p>
                    ))}
                  <button
                    className="button secondary"
                    disabled={op.busy || !!c.user_id}
                    onClick={() => op.act("customer-invite", { id: c.id })}
                  >
                    Kundenkonto per E-Mail einladen
                  </button>
                  <p className="fineprint">
                    Eine Einladung wird über den eingerichteten
                    Auth-E-Mail-Dienst versendet.
                  </p>
                </>
              )}
            </>
          ) : (
            <div className="empty">
              <Users size={40} />
              <h3>Deine Kunden im Überblick</h3>
              <p>
                Wähle einen Kunden für Bestellungen, offene Mengen und
                Dokumente.
              </p>
            </div>
          )}
        </section>
      </div>
      {edit && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Kundenstammdaten"
          >
            <div className="panel-head">
              <h2>Kundenstammdaten</h2>
              <button onClick={() => setEdit(null)}>Schließen</button>
            </div>
            <form
              className="form-grid two-columns"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await op.act("customer", { value: edit })) setEdit(null);
              }}
            >
              <CustomerFields value={edit} onChange={setEdit} internal />
              <button className="button span-two" disabled={op.busy}>
                Kunden speichern
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
function Signature({ onChange }: { onChange: (s: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  return (
    <div>
      <canvas
        ref={ref}
        width={700}
        height={220}
        className="signature"
        aria-label="Unterschrift hier zeichnen"
        onPointerDown={(e) => {
          const c = ref.current!;
          const b = c.getBoundingClientRect();
          const x = c.getContext("2d")!;
          drawing.current = true;
          dirty.current = false;
          c.setPointerCapture(e.pointerId);
          x.beginPath();
          x.moveTo(
            ((e.clientX - b.left) * 700) / b.width,
            ((e.clientY - b.top) * 220) / b.height,
          );
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const c = ref.current!;
          const b = c.getBoundingClientRect();
          const x = c.getContext("2d")!;
          x.lineWidth = 2;
          x.lineCap = "round";
          x.strokeStyle = "#233022";
          x.lineTo(
            ((e.clientX - b.left) * 700) / b.width,
            ((e.clientY - b.top) * 220) / b.height,
          );
          x.stroke();
          dirty.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (dirty.current) onChange(ref.current!.toDataURL("image/png"));
        }}
      />
      <button
        type="button"
        className="text-link"
        onClick={() => {
          ref.current!.getContext("2d")!.clearRect(0, 0, 700, 220);
          onChange(null);
        }}
      >
        Unterschrift löschen
      </button>
    </div>
  );
}
export function DeliveryManager({
  orders,
  reload,
}: {
  orders: Order[];
  reload: () => Promise<void>;
}) {
  const op = useOperations();
  const [date, setDate] = useState(
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
      new Date(),
    ),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [draftId, setDraftId] = useState("");
  const [revision, setRevision] = useState(0);
  const [planMessage, setPlanMessage] = useState("");
  const o = orders.find((o) => o.id === selected);
  const tour = orders
    .filter(
      (o) =>
        o.delivery_date === date &&
        !["cancelled", "completed"].includes(o.status),
    )
    .sort((a, b) => (a.route_position || 999) - (b.route_position || 999));
  const open = (order: Order) => {
    setSelected(order.id);
    const draft = op.data.deliveries.find(
      (d) => d.order_id === order.id && d.status === "draft",
    );
    setDraftId(draft?.id || crypto.randomUUID());
    setRevision(draft?.revision || 0);
    setQuantities(
      Object.fromEntries(
        order.items.map((i) => [
          i.id,
          draft
            ? draft.items.find((x) => x.id === i.id)?.quantity || 0
            : Math.max(0, i.quantity - (order.delivered?.[i.id] || 0)),
        ]),
      ),
    );
    setSignature(null);
    setRecipient("");
  };
  const save = async (finalize: boolean) => {
    if (!o) return;
    const d = await op.act("delivery", {
      value: {
        order_id: o.id,
        id: draftId,
        revision,
        items: o.items.map((i) => ({
          id: i.id,
          quantity: quantities[i.id] || 0,
        })),
        finalize,
        signature,
        signed_name: recipient,
      },
    });
    if (d) {
      setRevision(d.revision);
      await reload();
      if (finalize) setSelected(null);
    }
  };
  return (
    <>
      <div className="table-toolbar">
        <label>
          Liefertag{" "}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={op.busy}
          onClick={async () => {
            const p = await op.act("plan", { date });
            if (p) {
              setPlanMessage(
                `${p.stops.length} Stopps geplant. ${p.unplanned.length} Aufträge ohne passendes Zeitfenster bleiben offen.`,
              );
              await reload();
            }
          }}
        >
          <Truck size={18} />
          Tagestour planen
        </button>
        <button className="button secondary" onClick={() => window.print()}>
          Lieferliste drucken
        </button>
      </div>
      {(op.message || planMessage) && (
        <p className="notice" role="status">
          {planMessage || op.message}
        </p>
      )}
      <div className="delivery-columns">
        <section>
          <h2>Deine Tour · {tour.length} Stopps</h2>
          {tour.map((order, i) => (
            <article className="panel route-stop" key={order.id}>
              <span className="stop-number">{i + 1}</span>
              <div>
                <span className="eyebrow">
                  CA. {order.eta_start}–{order.eta_end} UHR
                </span>
                <h3>{order.customer_name}</h3>
                <p>{order.address}</p>
                <p>
                  {order.preference_snapshot?.dropoff_allowed
                    ? `Abstellen erlaubt: ${order.preference_snapshot.dropoff_note || "siehe Kundenhinweis"}`
                    : "Persönliche Übergabe erforderlich"}
                </p>
                <div className="inline-actions">
                  <a
                    target="_blank"
                    className="text-link"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.address)}`}
                  >
                    Google Maps
                  </a>
                  <a
                    target="_blank"
                    className="text-link"
                    href={`https://maps.apple.com/?daddr=${encodeURIComponent(order.address)}`}
                  >
                    Apple Karten
                  </a>
                  <button className="button" onClick={() => open(order)}>
                    Lieferschein öffnen
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!tour.length && (
            <p className="panel">Für diesen Tag ist noch keine Tour geplant.</p>
          )}
          <p className="fineprint">
            Zeitfenster haben Vorrang. Fahrzeiten sind Schätzungen aus
            Entfernung und Puffer, ohne Echtzeitverkehr. Ohne hinterlegte
            Koordinaten wird je Strecke ein 20-Minuten-Puffer verwendet.
          </p>
        </section>
        <aside className="panel">
          <h2>Beladung</h2>
          <p>
            Letzter Stopp zuerst ins Fahrzeug. Erster Stopp zuletzt und gut
            erreichbar.
          </p>
          {[...tour].reverse().map((order, i) => (
            <div className="load-row" key={order.id}>
              <strong>
                {i + 1}. Einladen · {order.customer_name}
              </strong>
              <small>
                {order.items
                  .filter((x) => x.quantity > (order.delivered?.[x.id] || 0))
                  .map(
                    (x) =>
                      `${x.quantity - (order.delivered?.[x.id] || 0)} × ${x.name}`,
                  )
                  .join(" · ")}
              </small>
            </div>
          ))}
          <h3>Noch einzuplanen</h3>
          {orders
            .filter(
              (o) =>
                ["confirmed", "partial"].includes(o.status) && !o.delivery_date,
            )
            .map((order) => (
              <div key={order.id} className="load-row">
                <strong>{order.customer_name}</strong>
                <span>
                  {order.status === "partial"
                    ? "Restlieferung offen"
                    : "Bereit zur Planung"}
                </span>
                <button className="text-link" onClick={() => open(order)}>
                  Lieferschein vorbereiten
                </button>
              </div>
            ))}
        </aside>
      </div>
      {o && (
        <div className="modal-backdrop">
          <section
            className="modal delivery-editor"
            role="dialog"
            aria-modal="true"
            aria-label="Lieferschein"
          >
            <div className="panel-head">
              <div>
                <span className="eyebrow">EL-{o.number}</span>
                <h2>Lieferschein · {o.customer_name}</h2>
              </div>
              <button onClick={() => setSelected(null)}>Schließen</button>
            </div>
            <p>
              Trage die tatsächlich mitgebrachten Mengen ein. Fehlmengen bleiben
              für die nächste Lieferung offen.
            </p>
            {o.items.map((i) => (
              <div className="delivery-item" key={i.id}>
                <div>
                  <strong>{i.name}</strong>
                  <small>
                    Bestellt {i.quantity} · bisher geliefert{" "}
                    {o.delivered?.[i.id] || 0} · danach offen{" "}
                    {Math.max(
                      0,
                      i.quantity -
                        (o.delivered?.[i.id] || 0) -
                        (quantities[i.id] || 0),
                    )}
                  </small>
                </div>
                <input
                  aria-label={`Liefermenge ${i.name}`}
                  type="number"
                  min="0"
                  max={i.quantity - (o.delivered?.[i.id] || 0)}
                  value={quantities[i.id] || 0}
                  onChange={(e) =>
                    setQuantities({
                      ...quantities,
                      [i.id]: Math.max(0, Math.floor(Number(e.target.value))),
                    })
                  }
                />
              </div>
            ))}
            <button
              className="button secondary"
              disabled={op.busy}
              onClick={() => save(false)}
            >
              Entwurf speichern
            </button>
            <h3>Übergabe bestätigen</h3>
            <label>
              Name des Empfängers / Abstellvermerk
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </label>
            {o.preference_snapshot?.dropoff_allowed && (
              <p className="notice">
                Abstellgenehmigung:{" "}
                {o.preference_snapshot.dropoff_note ||
                  "Im Kundenprofil freigegeben"}
              </p>
            )}
            <Signature onChange={setSignature} />
            <button
              className="button full"
              disabled={
                op.busy ||
                !recipient ||
                (!signature && !o.preference_snapshot?.dropoff_allowed)
              }
              onClick={() => save(true)}
            >
              <Check size={18} />
              Ware übergeben & Belege erstellen
            </button>
            <p className="fineprint">
              Die bestätigte Übergabe wird dokumentiert. Lieferschein und
              Rechnung werden dem Kunden und den Finanzen zugeordnet; der
              Versand erfolgt über den E-Mail-Ausgang.
            </p>
            {op.message && (
              <p role="status" className="notice">
                {op.message}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
export function InvoiceLedger({ readOnly = false }: { readOnly?: boolean }) {
  const op = useOperations();
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Lieferrechnungen</h2>
        <FileText />
      </div>
      {op.message && <p role="status">{op.message}</p>}
      <DocumentsList deliveries={[]} invoices={op.data.invoices} />
      {op.data.invoices
        .filter((i) => i.status === "open")
        .map((i) => (
          <div className="ledger-row" key={i.id}>
            <span>
              RE-{i.number} · Netto {euro(i.net_cents)} · USt.{" "}
              {euro(i.tax_cents)}
            </span>
            {!readOnly && (
              <button
                className="button secondary"
                disabled={op.busy}
                onClick={() => op.act("invoice-paid", { id: i.id })}
              >
                Zahlungseingang buchen
              </button>
            )}
          </div>
        ))}
      {!op.data.invoices.length && (
        <p>Noch keine Lieferrechnungen vorhanden.</p>
      )}
      <p className="fineprint">
        Lieferrechnungen werden separat vom Kassenumsatz geführt, damit keine
        Umsätze doppelt gezählt werden.
      </p>
    </section>
  );
}
