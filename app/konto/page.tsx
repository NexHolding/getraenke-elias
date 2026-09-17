"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SiteShell from "@/components/site-shell";
import { createBrowserClient } from "@supabase/ssr";
import {
  CustomerFields,
  DocumentsList,
  customerDefaults,
} from "@/components/operations";
import { ProductPhoto } from "@/components/product-photo";
import type {
  Customer,
  Order,
  Delivery,
  Invoice,
  Subscription,
  Product,
} from "@/lib/types";
import { pack } from "@/lib/money";
const intervals = {
  weekly: "Wöchentlich",
  biweekly: "Alle zwei Wochen",
  monthly: "Monatlich",
  quarterly: "Vierteljährlich",
  halfyearly: "Halbjährlich",
  yearly: "Jährlich",
};
export default function Account() {
  const [account, setAccount] = useState<{
    customer: Customer;
    orders: Order[];
    deliveries: Delivery[];
    invoices: Invoice[];
    subscriptions: Subscription[];
  } | null>(null);
  const [profile, setProfile] = useState<Partial<Customer>>(customerDefaults);
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState("orders");
  const [sub, setSub] = useState<Partial<Subscription>>({
    items: [],
    interval: "weekly",
    active: true,
    next_date: new Date().toISOString().slice(0, 10),
  });
  const [pid, setPid] = useState("");
  const db = () =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  const load = useCallback(async () => {
    const r = await fetch("/api/customer", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setAccount(d);
      setProfile(d.customer);
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/customer", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) {
          if (d) {
            setAccount(d);
            setProfile(d.customer);
          }
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setLoaded(true);
      });
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        if (active) setProducts(d.products || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const save = async (action: string, value: unknown) => {
    setBusy(true);
    try {
      const r = await fetch("/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      setMessage("Gespeichert.");
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <SiteShell>
      <section className="container account-page">
        <span className="eyebrow">DEIN PERSÖNLICHER GETRÄNKESERVICE</span>
        <h1>
          {account
            ? `Hallo, ${account.customer.name}.`
            : "Willkommen bei Elias."}
        </h1>
        {!loaded ? (
          <p>Dein Konto wird geladen …</p>
        ) : !account ? (
          <section className="panel account-auth">
            <div className="segmented">
              <button
                className={!register ? "active" : ""}
                onClick={() => setRegister(false)}
              >
                Anmelden
              </button>
              <button
                className={register ? "active" : ""}
                onClick={() => setRegister(true)}
              >
                Registrieren
              </button>
            </div>
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setMessage("");
                const f = new FormData(e.currentTarget);
                try {
                  const credentials = {
                    email: String(f.get("email")),
                    password: String(f.get("password")),
                  };
                  const auth = db();
                  if (register) {
                    const { error } = await auth.auth.signUp({
                      ...credentials,
                      options: {
                        emailRedirectTo: location.origin + "/auth/callback",
                        data: { name: String(f.get("name")) },
                      },
                    });
                    if (error) throw error;
                    setMessage(
                      "Bitte öffne die Bestätigungs-E-Mail, um dein Konto freizuschalten.",
                    );
                  } else {
                    const { error } =
                      await auth.auth.signInWithPassword(credentials);
                    if (error) throw error;
                    await load();
                  }
                } catch (e) {
                  setMessage(
                    e instanceof Error
                      ? e.message
                      : "Anmeldung fehlgeschlagen.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {register && (
                <label>
                  Name
                  <input name="name" required autoComplete="name" />
                </label>
              )}
              <label>
                E-Mail
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Passwort
                <input
                  name="password"
                  type="password"
                  minLength={10}
                  required
                  autoComplete={register ? "new-password" : "current-password"}
                />
              </label>
              {register && (
                <label className="checkline">
                  <input required type="checkbox" />
                  Ich habe die{" "}
                  <Link href="/datenschutz">Datenschutzhinweise</Link> gelesen.
                </label>
              )}
              <button disabled={busy} className="button">
                {register ? "Konto erstellen" : "Anmelden"}
              </button>
            </form>
          </section>
        ) : (
          <>
            <div className="category-tabs">
              <button
                className={tab === "orders" ? "selected" : ""}
                onClick={() => setTab("orders")}
              >
                Bestellungen & Belege
              </button>
              <button
                className={tab === "profile" ? "selected" : ""}
                onClick={() => setTab("profile")}
              >
                Profil & Lieferzeiten
              </button>
              <button
                className={tab === "subscriptions" ? "selected" : ""}
                onClick={() => setTab("subscriptions")}
              >
                Meine Lieferabos
              </button>
              <button
                onClick={async () => {
                  await db().auth.signOut();
                  setAccount(null);
                }}
              >
                Abmelden
              </button>
              <Link className="text-link" href="/passwort">
                Passwort ändern
              </Link>
            </div>
            {tab === "profile" && (
              <form
                className="panel form-grid two-columns"
                onSubmit={(e) => {
                  e.preventDefault();
                  save("profile", profile);
                }}
              >
                <span className="eyebrow span-two">
                  KUNDENNUMMER K-
                  {String(account.customer.number).padStart(5, "0")}
                </span>
                <CustomerFields value={profile} onChange={setProfile} />
                <button disabled={busy} className="button span-two">
                  Profil speichern
                </button>
              </form>
            )}
            {tab === "orders" && (
              <div className="customer-layout">
                <section>
                  <div className="panel-head">
                    <h2>Deine Bestellungen</h2>
                    <Link href="/sortiment" className="button">
                      Getränke bestellen
                    </Link>
                  </div>
                  {account.orders.map((o) => (
                    <article className="panel" key={o.id}>
                      <span className="eyebrow">
                        EL-{String(o.number).padStart(5, "0")}
                      </span>
                      <h3>
                        {o.status === "partial"
                          ? "Ein Teil deiner Lieferung ist noch offen"
                          : o.status === "completed"
                            ? "Vollständig geliefert"
                            : o.status === "cancelled"
                              ? "Storniert"
                              : "Deine Bestellung wird vorbereitet"}
                      </h3>
                      {o.delivery_date && (
                        <p className="notice">
                          Lieferung am{" "}
                          {new Date(
                            o.delivery_date + "T12:00:00",
                          ).toLocaleDateString("de-DE")}{" "}
                          voraussichtlich {o.eta_start}–{o.eta_end} Uhr. Die
                          Zeit ist eine Planungsschätzung.
                        </p>
                      )}
                      {o.items.map((i) => (
                        <div className="ledger-row" key={i.id}>
                          <span>
                            {i.quantity} × {i.name}
                          </span>
                          <small>
                            {o.delivered?.[i.id] || 0} geliefert ·{" "}
                            {Math.max(
                              0,
                              i.quantity - (o.delivered?.[i.id] || 0),
                            )}{" "}
                            offen
                          </small>
                        </div>
                      ))}
                    </article>
                  ))}
                  {!account.orders.length && (
                    <p className="panel">
                      Deine erste Getränkeauswahl wartet auf dich.
                    </p>
                  )}
                </section>
                <aside className="panel">
                  <h2>Deine Dokumente</h2>
                  <DocumentsList
                    deliveries={account.deliveries}
                    invoices={account.invoices}
                  />
                </aside>
              </div>
            )}
            {tab === "subscriptions" && (
              <section className="panel">
                <h2>Lieblingsgetränke. Ganz automatisch.</h2>
                <p>
                  Dein Abo erzeugt zum gewählten Rhythmus eine neue Bestellung
                  zu den dann gültigen Listenpreisen. Die Tour wird passend zu
                  deinen Lieferzeiten geplant. Du kannst das Abo jederzeit
                  pausieren.
                </p>
                {account.subscriptions.map((s) => (
                  <div className="ledger-row" key={s.id}>
                    <span>
                      {intervals[s.interval as keyof typeof intervals]} ·
                      nächster Auftrag {s.next_date} ·{" "}
                      {s.active ? "Aktiv" : "Pausiert"}
                    </span>
                    <button
                      className="button secondary"
                      onClick={() => setSub(s)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() =>
                        save("subscription", { ...s, active: !s.active })
                      }
                    >
                      {s.active ? "Pausieren" : "Fortsetzen"}
                    </button>
                  </div>
                ))}
                <form
                  className="form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await save("subscription", sub))
                      setSub({
                        items: [],
                        interval: "weekly",
                        active: true,
                        next_date: new Date().toISOString().slice(0, 10),
                      });
                  }}
                >
                  <h3>{sub.id ? "Lieferabo bearbeiten" : "Neues Lieferabo"}</h3>
                  <div className="window-row">
                    <select
                      aria-label="Artikel für Lieferabo"
                      value={pid}
                      onChange={(e) => setPid(e.target.value)}
                    >
                      <option value="">Artikel auswählen</option>
                      {products
                        .filter((p) => p.kind === "beverage")
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {pack(p)}
                          </option>
                        ))}
                    </select>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!pid}
                      onClick={() => {
                        setSub({
                          ...sub,
                          items: sub.items?.some((i) => i.id === pid)
                            ? sub.items.map((i) =>
                                i.id === pid
                                  ? { ...i, quantity: i.quantity + 1 }
                                  : i,
                              )
                            : [...(sub.items || []), { id: pid, quantity: 1 }],
                        });
                      }}
                    >
                      Hinzufügen
                    </button>
                  </div>
                  {sub.items?.map((i) => (
                    <div className="subscription-item" key={i.id}>
                      {products.find((p) => p.id === i.id) && (
                        <ProductPhoto
                          product={products.find((p) => p.id === i.id)!}
                        />
                      )}
                      <strong>
                        {products.find((p) => p.id === i.id)?.name || i.id}
                      </strong>
                      <input
                        aria-label="Anzahl Gebinde"
                        type="number"
                        min="1"
                        max="100"
                        value={i.quantity}
                        onChange={(e) =>
                          setSub({
                            ...sub,
                            items: sub.items!.map((x) =>
                              x.id === i.id
                                ? { ...x, quantity: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      />
                      <button
                        className="text-link"
                        type="button"
                        onClick={() =>
                          setSub({
                            ...sub,
                            items: sub.items!.filter((x) => x.id !== i.id),
                          })
                        }
                      >
                        Entfernen
                      </button>
                    </div>
                  ))}
                  <label>
                    Rhythmus
                    <select
                      value={sub.interval}
                      onChange={(e) =>
                        setSub({ ...sub, interval: e.target.value })
                      }
                    >
                      {Object.entries(intervals).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Erster / nächster Bestelltag
                    <input
                      type="date"
                      value={sub.next_date}
                      onChange={(e) =>
                        setSub({ ...sub, next_date: e.target.value })
                      }
                      required
                    />
                  </label>
                  <label className="checkline">
                    <input
                      type="checkbox"
                      checked={sub.active}
                      onChange={(e) =>
                        setSub({ ...sub, active: e.target.checked })
                      }
                    />
                    Lieferabo aktiv
                  </label>
                  <button
                    disabled={busy || !sub.items?.length}
                    className="button"
                  >
                    Lieferabo speichern
                  </button>
                </form>
              </section>
            )}
          </>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
    </SiteShell>
  );
}
