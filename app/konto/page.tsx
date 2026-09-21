"use client";
import { registrationErrorMessage } from "@/lib/registration";
import { nativeApp } from "@/lib/native-app";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SiteShell from "@/components/site-shell";
import { createBrowserClient } from "@supabase/ssr";
import {
  CustomerFields,
  DocumentsList,
  customerDefaults,
} from "@/components/operations";
import { CommunicationHistory } from "@/components/communication-history";
import SubscriptionManager from "@/components/subscription-manager";
import OrderHistory from "@/components/order-history";
import {
  Package,
  Repeat2,
  FileText,
  Truck,
  UserRound,
  Mail,
} from "lucide-react";
import type {
  Customer,
  Order,
  Delivery,
  Invoice,
  Subscription,
  Product,
} from "@/lib/types";

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
  const db = () =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  useEffect(() => {
    if (nativeApp() !== "customer") return;
    document.documentElement.classList.add("native-customer-account");
    return () =>
      document.documentElement.classList.remove("native-customer-account");
  }, []);
  const load = useCallback(async () => {
    const r = await fetch("/api/customer", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok)
      throw new Error(
        d.error || "Dein Kundenkonto konnte nicht geladen werden.",
      );
    setAccount(d);
    setProfile(d.customer);
    setLoaded(true);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/customer", { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) return r.json();
        if (r.status !== 401) {
          const d = await r.json();
          if (active)
            setMessage(
              d.error || "Dein Kundenkonto konnte nicht geladen werden.",
            );
        }
        return null;
      })
      .then((d) => {
        if (active) {
          const params = new URLSearchParams(location.search);
          if (params.get("error") === "confirmation")
            setMessage(
              "Der Bestätigungslink ist ungültig oder abgelaufen. Bitte fordere eine neue Bestätigungs-E-Mail oder einen neuen Rücksetzlink an.",
            );
          else if (params.has("bestaetigt"))
            setMessage("Deine E-Mail-Adresse wurde bestätigt.");
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
                    email: String(f.get("email")).trim().toLowerCase(),
                    password: String(f.get("password")),
                  };
                  const auth = db();
                  if (register) {
                    if (f.get("password") !== f.get("confirm"))
                      throw new Error("Die Passwörter stimmen nicht überein.");
                    const { data, error } = await auth.auth.signUp({
                      ...credentials,
                      options: {
                        emailRedirectTo: location.origin + "/auth/callback",
                        data: { name: String(f.get("name")) },
                      },
                    });
                    if (error) throw new Error(registrationErrorMessage(error));
                    if (data.session) {
                      await load();
                      setMessage(
                        "Dein Kundenkonto wurde erstellt. Du bist angemeldet.",
                      );
                    } else {
                      setMessage(
                        "Bitte öffne die Bestätigungs-E-Mail, um dein Konto freizuschalten.",
                      );
                    }
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
                  minLength={register ? 12 : 8}
                  required
                  autoComplete={register ? "new-password" : "current-password"}
                />
              </label>
              {register && (
                <label>
                  Passwort wiederholen (mindestens 12 Zeichen)
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </label>
              )}
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
            <div className="auth-help">
              <Link className="text-link" href="/passwort-vergessen">
                Passwort vergessen?
              </Link>
              <button
                className="text-link"
                disabled={busy}
                onClick={async () => {
                  const input = document.querySelector<HTMLInputElement>(
                    '.account-auth input[name="email"]',
                  );
                  if (!input?.value || !input.reportValidity()) {
                    setMessage("Bitte trage zuerst deine E-Mail-Adresse ein.");
                    return;
                  }
                  setBusy(true);
                  try {
                    const { error } = await db().auth.resend({
                      type: "signup",
                      email: input.value.trim().toLowerCase(),
                      options: {
                        emailRedirectTo: location.origin + "/auth/callback",
                      },
                    });
                    if (error) throw error;
                    setMessage(
                      "Falls dein Konto noch nicht bestätigt ist, erhältst du eine neue Bestätigungs-E-Mail.",
                    );
                  } catch {
                    setMessage(
                      "Die E-Mail konnte gerade nicht angefordert werden. Bitte versuche es später erneut.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Bestätigungs-E-Mail erneut anfordern
              </button>
            </div>
          </section>
        ) : (
          <>
            <nav className="portal-nav" aria-label="Mein Kundenkonto">
              {(
                [
                  ["profile", "Profil", UserRound],
                  ["subscriptions", "Lieferabos", Repeat2],
                  ["orders", "Bestellverlauf", Package],
                  ["deliveries", "Lieferscheine", Truck],
                  ["invoices", "Rechnungen", FileText],
                  ["communication", "Kommunikation", Mail],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={String(id)}
                  aria-current={tab === id ? "page" : undefined}
                  className={tab === id ? "selected" : ""}
                  onClick={() => setTab(String(id))}
                >
                  <Icon size={20} />
                  <span>{String(label)}</span>
                </button>
              ))}
            </nav>
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            <div className="portal-content">
              {tab === "communication" && <CommunicationHistory />}
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
                <section>
                  <div className="portal-section-head">
                    <div>
                      <span className="eyebrow">ALLES IM BLICK</span>
                      <h2>Dein Bestellverlauf</h2>
                      <p>Von deiner Anfrage bis zur Lieferung.</p>
                    </div>
                    <Link href="/sortiment" className="button">
                      Getränke bestellen
                    </Link>
                  </div>
                  <OrderHistory orders={account.orders} />
                </section>
              )}
              {tab === "deliveries" && (
                <section>
                  <div className="portal-section-head">
                    <div>
                      <span className="eyebrow">DEINE LIEFERUNGEN</span>
                      <h2>Lieferscheine</h2>
                      <p>
                        Die tatsächlich übergebenen Mengen und deine
                        Empfangsbestätigung.
                      </p>
                    </div>
                  </div>
                  <DocumentsList
                    deliveries={account.deliveries}
                    invoices={[]}
                  />
                </section>
              )}
              {tab === "invoices" && (
                <section>
                  <div className="portal-section-head">
                    <div>
                      <span className="eyebrow">DEINE BELEGE</span>
                      <h2>Rechnungen</h2>
                      <p>
                        Deine Rechnungen entstehen nach der bestätigten
                        Auslieferung.
                      </p>
                    </div>
                  </div>
                  <DocumentsList deliveries={[]} invoices={account.invoices} />
                </section>
              )}
              {tab === "subscriptions" && (
                <SubscriptionManager
                  customer={account.customer}
                  subscriptions={account.subscriptions}
                  products={products}
                  onChanged={load}
                />
              )}
            </div>
            <div className="portal-account-actions">
              <Link className="text-link" href="/datenschutz">
                Datenschutz
              </Link>
              <Link className="text-link" href="/impressum">
                Impressum
              </Link>
              <Link className="text-link" href="/passwort">
                Passwort ändern
              </Link>
              <button
                className="text-link"
                onClick={async () => {
                  await db().auth.signOut();
                  setAccount(null);
                }}
              >
                Abmelden
              </button>
            </div>
          </>
        )}
        {message && !account && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
    </SiteShell>
  );
}
