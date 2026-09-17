"use client";
import Link from "next/link";
import { useDialog } from "./use-dialog";
import Image from "next/image";
import {
  useEffect,
  useState,
  createContext,
  useContext,
  useSyncExternalStore,
  useMemo,
} from "react";
import {
  ShoppingBag,
  ArrowUpRight,
  Phone,
  MapPin,
  Menu,
  X,
  Plus,
  Minus,
  Trash2,
  Truck,
  ArrowRight,
  Check,
  Camera,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { euro, pack } from "@/lib/money";
import type { Product, CartLine } from "@/lib/types";
const subscribeCart = (callback: () => void) => {
  window.addEventListener("elias-cart-change", callback);
  return () => window.removeEventListener("elias-cart-change", callback);
};
const cartSnapshot = () => sessionStorage.getItem("elias-cart") || "[]";
const serverCartSnapshot = () => "[]";
const ShopContext = createContext<{ add: (p: Product) => void }>({
  add: () => {},
});
export const useShop = () => useContext(ShopContext);
export function Logo() {
  return (
    <Image
      src="/images/elias-logo.png"
      alt="Getränkeshop Elias"
      width={206}
      height={67}
      priority
      className="brand-logo"
    />
  );
}
export default function SiteShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false),
    [open, setOpen] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [social, setSocial] = useState(""),
    [guestAllowed, setGuestAllowed] = useState(true),
    [customer, setCustomer] = useState<{
      name: string;
      email: string;
      phone: string;
      address: string;
    } | null>(null),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  useDialog(open, () => setOpen(false));
  const cartJson = useSyncExternalStore(
    subscribeCart,
    cartSnapshot,
    serverCartSnapshot,
  );
  const cart = useMemo<CartLine[]>(() => {
    try {
      const c = JSON.parse(cartJson);
      return Array.isArray(c)
        ? c.filter(
            (x) =>
              x.product?.id && Number.isInteger(x.quantity) && x.quantity > 0,
          )
        : [];
    } catch {
      return [];
    }
  }, [cartJson]);
  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        setSocial(d.instagram || "");
        setGuestAllowed(d.guest_orders !== false);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/customer")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.customer) setCustomer(d.customer);
      })
      .catch(() => {});
  }, []);
  const update = (lines: CartLine[]) => {
    sessionStorage.setItem("elias-cart", JSON.stringify(lines));
    window.dispatchEvent(new Event("elias-cart-change"));
    setMessage("");
  };
  const add = (p: Product) => {
    const found = cart.find((l) => l.product.id === p.id);
    update(
      found
        ? cart.map((l) =>
            l.product.id === p.id
              ? { ...l, quantity: Math.min(l.quantity + 1, 100) }
              : l,
          )
        : [...cart, { product: p, quantity: 1 }],
    );
    setOpen(true);
  };
  const count = cart.reduce((s, l) => s + l.quantity, 0),
    gross = cart.reduce((s, l) => s + l.quantity * l.product.price_cents, 0),
    deposit = cart.reduce(
      (s, l) => s + l.quantity * (l.product.deposit_cents ?? 0),
      0,
    ),
    unknown = false,
    crates = cart.reduce(
      (s, l) =>
        s +
        (l.product.kind === "beverage" && l.product.pack_count > 1
          ? l.quantity
          : 0),
      0,
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(f),
          request_id: requestId,
          items: cart.map((l) => ({ id: l.product.id, quantity: l.quantity })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      update([]);
      setRequestId(crypto.randomUUID());
      setMessage(
        `Danke! Deine Anfrage ${d.number} ist eingegangen. Deine gewählten Sorten und der Pfandbetrag wurden übernommen. Elias bestätigt den Liefertermin.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Bitte versuche es erneut.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ShopContext.Provider value={{ add }}>
      <a className="skip-link" href="#main">
        Zum Inhalt
      </a>
      <div className="topline">
        <div className="container">
          <span>
            <MapPin size={13} /> Dein Getränkemarkt in Heilbronn
          </span>
          <a href="tel:+4971317975225">
            <Phone size={12} /> 07131 / 797 52 25
          </a>
        </div>
      </div>
      <header className="site-header">
        <div className="container nav">
          <Link href="/" aria-label="Elias Startseite">
            <Logo />
          </Link>
          <nav
            className={menu ? "main-nav is-open" : "main-nav"}
            aria-label="Hauptnavigation"
          >
            {[
              ["/", "Startseite"],
              ["/sortiment", "Sortiment"],
              ["/lieferservice", "Lieferservice"],
              ["/kontakt", "Über uns & Kontakt"],
            ].map(([href, label]) => (
              <Link
                onClick={() => setMenu(false)}
                className={path === href ? "active" : ""}
                href={href}
                key={href}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            <Link href="/konto" className="text-link">
              Mein Konto
            </Link>
            <button
              className="bag-button"
              onClick={() => setOpen(true)}
              aria-label={`Warenkorb, ${count} Artikel`}
            >
              <ShoppingBag size={20} />
              {count > 0 && <span>{count}</span>}
            </button>
            <Link href="/sortiment" className="button small desktop-order">
              Getränke bestellen <ArrowUpRight size={17} />
            </Link>
            <button
              aria-label="Menü öffnen"
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="footer">
        <div className="container">
          <div className="footer-top">
            <div>
              <Logo />
              <p>
                Gute Getränke. Gute Nachbarschaft.
                <br />
                Dein Getränkemarkt in Heilbronn.
              </p>
            </div>
            <div>
              <h3>Schau vorbei.</h3>
              <p>
                Wartbergstraße 3<br />
                74076 Heilbronn
              </p>
              <a href="/kontakt">
                Anfahrt & Öffnungszeiten <ArrowUpRight size={15} />
              </a>
            </div>
            <div>
              <h3>Wir sind für dich da.</h3>
              <a href="tel:+4971317975225">07131 / 797 52 25</a>
              <a href="mailto:info@getraenke-elias.de">
                info@getraenke-elias.de
              </a>
              {social && (
                <a href={social} target="_blank" rel="noreferrer">
                  <Camera size={16} /> Elias auf Instagram
                </a>
              )}
            </div>
            <div>
              <h3>Entdecken</h3>
              <Link href="/sortiment">Unser Sortiment</Link>
              <Link href="/lieferservice">Lieferservice</Link>
              <Link href="/login">
                Mitarbeiter-Login <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Getränkeshop Elias</span>
            <div>
              <Link href="/impressum">Impressum</Link>
              <Link href="/datenschutz">Datenschutz</Link>
            </div>
            <span>Mit Herz in Heilbronn.</span>
          </div>
        </div>
      </footer>
      {open && (
        <div className="drawer-backdrop" onClick={() => setOpen(false)}>
          <section
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Deine Getränkeauswahl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span className="eyebrow">DEIN LIEFERSERVICE</span>
                <h2>Deine Getränkeauswahl</h2>
              </div>
              <button
                autoFocus
                className="icon-button"
                onClick={() => setOpen(false)}
                aria-label="Warenkorb schließen"
              >
                <X />
              </button>
            </div>
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            {!cart.length ? (
              <div className="empty">
                <ShoppingBag size={42} />
                <h3>Platz für deine Lieblingsgetränke.</h3>
                <p>Stell dir deine Auswahl aus unserem Sortiment zusammen.</p>
                <Link
                  href="/sortiment"
                  className="button"
                  onClick={() => setOpen(false)}
                >
                  Sortiment entdecken <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <>
                <p className="muted">
                  Unverbindliche Lieferanfrage · Mindestmenge 4 Kisten
                </p>
                <div className="cart-lines">
                  {cart.map((l) => (
                    <div className="cart-line" key={l.product.id}>
                      <div>
                        <strong>{l.product.name}</strong>
                        <small>
                          {pack(l.product)} · {euro(l.product.price_cents)}
                        </small>
                        <div className="stepper">
                          <button
                            aria-label={`${l.product.name} weniger`}
                            onClick={() =>
                              update(
                                cart.flatMap((x) =>
                                  x.product.id === l.product.id
                                    ? x.quantity > 1
                                      ? [{ ...x, quantity: x.quantity - 1 }]
                                      : []
                                    : [x],
                                ),
                              )
                            }
                          >
                            <Minus size={14} />
                          </button>
                          <span>{l.quantity}</span>
                          <button
                            aria-label={`${l.product.name} mehr`}
                            onClick={() =>
                              update(
                                cart.map((x) =>
                                  x.product.id === l.product.id
                                    ? {
                                        ...x,
                                        quantity: Math.min(100, x.quantity + 1),
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                      <div>
                        <strong>
                          {euro(l.product.price_cents * l.quantity)}
                        </strong>
                        <button
                          className="icon-button"
                          aria-label={`${l.product.name} entfernen`}
                          onClick={() =>
                            update(
                              cart.filter((x) => x.product.id !== l.product.id),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-totals">
                  <div>
                    <span>Getränke inkl. MwSt.</span>
                    <strong>{euro(gross)}</strong>
                  </div>
                  <div>
                    <span>Pfand</span>
                    <span>{euro(deposit)}</span>
                  </div>
                  <div>
                    <span>Lieferung</span>
                    <span>im Listenpreis enthalten</span>
                  </div>
                  <div className="total">
                    <span>{unknown ? "Zwischensumme" : "Gesamt"}</span>
                    <strong>
                      {euro(gross + deposit)}
                      {unknown ? " + Pfand" : ""}
                    </strong>
                  </div>
                </div>
                <form onSubmit={submit} className="form-grid">
                  <p className="notice">
                    {customer
                      ? `Bestellung als ${customer.name}`
                      : guestAllowed
                        ? "Du bestellst als Gast. Mit einem Kundenkonto werden deine Daten gespeichert."
                        : "Bitte melde dich für eine Bestellung an."}{" "}
                    <Link href="/konto">Zum Kundenkonto</Link>
                  </p>
                  <label>
                    Name
                    <input
                      name="customer_name"
                      defaultValue={customer?.name || ""}
                      required
                      maxLength={120}
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    E-Mail
                    <input
                      type="email"
                      name="email"
                      defaultValue={customer?.email || ""}
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    Telefon
                    <input
                      name="phone"
                      defaultValue={customer?.phone || ""}
                      type="tel"
                      required
                      autoComplete="tel"
                    />
                  </label>
                  <label>
                    Lieferadresse
                    <input
                      name="address"
                      defaultValue={customer?.address || ""}
                      required
                      minLength={8}
                      maxLength={300}
                      autoComplete="street-address"
                      placeholder="Straße, Hausnummer, PLZ und Ort"
                    />
                  </label>
                  <label>
                    Wunschtermin & Hinweise
                    <textarea
                      name="notes"
                      maxLength={1000}
                      placeholder="z. B. Freitag nachmittags, 3. Etage …"
                    />
                  </label>
                  <input
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    className="honeypot"
                    aria-hidden="true"
                  />
                  <label className="checkline">
                    <input type="checkbox" name="adult" required /> Ich bin
                    mindestens 18 Jahre alt. Bei Alkohol erfolgt eine
                    Altersprüfung bei Übergabe.
                  </label>
                  <label className="checkline">
                    <input type="checkbox" required /> Ich habe die{" "}
                    <Link href="/datenschutz">Datenschutzhinweise</Link>{" "}
                    gelesen.
                  </label>
                  {crates < 4 && (
                    <p className="notice">
                      Noch {4 - crates} Kiste{4 - crates === 1 ? "" : "n"} bis
                      zur Mindestabnahmemenge.
                    </p>
                  )}
                  <button
                    disabled={
                      busy || crates < 4 || (!guestAllowed && !customer)
                    }
                    className="button"
                  >
                    {busy ? "Wird übermittelt …" : "Lieferanfrage senden"}{" "}
                    <ArrowRight size={18} />
                  </button>
                  <p className="fineprint">
                    Preisliste Februar 2026. Diese Anfrage ist noch kein
                    Kaufvertrag. Du erhältst eine Bestätigung mit aktuellem
                    Preis, Pfand und Liefertermin.
                  </p>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </ShopContext.Provider>
  );
}
export function MapCard() {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="map-card">
      {loaded ? (
        <iframe
          title="Google Maps: Getränke Elias, Wartbergstraße 3, Heilbronn"
          src="https://maps.google.com/maps?q=Wartbergstra%C3%9Fe%203%2074076%20Heilbronn&output=embed"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="map-placeholder">
          <MapPin size={38} />
          <strong>Hier sind wir zuhause.</strong>
          <span>Wartbergstraße 3 · Heilbronn</span>
          <button className="button secondary" onClick={() => setLoaded(true)}>
            Google-Karte laden <ArrowUpRight size={16} />
          </button>
          <small>
            Mit dem Laden wird deine IP-Adresse an Google übertragen.
          </small>
        </div>
      )}
    </div>
  );
}
export function Hours() {
  return (
    <div className="hours">
      <div>
        <span>Montag – Freitag</span>
        <strong>
          09:00 – 12:30 Uhr
          <br />
          14:00 – 18:00 Uhr
        </strong>
      </div>
      <div>
        <span>Samstag</span>
        <strong>09:00 – 14:00 Uhr</strong>
      </div>
      <div>
        <span>Sonntag</span>
        <span>Geschlossen</span>
      </div>
    </div>
  );
}
export function ServiceStrip() {
  return (
    <div className="service-strip container">
      <div>
        <Truck />
        <span>
          <strong>Wir bringen’s vorbei.</strong>
          <small>Nach Hause, ins Büro & zum Fest</small>
        </span>
      </div>
      <div>
        <ShoppingBag />
        <span>
          <strong>Für jeden Geschmack.</strong>
          <small>Regional verwurzelt. Vielfältig sortiert.</small>
        </span>
      </div>
      <div>
        <Check />
        <span>
          <strong>Persönlich für dich da.</strong>
          <small>Ehrliche Beratung direkt im Markt</small>
        </span>
      </div>
    </div>
  );
}
