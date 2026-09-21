"use client";
import DeliveryTourPreview from "./delivery-tour-preview";
import {
  earliestNewDelivery,
  earliestOrderDelivery,
} from "@/lib/delivery-date";
import DeliveryDepositDialog from "./delivery-deposit-dialog";
import {
  deliveryAmount,
  deliveryReturnValue,
  returnAmount,
} from "@/lib/delivery-totals";
import { useDialog } from "./use-dialog";
import InvoiceStatus from "./invoice-status";
import { paymentLabels } from "@/lib/billing";
import { berlinDate } from "@/lib/finance-report";
import SubscriptionManager from "./subscription-manager";
import OrderHistory from "./order-history";
import NumberInput from "./number-input";
import { CommunicationHistory } from "./communication-history";
import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Users, Truck, FileText, Check, ArrowRight } from "lucide-react";
import type {
  Customer,
  Product,
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
  can_manage_payments?: boolean;
  customers: Customer[];
  employees: Employee[];
  deliveries: Delivery[];
  invoices: Invoice[];
  subscriptions: Subscription[];
};
export function useOperations() {
  const actionLock = useRef(false);
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
    if (actionLock.current) return null;
    actionLock.current = true;
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
      setMessage(d.message || "Gespeichert.");
      return d;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
      return null;
    } finally {
      actionLock.current = false;
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
  payment_method: "cash",
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
      {internal ? (
        <label>
          Zahlungsart bei Lieferung
          <select
            aria-label="Zahlungsart bei Lieferung"
            value={value.payment_method || "invoice"}
            onChange={(e) =>
              onChange({
                ...value,
                payment_method: e.target.value as Customer["payment_method"],
              })
            }
          >
            <option value="cash">Bar – Fahrer kassiert</option>
            <option value="card">EC-Karte – Fahrer kassiert</option>
            <option value="invoice">Rechnung – Zahlung nach Lieferung</option>
          </select>
        </label>
      ) : (
        <p className="notice span-two">
          Zahlungsart: {paymentLabels[value.payment_method || "invoice"]}.
          Änderungen bitte mit Getränke Elias abstimmen.
        </p>
      )}
      {internal && text("notes", "Interne Notizen")}
      {internal &&
        (["latitude", "longitude"] as const).map((key, i) => (
          <label key={key}>
            {i === 0 ? "Breitengrad (optional)" : "Längengrad (optional)"}
            <NumberInput
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
      <p className="fineprint span-two">
        Lieferschein und Rechnung werden nach der bestätigten Auslieferung
        automatisch im Portal hinterlegt und per E-Mail bereitgestellt.
      </p>
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
  const entries = [
    ...deliveries.map((d) => ({
      id: d.id,
      kind: "delivery",
      label: "Lieferschein",
      prefix: "LS",
      number: d.number,
      date: d.delivered_at || d.created_at,
      status: d.status === "delivered" ? "Übergeben" : "Entwurf",
      amount: deliveryAmount(d),
    })),
    ...invoices.map((i) => ({
      id: i.id,
      kind: "invoice",
      label: "Rechnung",
      prefix: "RE",
      number: i.number,
      date: i.created_at,
      status:
        i.status === "paid"
          ? "Bezahlt"
          : i.status === "cancelled"
            ? "Storniert"
            : "Offen",
      amount: i.total_cents,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="portal-documents">
      {entries.map((d) => (
        <article className="portal-document" key={d.kind + d.id}>
          <span className="portal-icon">
            <FileText size={24} />
          </span>
          <div>
            <strong>
              {d.label} {d.prefix}-{String(d.number).padStart(6, "0")}
            </strong>
            <small>
              {new Date(d.date).toLocaleDateString("de-DE", {
                timeZone: "Europe/Berlin",
              })}{" "}
              · {d.status}
            </small>
            {d.kind === "invoice" && (
              <InvoiceStatus invoice={invoices.find((i) => i.id === d.id)!} />
            )}
            {d.amount !== null && <b>{euro(d.amount)}</b>}
          </div>
          <button
            className="button secondary"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("elias:pdf-preview", {
                  detail: `/api/documents/${d.kind}/${d.id}`,
                }),
              )
            }
          >
            PDF anzeigen
          </button>
        </article>
      ))}
      {!entries.length && (
        <div className="portal-empty">
          <FileText size={32} />
          <h3>Noch keine Dokumente</h3>
          <p>
            Nach der bestätigten Auslieferung erscheinen hier die zugehörigen
            Belege.
          </p>
        </div>
      )}
    </div>
  );
}

export function CustomerManager({
  orders,
  products,
}: {
  orders: Order[];
  products: Product[];
}) {
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
                  <small>
                    {c.online_account?.user_id
                      ? c.online_account.confirmed
                        ? "Online-Account aktiv"
                        : "Bestätigung ausstehend"
                      : "Kein Online-Account"}
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
              <nav className="portal-nav compact" aria-label="Kundenprofil">
                {[
                  ["profile", "Profil"],
                  ["subscriptions", "Lieferabos"],
                  ["orders", "Bestellverlauf"],
                  ["deliveries", "Lieferscheine"],
                  ["invoices", "Rechnungen"],
                  ["communication", "Kommunikation"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={customerTab === id ? "selected" : ""}
                    aria-current={customerTab === id ? "page" : undefined}
                    onClick={() => setCustomerTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {customerTab === "communication" && (
                <CommunicationHistory key={c.id} customerId={c.id} />
              )}
              {customerTab === "subscriptions" && (
                <SubscriptionManager
                  key={c.id}
                  staff
                  customer={c}
                  subscriptions={op.data.subscriptions.filter(
                    (s) => s.customer_id === c.id,
                  )}
                  products={products}
                  onChanged={op.load}
                />
              )}
              {customerTab === "orders" && <OrderHistory orders={own} />}
              {customerTab === "deliveries" && (
                <DocumentsList
                  deliveries={op.data.deliveries.filter(
                    (d) => d.customer_id === c.id,
                  )}
                  invoices={[]}
                />
              )}
              {customerTab === "invoices" && (
                <DocumentsList
                  deliveries={[]}
                  invoices={op.data.invoices.filter(
                    (i) => i.customer_id === c.id,
                  )}
                />
              )}
              {customerTab === "profile" && (
                <>
                  <p>
                    {c.address}
                    <br />
                    {c.phone} · {c.email}
                  </p>
                  <section
                    className="customer-access-card"
                    aria-label="Online-Zugang"
                  >
                    <h3>Online-Zugang</h3>
                    <span
                      className={`invoice-status ${c.online_account?.confirmed ? "paid" : "open"}`}
                    >
                      {c.online_account?.user_id
                        ? c.online_account.confirmed
                          ? "Online-Account aktiv"
                          : "Bestätigung ausstehend"
                        : "Kein Online-Account"}
                    </span>
                    <dl>
                      <div>
                        <dt>Benutzer / E-Mail</dt>
                        <dd>{c.online_account?.email || c.email}</dd>
                      </div>
                      <div>
                        <dt>Passwort</dt>
                        <dd>
                          {c.online_account?.has_password
                            ? "•••••••• · hinterlegt"
                            : "Noch nicht festgelegt"}
                        </dd>
                      </div>
                      <div>
                        <dt>Zahlungsart</dt>
                        <dd>{paymentLabels[c.payment_method || "invoice"]}</dd>
                      </div>
                    </dl>
                    <p className="fineprint">
                      Passwörter sind nicht auslesbar. Der Kunde bestätigt seine
                      E-Mail-Adresse und vergibt sein Passwort über einen
                      persönlichen Link. Rechnung und Lieferschein gehen
                      automatisch in den E-Mail-Ausgang.
                    </p>
                    <button
                      className="button secondary"
                      disabled={op.busy}
                      onClick={() => op.act("customer-access", { id: c.id })}
                    >
                      {c.online_account?.user_id
                        ? c.online_account.confirmed
                          ? "Neuen Zugangslink senden"
                          : "Zugang / Bestätigung erneut senden"
                        : "Online-Zugang einladen"}
                    </button>
                  </section>
                  <div className="stats-grid customer-stats">
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
  const [date, setDate] = useState(earliestNewDelivery);
  const [selected, setSelected] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureVersion, setSignatureVersion] = useState(0);
  const [depositReturns, setDepositReturns] = useState<Record<string, number>>(
    {},
  );
  const [depositOpen, setDepositOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [expectedPayment, setExpectedPayment] = useState<
    "cash" | "card" | "invoice"
  >("invoice");
  const [deliveryPayment, setDeliveryPayment] = useState<
    "cash" | "card" | "invoice"
  >("invoice");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [revision, setRevision] = useState(0);
  const [planMessage, setPlanMessage] = useState("");
  const [completed, setCompleted] = useState<Delivery | null>(null);
  const [deliveryNote, setDeliveryNote] = useState("");
  const deliveryLock = useRef(false);
  const pendingDelivery = useRef<Record<string, unknown> | null>(null);
  const [deliveryPending, setDeliveryPending] = useState(false);
  const o = orders.find((o) => o.id === selected);
  const deliveryGross =
    o?.items.reduce(
      (sum, i) =>
        sum +
        (quantities[i.id] || 0) * (i.price_cents + (i.deposit_cents || 0)),
      0,
    ) || 0;
  const deliveryDue = deliveryGross - returnAmount(depositReturns);
  const tour = orders
    .filter(
      (o) =>
        o.delivery_date === date &&
        ["confirmed", "partial", "delivering"].includes(o.status),
    )
    .sort((a, b) => (a.route_position || 999) - (b.route_position || 999));
  const open = (order: Order) => {
    setCompleted(null);
    setDeliveryNote("");
    pendingDelivery.current = null;
    setDeliveryPending(false);
    setSelected(order.id);
    const method = order.approved_payment_method || "cash";
    setExpectedPayment(method);
    setDeliveryPayment(method);
    setPaymentConfirmed(false);
    const draft = op.data.deliveries.find(
      (d) => d.order_id === order.id && d.status === "draft",
    );
    setDepositReturns(deliveryReturnValue(draft));
    setDepositOpen(false);
    setDeliveryPayment(
      draft?.payment_method === "invoice" && method !== "invoice"
        ? method
        : draft?.payment_method || method,
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
    setSignatureVersion((v) => v + 1);
    setRecipient("");
  };
  const changeQuantity = (id: string, value: number, maximum: number) => {
    setPaymentConfirmed(false);
    setSignature(null);
    setSignatureVersion((v) => v + 1);
    setQuantities((q) => ({
      ...q,
      [id]: Math.min(
        maximum,
        Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)),
      ),
    }));
  };
  const hasDeliveryItems = Object.values(quantities).some(
    (quantity) => quantity > 0,
  );
  const save = async (
    finalize: boolean,
    returnOverride?: Record<string, number>,
  ) => {
    if (!o || deliveryLock.current) return false;
    deliveryLock.current = true;
    const value = pendingDelivery.current || {
      order_id: o.id,
      id: draftId,
      revision,
      items: o.items.map((i) => ({
        id: i.id,
        quantity: quantities[i.id] || 0,
      })),
      returns: Object.entries(returnOverride || depositReturns)
        .filter(([, quantity]) => quantity > 0)
        .map(([cents, quantity]) => ({
          deposit_cents: Number(cents),
          quantity,
        })),
      finalize,
      signature: returnOverride ? null : signature,
      signed_name: recipient,
      expected_payment_method: expectedPayment,
      payment_method: deliveryPayment,
      payment_confirmed: returnOverride ? false : paymentConfirmed,
    };
    pendingDelivery.current = value;
    setDeliveryPending(true);
    try {
      const r = await fetch("/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delivery", value }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status < 500) {
          pendingDelivery.current = null;
          setDeliveryPending(false);
        }
        throw Error(d.error);
      }
      pendingDelivery.current = null;
      setDeliveryPending(false);
      setRevision(d.revision);
      setDepositReturns(deliveryReturnValue(d));
      if (!value.finalize) {
        setPaymentConfirmed(false);
        setSignature(null);
        setSignatureVersion((v) => v + 1);
      }
      if (value.finalize) {
        setCompleted(d);
        setSelected(null);
        setDeliveryNote(
          d.archive_pending
            ? "Übergabe gebucht. Die PDF-Aufbereitung wird beim Abruf bzw. Versand erneut versucht."
            : "Übergabe gespeichert. Lieferschein und Rechnung sind angelegt und im Kundenportal sowie in den Finanzen verfügbar. E-Mails stehen im Versandausgang; dies ist noch keine Zustellbestätigung.",
        );
      } else
        setDeliveryNote(
          "Entwurf gespeichert. Noch keine Rechnung oder Lagerbuchung.",
        );
      try {
        await Promise.all([reload(), op.load()]);
      } catch {
        setDeliveryNote(
          "Lieferung gespeichert. Bitte die Ansicht aktualisieren.",
        );
      }
      return true;
    } catch (e) {
      setDeliveryNote(
        e instanceof Error
          ? e.message
          : "Verbindung unterbrochen. Bitte denselben Vorgang erneut prüfen.",
      );
      return false;
    } finally {
      deliveryLock.current = false;
    }
  };

  return (
    <>
      <div className="table-toolbar">
        <button
          className="button secondary"
          onClick={() => {
            setPlanMessage("");
            setDate(berlinDate(new Date().toISOString()));
          }}
        >
          Heute
        </button>
        <button
          className="button secondary"
          onClick={() => {
            setPlanMessage("");
            setDate(earliestNewDelivery());
          }}
        >
          Morgen
        </button>
        <label>
          Liefertag auswählen{" "}
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setPlanMessage("");
              setDate(e.target.value);
            }}
          />
        </label>
        <button
          className="button"
          disabled={
            op.busy || !date || date < berlinDate(new Date().toISOString())
          }
          onClick={async () => {
            setPlanMessage("");
            const p = await op.act("plan", { date });
            if (p) {
              setPlanMessage(
                `${p.stops.length} Stopps geplant. ${p.unplanned.length} Aufträge bleiben für einen späteren passenden Liefertermin offen.`,
              );
              await reload();
            }
          }}
        >
          <Truck size={18} />
          Tagestour planen
        </button>
        <button
          className="button"
          disabled={
            op.busy ||
            date !== berlinDate(new Date().toISOString()) ||
            !tour.some(
              (o) =>
                ["confirmed", "partial"].includes(o.status) &&
                o.approved_payment_method,
            )
          }
          onClick={async () => {
            const result = await op.act("start-tour", { date });
            if (result) {
              setPlanMessage(
                `${result.started} Bestellungen sind jetzt in Lieferung.${result.payment_pending ? ` ${result.payment_pending} ${result.payment_pending === 1 ? "Auftrag wartet" : "Aufträge warten"} auf Zahlungsfreigabe.` : ""}`,
              );
              await reload();
            }
          }}
        >
          Tour starten
        </button>
        <button
          className="button secondary"
          disabled={!date}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("elias:pdf-preview", {
                detail: `/api/delivery-list?date=${date}`,
              }),
            )
          }
        >
          Lieferliste drucken
        </button>
      </div>
      <p className="notice">
        Neue Bestellungen liefern wir frühestens am Folgetag. Liefertage und
        Kundenzeitfenster werden berücksichtigt; heutige Touren beginnen
        frühestens ab der aktuellen Uhrzeit.
      </p>
      {date && date > berlinDate(new Date().toISOString()) && (
        <DeliveryTourPreview date={date} orders={orders} />
      )}
      {(op.message || planMessage) && (
        <p className="notice" role="status">
          {planMessage || op.message}
        </p>
      )}
      {deliveryNote && (
        <p className="notice" role="status">
          {deliveryNote}
        </p>
      )}
      {completed && (
        <section className="panel delivery-success">
          <h2>Lieferung bestätigt</h2>
          <p>
            Die tatsächlich gelieferten Mengen wurden einmalig gebucht. Die
            unterschriebene Empfangsbestätigung ist im Lieferschein enthalten.
          </p>
          <DocumentsList
            deliveries={[completed]}
            invoices={op.data.invoices.filter(
              (i) => i.delivery_id === completed.id,
            )}
          />
        </section>
      )}
      <div className="delivery-columns">
        <section>
          <h2>Deine Tour · {tour.length} Stopps</h2>
          {tour.map((order, i) => {
            const draft = op.data.deliveries.find(
              (d) => d.order_id === order.id && d.status === "draft",
            );
            const paymentMethod =
              draft?.payment_method || order.approved_payment_method;
            return (
              <article className="panel route-stop" key={order.id}>
                <span className="stop-number">{i + 1}</span>
                <div>
                  <span className="eyebrow">
                    CA. {order.eta_start}–{order.eta_end} UHR
                  </span>
                  <h3>{order.customer_name}</h3>
                  <span
                    className={`badge ${order.status === "delivering" ? "green" : ""}`}
                  >
                    {order.status === "delivering"
                      ? "In Lieferung"
                      : !order.approved_payment_method
                        ? "Zahlungsfreigabe fehlt"
                        : "Bereit zur Auslieferung"}
                  </span>
                  <p>{order.address}</p>
                  <p className="delivery-payment-hint">
                    {op.data.deliveries.some(
                      (d) => d.order_id === order.id && d.status === "draft",
                    ) ? (
                      <>
                        Zahlbetrag nach Pfandrücknahme:{" "}
                        {euro(
                          deliveryAmount(
                            op.data.deliveries.find(
                              (d) =>
                                d.order_id === order.id && d.status === "draft",
                            )!,
                          ),
                        )}{" "}
                        · Entwurf
                      </>
                    ) : (
                      <>
                        Geplanter Betrag inkl. Pfand:{" "}
                        {euro(
                          order.items.reduce(
                            (sum, i) =>
                              sum +
                              Math.max(
                                0,
                                i.quantity - (order.delivered?.[i.id] || 0),
                              ) *
                                (i.price_cents + (i.deposit_cents || 0)),
                            0,
                          ),
                        )}
                      </>
                    )}
                  </p>
                  <p className="delivery-payment-hint">
                    {paymentMethod
                      ? paymentLabels[paymentMethod]
                      : "Zahlungsart noch nicht freigegeben"}
                    {paymentMethod
                      ? paymentMethod === "invoice"
                        ? " · Nicht vor Ort kassieren"
                        : " · Vor Ort kassieren"
                      : ""}
                  </p>
                  <p>
                    Persönliche Übergabe mit Kundenunterschrift erforderlich
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
            );
          })}
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
                    : `Frühestens ${earliestOrderDelivery(order)?.split("-").reverse().join(".") || "nach Prüfung des Bestelleingangs"}`}
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
              <button
                disabled={deliveryPending}
                onClick={() => setSelected(null)}
              >
                Schließen
              </button>
            </div>
            <fieldset disabled={deliveryPending} className="delivery-fields">
              <p>
                Trage die tatsächlich mitgebrachten Mengen ein. Fehlmengen
                bleiben für die nächste Lieferung offen.
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
                  <div className="delivery-quantity-actions">
                    <label>
                      Diese Lieferung
                      <NumberInput
                        aria-label={`Liefermenge ${i.name}`}
                        min="0"
                        max={Math.max(
                          0,
                          i.quantity - (o.delivered?.[i.id] || 0),
                        )}
                        step="1"
                        value={quantities[i.id] || 0}
                        onChange={(e) =>
                          changeQuantity(
                            i.id,
                            Number(e.target.value),
                            Math.max(
                              0,
                              i.quantity - (o.delivered?.[i.id] || 0),
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={!quantities[i.id]}
                      onClick={() =>
                        changeQuantity(
                          i.id,
                          0,
                          Math.max(0, i.quantity - (o.delivered?.[i.id] || 0)),
                        )
                      }
                    >
                      Nicht dabei
                    </button>
                  </div>
                </div>
              ))}
              <button
                className="button secondary"
                disabled={
                  op.busy || !hasDeliveryItems || !o.approved_payment_method
                }
                onClick={() => save(false)}
              >
                Entwurf speichern
              </button>
              <section className="delivery-payment-box">
                <h3>Zahlung bei Übergabe</h3>
                <p>Ware inklusive Lieferpfand: {euro(deliveryGross)}</p>
                <p>Pfandrücknahme: −{euro(returnAmount(depositReturns))}</p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setDepositOpen(true)}
                >
                  Pfand erfassen
                </button>
                <strong aria-live="polite">
                  {deliveryDue < 0
                    ? "An Kunden auszahlen"
                    : "Zahlbetrag nach Pfandrücknahme"}
                  : {euro(Math.abs(deliveryDue))}
                </strong>
                <p>
                  Für diesen Auftrag freigegeben:{" "}
                  {paymentLabels[expectedPayment]}. Bar oder EC ist auch bei
                  Rechnungskunden möglich.
                </p>
                <label>
                  Zahlungsart vor Ort
                  <select
                    aria-label="Zahlungsart vor Ort"
                    value={deliveryPayment}
                    onChange={(e) => {
                      setDeliveryPayment(
                        e.target.value as typeof deliveryPayment,
                      );
                      setPaymentConfirmed(false);
                      setSignature(null);
                      setSignatureVersion((v) => v + 1);
                    }}
                  >
                    <option value="cash">Kunde bezahlt bar</option>
                    <option value="card">Kunde bezahlt mit EC-Karte</option>
                    {expectedPayment === "invoice" && (
                      <option value="invoice">
                        Auf Rechnung (freigegeben)
                      </option>
                    )}
                  </select>
                </label>
                {deliveryDue < 0 && deliveryPayment === "invoice" ? (
                  <p className="notice">
                    Pfandguthaben bitte bar oder per EC auszahlen. Zahlungsart
                    ändern und Auszahlung bestätigen.
                  </p>
                ) : deliveryDue === 0 ? (
                  <p>Vollständig mit Pfand verrechnet. Keine Zahlung nötig.</p>
                ) : deliveryPayment === "invoice" ? (
                  <p>
                    Die Rechnung über den verbleibenden Betrag wird mit
                    Zahlungsziel erstellt.
                  </p>
                ) : (
                  <label className="checkline">
                    <input
                      type="checkbox"
                      checked={paymentConfirmed}
                      onChange={(e) => setPaymentConfirmed(e.target.checked)}
                    />
                    {deliveryDue < 0
                      ? deliveryPayment === "cash"
                        ? "Pfandguthaben bar ausgezahlt"
                        : "EC-Erstattung am separaten Gerät erfolgreich"
                      : deliveryPayment === "cash"
                        ? "Vollständigen Barbetrag erhalten"
                        : "EC-Zahlung am separaten Gerät erfolgreich"}
                  </label>
                )}
              </section>
              {!o.approved_payment_method && (
                <p className="notice">
                  Bitte zuerst die Zahlungsart unter Bestellungen freigeben.
                </p>
              )}
              {!hasDeliveryItems && (
                <p className="notice">
                  Keine Ware dabei: Es wird kein Lieferschein und keine Rechnung
                  gebucht. Der Auftrag bleibt offen.
                </p>
              )}
              <h3>Übergabe bestätigen</h3>
              <label>
                Name des Empfängers
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </label>
              <p className="fineprint">
                Der Kunde bestätigt den Empfang immer mit seiner Unterschrift –
                unabhängig von Zahlungsart und Abstellgenehmigung.
              </p>
              <Signature key={signatureVersion} onChange={setSignature} />
              <button
                className="button full"
                disabled={
                  op.busy ||
                  !hasDeliveryItems ||
                  !o.approved_payment_method ||
                  !recipient ||
                  (deliveryPayment !== "invoice" &&
                    deliveryDue !== 0 &&
                    !paymentConfirmed) ||
                  (deliveryDue < 0 && deliveryPayment === "invoice") ||
                  !signature
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
            </fieldset>
            {deliveryNote && (
              <p role="status" className="notice">
                {deliveryNote}
              </p>
            )}
            {deliveryPending && (
              <div className="notice">
                <p>
                  Vorgang läuft oder die Antwort ist unklar. Bei
                  Verbindungsabbruch dieselbe Übergabe erneut prüfen; keine
                  zweite Lieferung anlegen.
                </p>
                <button className="button" onClick={() => save(true)}>
                  Übergabe erneut prüfen
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {depositOpen && (
        <DeliveryDepositDialog
          value={depositReturns}
          save={(value) => save(false, value)}
          close={() => setDepositOpen(false)}
        />
      )}
    </>
  );
}
export function InvoiceLedger({ readOnly = false }: { readOnly?: boolean }) {
  const op = useOperations();
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [method, setMethod] = useState<"bank" | "cash" | "card">("bank");
  const [paidOn, setPaidOn] = useState(berlinDate(new Date().toISOString()));
  const [confirmed, setConfirmed] = useState(false);
  useDialog(!!selected, () => {
    if (!op.busy) setSelected(null);
  });
  const open = op.data.invoices.filter((i) => i.status === "open");
  const dateLabel = (date: string) =>
    new Date(
      date.length === 10 ? date + "T12:00:00Z" : date,
    ).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Lieferrechnungen</h2>
        <FileText />
      </div>
      <p>
        {open.length} offene Rechnungen ·{" "}
        {euro(open.reduce((sum, i) => sum + i.total_cents, 0))} offen
      </p>
      {op.message && (
        <p className="notice" role="status">
          {op.message}
        </p>
      )}
      <div className="invoice-ledger">
        {op.data.invoices.map((i) => (
          <article className="invoice-ledger-card" key={i.id}>
            <div className="panel-head">
              <div>
                <strong>RE-{String(i.number).padStart(6, "0")}</strong>
                <p>{i.customer_snapshot.name}</p>
              </div>
              <InvoiceStatus invoice={i} />
            </div>
            <div className="invoice-facts">
              <div>
                <small>Rechnungsbetrag</small>
                <strong>{euro(i.total_cents)}</strong>
              </div>
              <div>
                <small>Rechnungsdatum</small>
                <b>{dateLabel(i.created_at)}</b>
              </div>
              <div>
                <small>Zahlungsziel</small>
                <b>
                  {i.due_date
                    ? dateLabel(i.due_date)
                    : "Altbeleg · nicht hinterlegt"}
                </b>
              </div>
            </div>
            <p className="fineprint">
              Netto {euro(i.net_cents)} · USt. {euro(i.tax_cents)} ·{" "}
              {paymentLabels[i.payment_method || "invoice"]}
              {i.mode === "setup"
                ? " · Einrichtung: keine automatischen Mahnungen"
                : ""}
            </p>
            {i.status === "paid" && (
              <p className="payment-received">
                Zahlung eingegangen
                {i.paid_at ? ` am ${dateLabel(i.paid_at)}` : ""}
                {i.payment_entry
                  ? ` · ${paymentLabels[i.payment_entry.method]}`
                  : ""}
              </p>
            )}
            <div className="inline-actions">
              <button
                className="button secondary"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("elias:pdf-preview", {
                      detail: `/api/documents/invoice/${i.id}`,
                    }),
                  )
                }
              >
                Rechnung anzeigen
              </button>
              {!readOnly &&
                op.data.can_manage_payments &&
                i.status === "open" && (
                  <button
                    className="button"
                    disabled={op.busy}
                    onClick={() => {
                      setSelected(i);
                      setMethod("bank");
                      setPaidOn(berlinDate(new Date().toISOString()));
                      setConfirmed(false);
                    }}
                  >
                    Zahlungseingang buchen
                  </button>
                )}
            </div>
          </article>
        ))}
      </div>
      {!op.data.invoices.length && (
        <p>Noch keine Lieferrechnungen vorhanden.</p>
      )}
      <p className="fineprint">
        Rechnungen zählen ab Erstellung zum Rechnungsumsatz, auch unbezahlt.
        Zahlungseingänge werden separat dokumentiert und erzeugen keinen zweiten
        Umsatz.
      </p>
      {selected && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Zahlungseingang buchen"
          >
            <div className="panel-head">
              <h2>Zahlungseingang · RE-{selected.number}</h2>
              <button disabled={op.busy} onClick={() => setSelected(null)}>
                Schließen
              </button>
            </div>
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await op.act("invoice-paid", {
                    id: selected.id,
                    method,
                    paid_on: paidOn,
                    confirmed,
                  })
                )
                  setSelected(null);
              }}
            >
              <strong>
                {euro(selected.total_cents)} · {selected.customer_snapshot.name}
              </strong>
              <label>
                Zahlungsart
                <select
                  aria-label="Zahlungsart des Eingangs"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as typeof method)}
                >
                  <option value="bank">Überweisung</option>
                  <option value="cash">Barzahlung</option>
                  <option value="card">EC-Karte</option>
                </select>
              </label>
              <label>
                Tag des Zahlungseingangs
                <input
                  type="date"
                  required
                  min={berlinDate(selected.created_at)}
                  max={berlinDate(new Date().toISOString())}
                  value={paidOn}
                  onChange={(e) => setPaidOn(e.target.value)}
                />
              </label>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Vollständigen Zahlungseingang geprüft
              </label>
              <p className="fineprint">
                Markiert die Rechnung als bezahlt und stoppt weitere Mahnungen.
              </p>
              {op.message && <p role="status">{op.message}</p>}
              <button className="button" disabled={op.busy || !confirmed}>
                Zahlung verbindlich buchen
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
