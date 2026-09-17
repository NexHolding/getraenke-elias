"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDialog } from "./use-dialog";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Truck,
  ShoppingCart,
  Users,
  Wallet,
  Settings,
  LogOut,
  ArrowUpRight,
  Plus,
  Search,
  Download,
  Printer,
  RefreshCw,
  Check,
  ArrowRight,
  AlertTriangle,
  X,
  Minus,
  Trash2,
  Store,
  CheckCircle2,
  Mail,
  Globe,
  ShieldCheck,
  Smartphone,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Logo } from "./site-shell";
import { euro, pack, totals } from "@/lib/money";
import { catalogPdf, financePdf, receiptPdf, csvDownload } from "@/lib/exports";
import { categories } from "@/lib/catalog";
import type {
  Product,
  Supplier,
  Order,
  Sale,
  Purchase,
  Settings as Config,
  SaleLine,
} from "@/lib/types";
type Closing = {
  id: string;
  kind: string;
  period: string;
  totals: { gross: number; count: number };
  created_at: string;
};
type Data = {
  products: Product[];
  suppliers: Supplier[];
  orders: Order[];
  sales: Sale[];
  purchases: Purchase[];
  settings: Config;
  closings: Closing[];
  mail: {
    id: string;
    subject: string;
    recipient: string;
    status: string;
    error: string | null;
  }[];
  role: string;
};
const nav = [
  ["uebersicht", "Übersicht", LayoutDashboard],
  ["finanzen", "Finanzen", Wallet],
  ["kasse", "Kasse", Store],
  ["artikel", "Artikel & Lager", Package],
  ["bestellungen", "Kundenanfragen", ShoppingCart],
  ["einkauf", "Einkauf", Truck],
  ["lieferanten", "Lieferanten", Users],
  ["einstellungen", "Einstellungen", Settings],
] as const;
const dateKey = (d: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(d),
  );
const defaults: Product = {
  id: "",
  sku: "",
  name: "",
  category: "Mineralwasser",
  pack_count: 12,
  volume_ml: 700,
  price_cents: 0,
  source_unit_price_cents: null,
  deposit_cents: null,
  tax_rate: 19,
  deposit_tax_rate: 19,
  stock: null,
  min_stock: 0,
  target_stock: 0,
  supplier_id: "demo-supplier",
  reorder_enabled: false,
  active: true,
  verified: false,
  barcode: "",
  source: "Manuell",
  kind: "beverage",
};
export default function AdminApp({ section }: { section: string }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("Alle Getränke"),
    [selected, setSelected] = useState<string[]>([]),
    [edit, setEdit] = useState<Product | null>(null),
    [supplier, setSupplier] = useState<Supplier | null>(null),
    [bulk, setBulk] = useState(false),
    [cart, setCart] = useState<{ id: string; quantity: number }[]>([]),
    [returns, setReturns] = useState<Record<string, number>>({}),
    [payment, setPayment] = useState("cash"),
    [saleId, setSaleId] = useState(() => crypto.randomUUID()),
    [lastSale, setLastSale] = useState<Sale | null>(null),
    [period, setPeriod] = useState(() =>
      dateKey(new Date().toISOString()).slice(0, 7),
    ),
    [mode, setMode] = useState<"day" | "month">("month"),
    [confirmClose, setConfirmClose] = useState(false),
    [confirmReceive, setConfirmReceive] = useState<Purchase | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin", { cache: "no-store" });
    if (r.status === 401 || r.status === 403) {
      router.push("/login");
      return;
    }
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
  }, [router]);
  useEffect(() => {
    let live = true;
    fetch("/api/admin", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Verwaltung konnte nicht geladen werden.");
        return r.json();
      })
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const act = async (
    action: string,
    payload: Record<string, unknown> = {},
    success = "Gespeichert.",
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      setNotice(success);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const products = data?.products || [],
    filtered = products.filter(
      (p) =>
        (category === "Alle Getränke" || p.category === category) &&
        `${p.name} ${p.sku} ${p.barcode}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
    low = products.filter((p) => p.stock !== null && p.stock < p.min_stock),
    unverified = products.filter((p) => !p.verified),
    pending = data?.orders.filter((o) => o.status === "new") || [],
    periodSales = (data?.sales || []).filter(
      (s) =>
        dateKey(s.created_at).slice(0, mode === "month" ? 7 : 10) === period,
    ),
    sum = (k: "total_cents" | "net_cents" | "tax_cents" | "deposit_cents") =>
      periodSales.reduce((s, x) => s + x[k], 0);
  const lines: SaleLine[] = cart
    .map((l) => {
      const p = products.find((p) => p.id === l.id)!;
      return {
        id: p.id,
        name: p.name,
        quantity: l.quantity,
        price_cents: p.price_cents,
        deposit_cents: p.deposit_cents ?? 0,
        tax_rate: p.tax_rate,
        deposit_tax_rate: p.deposit_tax_rate,
      };
    })
    .concat(
      Object.entries(returns)
        .filter(([, q]) => q > 0)
        .map(([d, q]) => ({
          id: `return-${d}`,
          name: "Pfandrücknahme",
          quantity: -q,
          price_cents: 0,
          deposit_cents: Number(d),
          tax_rate: 19,
          deposit_tax_rate: 19,
        })),
    );
  const total = totals(lines);
  const heading = nav.find((n) => n[0] === section)?.[1] || "Übersicht";
  function exportFinance() {
    csvDownload(`Elias-TEST-${period}.csv`, [
      ["TESTDATEN - NICHT FÜR STEUERLICHE BUCHUNG"],
      [
        "Testbon",
        "Zeitpunkt UTC",
        "Zahlart",
        "Netto EUR",
        "USt EUR",
        "Brutto EUR",
        "Pfand EUR",
      ],
      ...periodSales.map((s) => [
        s.number,
        s.created_at,
        s.payment,
        (s.net_cents / 100).toFixed(2),
        (s.tax_cents / 100).toFixed(2),
        (s.total_cents / 100).toFixed(2),
        (s.deposit_cents / 100).toFixed(2),
      ]),
    ]);
  }
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link href="/">
          <Logo />
        </Link>
        <div className="workspace-label">DEIN ARBEITSPLATZ</div>
        <nav aria-label="Verwaltung">
          {nav.map(([id, label, Icon]) => (
            <Link
              href={id === "uebersicht" ? "/crm" : `/crm/${id}`}
              className={section === id ? "active" : ""}
              key={id}
            >
              <Icon size={19} />
              {label}
              {id === "bestellungen" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div>
            <span className="avatar">FE</span>
            <span>
              <strong>Getränke Elias</strong>
              <small>
                {data?.role === "owner" ? "Inhaber" : "Mitarbeiterbereich"}
              </small>
            </span>
          </div>
          <Link href="/" target="_blank">
            Website ansehen <ArrowUpRight size={16} />
          </Link>
          <button
            onClick={async () => {
              await fetch("/api/auth/signout", { method: "POST" });
              router.push("/login");
            }}
          >
            <LogOut size={16} /> Abmelden
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>
            Verwaltung <ChevronRight size={14} /> <strong>{heading}</strong>
          </span>
          <div>
            <span className="status-dot" /> Supabase{" "}
            <span className="test-pill">Kasse: Testbetrieb</span>
            <span className="avatar small-avatar">FE</span>
          </div>
        </header>
        <main className="admin-content">
          <div className="admin-title">
            <div>
              <span className="eyebrow">GETRÄNKESHOP ELIAS</span>
              <h1>{section === "uebersicht" ? "Alles im Blick." : heading}</h1>
              <p>
                {section === "uebersicht"
                  ? "Dein Markt. Deine Zahlen. Dein nächster Schritt."
                  : section === "artikel"
                    ? "Sortiment pflegen, Preise ändern und Bestände im Blick behalten."
                    : section === "finanzen"
                      ? "Umsätze, Abschlüsse und Exporte an einem Ort."
                      : section === "kasse"
                        ? "Für den Verkauf am Tresen – optimiert für dein Tablet."
                        : section === "einstellungen"
                          ? "Dein Geschäft und deine Schnittstellen."
                          : "Übersichtlich organisiert. Persönlich betreut."}
              </p>
            </div>
            <button
              className="button secondary small"
              onClick={() => load().catch((e) => setError(e.message))}
            >
              <RefreshCw size={16} /> Aktualisieren
            </button>
          </div>
          {error && (
            <div className="notice danger" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Fehlerhinweis schließen"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice success" role="status">
              <CheckCircle2 size={18} />
              {notice}
            </div>
          )}
          {!data ? (
            <div className="empty">
              {error
                ? "Daten konnten nicht geladen werden."
                : "Dein Arbeitsplatz wird geladen …"}
            </div>
          ) : (
            <>
              {section === "uebersicht" && (
                <>
                  <div className="stats-grid">
                    <Stat
                      title="Artikel im Sortiment"
                      value={String(products.length)}
                      detail="Aus der Elias-Lieferliste"
                      icon={Package}
                    />
                    <Stat
                      title="Neue Lieferanfragen"
                      value={String(pending.length)}
                      detail="Warten auf deine Bestätigung"
                      icon={ShoppingCart}
                    />
                    <Stat
                      title="Unter Mindestbestand"
                      value={String(low.length)}
                      detail={`${products.filter((p) => p.stock === null).length} Bestände noch offen`}
                      icon={Truck}
                    />
                    <Stat
                      title="Testumsatz heute"
                      value={euro(
                        data.sales
                          .filter(
                            (s) =>
                              dateKey(s.created_at) ===
                              dateKey(new Date().toISOString()),
                          )
                          .reduce((a, s) => a + s.total_cents, 0),
                      )}
                      detail="Keine echten Kasseneinnahmen"
                      icon={Wallet}
                    />
                  </div>
                  <div className="admin-two-col">
                    <section className="panel">
                      <div className="panel-head">
                        <h2>Deine nächsten Schritte</h2>
                        <span className="badge">Einrichtung</span>
                      </div>
                      {[
                        [
                          `${unverified.length} Artikel prüfen`,
                          "Verkaufspreise und Pfand bestätigen, Bestände erfassen.",
                          "artikel",
                          Package,
                        ],
                        [
                          "Lieferanten vervollständigen",
                          "Der Demo-Lieferant versendet keine Bestellungen.",
                          "lieferanten",
                          Truck,
                        ],
                        [
                          "Schnittstellen verbinden",
                          "E-Mail, Instagram, TSE und Bondrucker einrichten.",
                          "einstellungen",
                          Settings,
                        ],
                      ].map(([title, sub, to, I]) => {
                        const Icon = I as typeof Package;
                        return (
                          <Link
                            className="task-row"
                            href={`/crm/${to}`}
                            key={String(to)}
                          >
                            <span className="task-icon">
                              <Icon size={21} />
                            </span>
                            <div>
                              <strong>{String(title)}</strong>
                              <p>{String(sub)}</p>
                            </div>
                            <ArrowRight size={17} />
                          </Link>
                        );
                      })}
                    </section>
                    <section className="panel">
                      <div className="panel-head">
                        <h2>Schnellzugriff</h2>
                      </div>
                      <div className="quick-grid">
                        <Link href="/crm/kasse">
                          <Store />
                          <strong>Kasse öffnen</strong>
                          <small>Testverkauf starten</small>
                        </Link>
                        <Link href="/crm/artikel">
                          <Plus />
                          <strong>Artikel pflegen</strong>
                          <small>Einzeln & gesammelt</small>
                        </Link>
                        <Link href="/crm/finanzen">
                          <FileText />
                          <strong>Finanzen</strong>
                          <small>Auswerten & exportieren</small>
                        </Link>
                        <button onClick={() => catalogPdf(products)}>
                          <Printer />
                          <strong>Artikelliste</strong>
                          <small>PDF im Elias-Design</small>
                        </button>
                      </div>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Neue Kundenanfragen</h2>
                      <Link href="/crm/bestellungen" className="text-link">
                        Alle ansehen <ArrowRight size={16} />
                      </Link>
                    </div>
                    {pending.length ? (
                      pending.slice(0, 5).map((o) => (
                        <div className="task-row" key={o.id}>
                          <span className="avatar">
                            {o.customer_name.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <strong>{o.customer_name}</strong>
                            <p>{o.address}</p>
                          </div>
                          <span className="badge">
                            EL-{String(o.number).padStart(5, "0")}
                          </span>
                        </div>
                      ))
                    ) : (
                      <Empty
                        text="Noch keine neuen Lieferanfragen."
                        sub="Anfragen aus dem Liefershop erscheinen automatisch hier."
                      />
                    )}
                  </section>
                  <div className="notice">
                    <ShieldCheck size={21} />
                    <div>
                      <strong>Die Kasse ist bewusst im Testbetrieb.</strong>
                      <p>
                        Für echte Verkäufe fehlen TSE-Vertrag, vollständige
                        Fiskalisierung und Hardwareabnahme. Testbelege verändern
                        keine Lagerbestände.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {section === "artikel" && (
                <>
                  <div className="panel toolbar">
                    <label className="search-field">
                      <Search size={18} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Name, Artikelnummer oder Barcode"
                      />
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      aria-label="Kategorie"
                    >
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <button
                      className="button secondary small"
                      onClick={() =>
                        catalogPdf(
                          selected.length
                            ? products.filter((p) => selected.includes(p.id))
                            : filtered,
                        )
                      }
                    >
                      <Printer size={16} /> PDF-Liste
                    </button>
                    <button
                      className="button small"
                      onClick={() =>
                        setEdit({
                          ...defaults,
                          id: crypto.randomUUID(),
                          sku: `EL-${Date.now().toString().slice(-7)}`,
                        })
                      }
                    >
                      <Plus size={17} /> Neuer Artikel
                    </button>
                  </div>
                  {selected.length > 0 && (
                    <div className="selection-bar">
                      <strong>{selected.length} Artikel ausgewählt</strong>
                      <button
                        className="button small"
                        onClick={() => setBulk(true)}
                      >
                        Mehrfach bearbeiten
                      </button>
                      <button
                        className="text-link"
                        onClick={() => setSelected([])}
                      >
                        Auswahl aufheben
                      </button>
                    </div>
                  )}
                  <div className="panel table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              aria-label="Alle gefilterten Artikel auswählen"
                              checked={
                                filtered.length > 0 &&
                                filtered.every((p) => selected.includes(p.id))
                              }
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? filtered.map((p) => p.id)
                                    : [],
                                )
                              }
                            />
                          </th>
                          <th>Artikel</th>
                          <th>Gebinde</th>
                          <th>Brutto / Netto</th>
                          <th>Pfand</th>
                          <th>Bestand / Min.</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`${p.name} auswählen`}
                                checked={selected.includes(p.id)}
                                onChange={(e) =>
                                  setSelected(
                                    e.target.checked
                                      ? [...selected, p.id]
                                      : selected.filter((id) => id !== p.id),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <strong>{p.name}</strong>
                              <small>
                                {p.sku} · {p.category}
                              </small>
                            </td>
                            <td>{pack(p)}</td>
                            <td>
                              <strong>{euro(p.price_cents)}</strong>
                              <small>
                                {euro(
                                  Math.round(
                                    (p.price_cents * 100) / (100 + p.tax_rate),
                                  ),
                                )}{" "}
                                netto
                              </small>
                            </td>
                            <td>
                              {p.deposit_cents === null ? (
                                <span className="badge warning">offen</span>
                              ) : (
                                euro(p.deposit_cents)
                              )}
                            </td>
                            <td>
                              <span
                                className={
                                  p.stock !== null && p.stock < p.min_stock
                                    ? "red-text"
                                    : ""
                                }
                              >
                                {p.stock ?? "—"} / {p.min_stock}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge ${p.verified ? "green" : "warning"}`}
                              >
                                {p.verified ? "Geprüft" : "Zu prüfen"}
                              </span>
                              {!p.active && <small>Inaktiv</small>}
                            </td>
                            <td>
                              <button
                                className="table-action"
                                onClick={() => setEdit(p)}
                              >
                                Bearbeiten
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filtered.length && (
                      <Empty text="Keine Artikel gefunden." />
                    )}
                  </div>
                  <p className="fineprint">
                    Importierte Preise sind Lieferpreise (Februar 2026). Vor
                    Kassennutzung Ladenpreise, Steuer und Pfand artikelgenau
                    bestätigen. „—“ bedeutet unbekannter Bestand.
                  </p>
                </>
              )}
              {section === "lieferanten" && (
                <>
                  <div className="toolbar">
                    <button
                      className="button small"
                      onClick={() =>
                        setSupplier({
                          id: crypto.randomUUID(),
                          name: "",
                          email: "",
                          phone: "",
                          is_demo: false,
                          auto_send: false,
                        })
                      }
                    >
                      <Plus size={17} /> Lieferant anlegen
                    </button>
                  </div>
                  <div className="supplier-grid">
                    {data.suppliers.map((s) => (
                      <article className="panel supplier-card" key={s.id}>
                        <div className="panel-head">
                          <span className="task-icon">
                            <Truck />
                          </span>
                          <span
                            className={`badge ${s.is_demo ? "warning" : "green"}`}
                          >
                            {s.is_demo ? "Demo" : "Angelegt"}
                          </span>
                        </div>
                        <h2>{s.name}</h2>
                        <p>
                          {s.email || "Bestelladresse noch nicht hinterlegt"}
                        </p>
                        <p>{s.phone || "Telefon noch nicht hinterlegt"}</p>
                        <div className="supplier-detail">
                          <strong>
                            {
                              products.filter((p) => p.supplier_id === s.id)
                                .length
                            }
                          </strong>{" "}
                          zugeordnete Artikel
                        </div>
                        <p className="fineprint">
                          Bestellungen werden als Entwurf erstellt.
                          Automatischer Versand erfolgt nur mit expliziter
                          Freigabe und verbundenem E-Mail-Server.
                        </p>
                        <button
                          className="button secondary small"
                          onClick={() => setSupplier(s)}
                        >
                          Lieferant bearbeiten
                        </button>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {section === "einkauf" && (
                <>
                  <div className="notice">
                    <Truck size={22} />
                    <div>
                      <strong>Nachbestellungen mit Kontrolle.</strong>
                      <p>
                        Bei aktivierter Automatik werden unterhalb des
                        Mindestbestands Entwürfe bis zum Zielbestand erstellt.
                        Offene Bestellmengen werden berücksichtigt.
                        Demo-Bestellungen werden niemals versendet.
                      </p>
                    </div>
                  </div>
                  <div className="toolbar">
                    <span className="badge">
                      Automatik{" "}
                      {data.settings.auto_reorder
                        ? "aktiv · Entwurfsmodus"
                        : "pausiert"}
                    </span>
                    <button
                      disabled={busy}
                      className="button small"
                      onClick={() =>
                        act(
                          "reorder",
                          {},
                          "Bestände geprüft. Neue Entwürfe wurden bei Bedarf angelegt.",
                        )
                      }
                    >
                      <RefreshCw size={17} /> Bestände jetzt prüfen
                    </button>
                    <Link href="/crm/einstellungen" className="text-link">
                      Automatik einstellen <ArrowRight size={16} />
                    </Link>
                  </div>
                  <div className="panel">
                    {data.purchases.length ? (
                      data.purchases.map((p) => (
                        <div className="purchase-row" key={p.id}>
                          <div className="panel-head">
                            <div>
                              <strong>
                                {
                                  data.suppliers.find(
                                    (s) => s.id === p.supplier_id,
                                  )?.name
                                }
                              </strong>
                              <small>
                                {new Date(p.created_at).toLocaleString("de-DE")}{" "}
                                · {p.id.slice(0, 8)}
                              </small>
                            </div>
                            <span className="badge">
                              {
                                {
                                  draft: "Entwurf",
                                  received: "Eingegangen",
                                  sent: "Versendet",
                                  queued: "Versandwarteschlange",
                                  cancelled: "Storniert",
                                }[p.status]
                              }
                            </span>
                          </div>
                          {p.items.map((i) => (
                            <div className="line-row" key={i.id}>
                              <span>{i.name}</span>
                              <strong>{i.quantity} Gebinde</strong>
                            </div>
                          ))}
                          {p.status === "draft" && (
                            <div className="toolbar">
                              <button
                                disabled={busy}
                                className="button small secondary"
                                onClick={() => setConfirmReceive(p)}
                              >
                                Wareneingang buchen
                              </button>
                              <button
                                disabled={busy}
                                className="text-link"
                                onClick={() =>
                                  act(
                                    "purchase-status",
                                    { id: p.id },
                                    "Entwurf storniert.",
                                  )
                                }
                              >
                                Entwurf stornieren
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <Empty
                        text="Keine offenen Bestellungen."
                        sub="Hinterlege Bestände und Mindestmengen und aktiviere die Nachbestellung bei deinen Artikeln."
                      />
                    )}
                  </div>
                </>
              )}
              {section === "bestellungen" && (
                <div className="panel">
                  {data.orders.length ? (
                    data.orders.map((o) => (
                      <article className="order-card" key={o.id}>
                        <div className="panel-head">
                          <div>
                            <span className="eyebrow">
                              EL-{String(o.number).padStart(5, "0")}
                            </span>
                            <h2>{o.customer_name}</h2>
                          </div>
                          <select
                            value={o.status}
                            aria-label={`Status Anfrage ${o.number}`}
                            onChange={(e) =>
                              act(
                                "order-status",
                                { id: o.id, status: e.target.value },
                                "Anfragestatus aktualisiert.",
                              )
                            }
                          >
                            <option value="new">Neu</option>
                            <option value="confirmed">Bestätigt</option>
                            <option value="delivering">In Lieferung</option>
                            <option value="completed">Abgeschlossen</option>
                            <option value="cancelled">Storniert</option>
                          </select>
                        </div>
                        <p>{o.address}</p>
                        <p>
                          <a href={`mailto:${o.email}`}>{o.email}</a> ·{" "}
                          <a href={`tel:${o.phone}`}>{o.phone}</a>
                        </p>
                        {o.notes && <p className="notice">{o.notes}</p>}
                        {o.items.map((i, k) => (
                          <div className="line-row" key={k}>
                            <span>
                              {i.quantity} × {i.name}
                            </span>
                            <strong>
                              {euro(i.quantity * i.price_cents)}{" "}
                              {i.deposit_cents === null
                                ? "+ Pfand offen"
                                : `+ ${euro(i.quantity * i.deposit_cents)} Pfand`}
                            </strong>
                          </div>
                        ))}
                        <small>
                          Eingegangen{" "}
                          {new Date(o.created_at).toLocaleString("de-DE")} ·
                          Kundenbestätigung erfolgt derzeit persönlich.
                        </small>
                      </article>
                    ))
                  ) : (
                    <Empty
                      text="Hier kommen deine Lieferanfragen an."
                      sub="Sobald Kunden eine Auswahl senden, kannst du sie hier bearbeiten."
                    />
                  )}
                </div>
              )}
              {section === "kasse" && (
                <>
                  <div className="notice warning">
                    <AlertTriangle size={21} />
                    <div>
                      <strong>Testkasse · kein echter Verkauf</strong>
                      <p>
                        Keine TSE-Signierung, keine Zahlungsabwicklung und keine
                        Lagerbuchung. Nur Artikel mit bestätigtem Preis und
                        Pfand sind auswählbar.
                      </p>
                    </div>
                  </div>
                  <div className="pos-layout">
                    <section>
                      <label className="search-field">
                        <Search size={19} />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Artikel oder Barcode suchen"
                        />
                      </label>
                      <div className="pos-products">
                        {filtered
                          .filter((p) => p.active)
                          .map((p) => (
                            <button
                              disabled={!p.verified || p.deposit_cents === null}
                              key={p.id}
                              onClick={() => {
                                setLastSale(null);
                                setCart((c) =>
                                  c.some((l) => l.id === p.id)
                                    ? c.map((l) =>
                                        l.id === p.id
                                          ? {
                                              ...l,
                                              quantity: Math.min(
                                                l.quantity + 1,
                                                1000,
                                              ),
                                            }
                                          : l,
                                      )
                                    : [...c, { id: p.id, quantity: 1 }],
                                );
                              }}
                            >
                              <span className="badge">{p.category}</span>
                              <strong>{p.name}</strong>
                              <small>{pack(p)}</small>
                              <b>{euro(p.price_cents)}</b>
                              <small>
                                {p.deposit_cents === null
                                  ? "Pfand prüfen"
                                  : `+ ${euro(p.deposit_cents)} Pfand`}
                              </small>
                            </button>
                          ))}
                      </div>
                    </section>
                    <aside className="panel pos-cart">
                      <div className="panel-head">
                        <h2>Aktueller Testbon</h2>
                        <button
                          className="icon-button"
                          aria-label="Testbon leeren"
                          onClick={() => {
                            setCart([]);
                            setReturns({});
                            setSaleId(crypto.randomUUID());
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                      {cart.length === 0 && (
                        <p className="muted">
                          Artikel auswählen oder Pfand zurücknehmen.
                        </p>
                      )}
                      {cart.map((l) => {
                        const p = products.find((p) => p.id === l.id)!;
                        return (
                          <div className="pos-line" key={l.id}>
                            <div>
                              <strong>{p.name}</strong>
                              <small>
                                {euro(p.price_cents)} +{" "}
                                {euro(p.deposit_cents ?? 0)} Pfand
                              </small>
                            </div>
                            <div className="stepper">
                              <button
                                aria-label={`${p.name} reduzieren`}
                                onClick={() =>
                                  setCart(
                                    cart.flatMap((x) =>
                                      x.id === l.id
                                        ? x.quantity > 1
                                          ? [{ ...x, quantity: x.quantity - 1 }]
                                          : []
                                        : [x],
                                    ),
                                  )
                                }
                              >
                                <Minus size={13} />
                              </button>
                              <span>{l.quantity}</span>
                              <button
                                aria-label={`${p.name} erhöhen`}
                                onClick={() =>
                                  setCart(
                                    cart.map((x) =>
                                      x.id === l.id
                                        ? {
                                            ...x,
                                            quantity: Math.min(
                                              1000,
                                              x.quantity + 1,
                                            ),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <h3 className="pos-subhead">Pfandrücknahme</h3>
                      <div className="return-grid">
                        {[8, 15, 25, 150].map((d) => (
                          <label key={d}>
                            {euro(d)}
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              value={returns[d] || 0}
                              onChange={(e) =>
                                setReturns({
                                  ...returns,
                                  [d]: Math.max(
                                    0,
                                    Math.min(
                                      1000,
                                      Math.floor(Number(e.target.value)),
                                    ),
                                  ),
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="cart-totals">
                        <div>
                          <span>Netto</span>
                          <span>{euro(total.net)}</span>
                        </div>
                        <div>
                          <span>Umsatzsteuer</span>
                          <span>{euro(total.tax)}</span>
                        </div>
                        <div>
                          <span>Pfand enthalten</span>
                          <span>{euro(total.deposit)}</span>
                        </div>
                        <div className="total">
                          <strong>
                            {total.gross < 0 ? "Auszahlung" : "Gesamt"}
                          </strong>
                          <strong>{euro(Math.abs(total.gross))}</strong>
                        </div>
                      </div>
                      <div className="segmented">
                        {[
                          ["cash", "Bar"],
                          ["card", "Karte"],
                        ].map(([v, l]) => (
                          <button
                            className={payment === v ? "active" : ""}
                            key={v}
                            onClick={() => setPayment(v)}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      <button
                        className="button full"
                        disabled={busy || !lines.length}
                        onClick={async () => {
                          const s = await act(
                            "sale",
                            {
                              value: {
                                id: saleId,
                                lines: cart,
                                payment,
                                returns: Object.entries(returns)
                                  .filter(([, q]) => q > 0)
                                  .map(([d, q]) => ({
                                    deposit_cents: Number(d),
                                    quantity: q,
                                  })),
                              },
                            },
                            "Testbeleg gespeichert. Es wurde keine echte Zahlung ausgeführt.",
                          );
                          if (s) {
                            setLastSale(s);
                            setCart([]);
                            setReturns({});
                            setSaleId(crypto.randomUUID());
                          }
                        }}
                      >
                        Testbeleg erstellen <Check size={18} />
                      </button>
                      {lastSale && (
                        <button
                          className="button secondary full"
                          onClick={() => receiptPdf(lastSale)}
                        >
                          <Printer size={18} /> Testbon als PDF
                        </button>
                      )}
                      <p className="fineprint">
                        Rücknahmen verwenden im Test 19 % USt. Artikelbezogene
                        Pfandsteuer vor Echtbetrieb prüfen. Kartenzahlung ist
                        eine Simulation.
                      </p>
                    </aside>
                  </div>
                </>
              )}
              {section === "finanzen" && (
                <>
                  <div className="notice">
                    <ShieldCheck size={21} />
                    <div>
                      <strong>Finanzansicht im Testbetrieb</strong>
                      <p>
                        Alle Werte stammen aus Testbelegen. Diese Exporte sind
                        keine Steuerberater- oder DSFinV-K-Abgabe.
                        Abgeschlossene Testperioden sind gegen weitere
                        Testbuchungen gesperrt.
                      </p>
                    </div>
                  </div>
                  <div className="toolbar">
                    <div className="segmented">
                      <button
                        className={mode === "month" ? "active" : ""}
                        onClick={() => {
                          setMode("month");
                          setPeriod(period.slice(0, 7));
                        }}
                      >
                        Monat
                      </button>
                      <button
                        className={mode === "day" ? "active" : ""}
                        onClick={() => {
                          setMode("day");
                          setPeriod(
                            period.length === 7 ? `${period}-01` : period,
                          );
                        }}
                      >
                        Tag
                      </button>
                    </div>
                    <input
                      aria-label="Auswertungszeitraum"
                      type={mode === "month" ? "month" : "date"}
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                    />
                    <button
                      className="button secondary small"
                      onClick={exportFinance}
                    >
                      <Download size={16} /> CSV
                    </button>
                    <button
                      className="button secondary small"
                      onClick={() => financePdf(periodSales, period)}
                    >
                      <Printer size={16} /> PDF
                    </button>
                    <button
                      className="button small"
                      onClick={() => setConfirmClose(true)}
                      disabled={
                        !period ||
                        data.closings.some(
                          (c) => c.kind === mode && c.period === period,
                        )
                      }
                    >
                      {data.closings.some(
                        (c) => c.kind === mode && c.period === period,
                      )
                        ? "Abgeschlossen"
                        : `${mode === "day" ? "Tages" : "Monats"}abschluss`}
                    </button>
                  </div>
                  <div className="stats-grid">
                    <Stat
                      title="Testumsatz brutto"
                      value={euro(sum("total_cents"))}
                      detail={`${periodSales.length} Testbelege`}
                      icon={Wallet}
                    />
                    <Stat
                      title="Netto"
                      value={euro(sum("net_cents"))}
                      detail="Ohne Umsatzsteuer"
                      icon={FileText}
                    />
                    <Stat
                      title="Umsatzsteuer"
                      value={euro(sum("tax_cents"))}
                      detail="Aus den Testbelegpositionen"
                      icon={FileText}
                    />
                    <Stat
                      title="Pfandsaldo brutto"
                      value={euro(sum("deposit_cents"))}
                      detail="Ausgabe minus Rücknahme"
                      icon={RefreshCw}
                    />
                  </div>
                  <div className="panel table-wrap">
                    <div className="panel-head">
                      <h2>Testbelege im Zeitraum</h2>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Testbon</th>
                          <th>Datum</th>
                          <th>Zahlart</th>
                          <th>Netto</th>
                          <th>USt.</th>
                          <th>Brutto</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {periodSales.map((s) => (
                          <tr key={s.id}>
                            <td>T-{s.number}</td>
                            <td>
                              {new Date(s.created_at).toLocaleString("de-DE", {
                                timeZone: "Europe/Berlin",
                              })}
                            </td>
                            <td>{s.payment === "cash" ? "Bar" : "Karte"}</td>
                            <td>{euro(s.net_cents)}</td>
                            <td>{euro(s.tax_cents)}</td>
                            <td>
                              <strong>{euro(s.total_cents)}</strong>
                            </td>
                            <td>
                              <button
                                className="table-action"
                                onClick={() => receiptPdf(s)}
                              >
                                PDF-Bon
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!periodSales.length && (
                      <Empty text="Keine Testbelege in diesem Zeitraum." />
                    )}
                  </div>
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Festgeschriebene Testabschlüsse</h2>
                    </div>
                    {data.closings.length ? (
                      data.closings.map((c) => (
                        <div className="line-row" key={c.id}>
                          <span>
                            {c.kind === "day" ? "Tag" : "Monat"} · {c.period} ·{" "}
                            {c.totals.count} Testbelege
                          </span>
                          <strong>{euro(c.totals.gross)}</strong>
                          <span className="badge green">Festgeschrieben</span>
                        </div>
                      ))
                    ) : (
                      <Empty text="Noch keine Abschlüsse erstellt." />
                    )}
                  </section>
                </>
              )}
              {section === "einstellungen" && (
                <SettingsForm
                  mail={data.mail}
                  testMail={() =>
                    act(
                      "smtp-test",
                      {},
                      "SMTP-Verbindung erfolgreich geprüft. Es wurde keine Nachricht verschickt.",
                    ).then(() => {})
                  }
                  settings={data.settings}
                  busy={busy}
                  save={(v) =>
                    act(
                      "settings",
                      { value: v },
                      "Einstellungen gespeichert. Zugangsdaten werden serverseitig verschlüsselt.",
                    ).then(() => {})
                  }
                />
              )}
            </>
          )}
        </main>
      </div>
      {edit && (
        <Modal
          title={
            products.some((p) => p.id === edit.id)
              ? "Artikel bearbeiten"
              : "Neuer Artikel"
          }
          close={() => setEdit(null)}
        >
          <form
            className="form-grid two-columns"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  "product",
                  { value: edit },
                  "Artikel gespeichert. Bestellbedarf geprüft.",
                )
              )
                setEdit(null);
            }}
          >
            <Field
              label="Artikelname"
              value={edit.name}
              onChange={(v) => setEdit({ ...edit, name: v })}
            />
            <Field
              label="Artikelnummer"
              value={edit.sku}
              onChange={(v) => setEdit({ ...edit, sku: v })}
            />
            <label>
              Kategorie
              <select
                value={edit.category}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    category: e.target.value,
                    kind:
                      e.target.value === "Für Ihre Feier"
                        ? "rental"
                        : "beverage",
                  })
                }
              >
                {categories.slice(1).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <Field
              label="Barcode / EAN"
              value={edit.barcode}
              required={false}
              onChange={(v) => setEdit({ ...edit, barcode: v })}
            />
            <NumberField
              label="Flaschen / Einheiten pro Gebinde"
              value={edit.pack_count}
              min={1}
              onChange={(v) => setEdit({ ...edit, pack_count: v ?? 1 })}
            />
            <NumberField
              label="Inhalt pro Flasche / Dose (ml)"
              value={edit.volume_ml}
              onChange={(v) => setEdit({ ...edit, volume_ml: v ?? 0 })}
            />
            <MoneyField
              label="Bruttopreis (€)"
              value={edit.price_cents}
              onChange={(v) => setEdit({ ...edit, price_cents: v ?? 0 })}
            />
            <MoneyField
              label="Pfand pro Gebinde (€) · leer = unbekannt"
              value={edit.deposit_cents}
              onChange={(v) => setEdit({ ...edit, deposit_cents: v })}
            />
            <label>
              Umsatzsteuer Artikel
              <select
                value={edit.tax_rate}
                onChange={(e) =>
                  setEdit({ ...edit, tax_rate: Number(e.target.value) })
                }
              >
                {[19, 7, 0].map((r) => (
                  <option value={r} key={r}>
                    {r} %
                  </option>
                ))}
              </select>
            </label>
            <label>
              Umsatzsteuer Pfand
              <select
                value={edit.deposit_tax_rate}
                onChange={(e) =>
                  setEdit({ ...edit, deposit_tax_rate: Number(e.target.value) })
                }
              >
                {[19, 7, 0].map((r) => (
                  <option value={r} key={r}>
                    {r} %
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Istbestand (Gebinde) · leer = unbekannt"
              value={edit.stock}
              onChange={(v) => setEdit({ ...edit, stock: v })}
            />
            <NumberField
              label="Mindestbestand"
              value={edit.min_stock}
              onChange={(v) => setEdit({ ...edit, min_stock: v ?? 0 })}
            />
            <NumberField
              label="Zielbestand nach Bestellung"
              value={edit.target_stock}
              onChange={(v) => setEdit({ ...edit, target_stock: v ?? 0 })}
            />
            <label>
              Lieferant
              <select
                value={edit.supplier_id || ""}
                onChange={(e) =>
                  setEdit({ ...edit, supplier_id: e.target.value || null })
                }
              >
                <option value="">Nicht zugeordnet</option>
                {data?.suppliers.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={edit.reorder_enabled}
                onChange={(e) =>
                  setEdit({ ...edit, reorder_enabled: e.target.checked })
                }
              />{" "}
              Automatische Nachbestellung
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={edit.active}
                onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
              />{" "}
              Im Sortiment aktiv
            </label>
            <label className="checkline span-two">
              <input
                type="checkbox"
                checked={edit.verified}
                onChange={(e) =>
                  setEdit({ ...edit, verified: e.target.checked })
                }
              />{" "}
              Preis, Pfand und Steuersätze geprüft; für Testkasse freigeben
            </label>
            <p className="fineprint span-two">
              Netto:{" "}
              {euro(
                Math.round((edit.price_cents * 100) / (100 + edit.tax_rate)),
              )}{" "}
              · Quelle: {edit.source}
            </p>
            <button disabled={busy} className="button span-two">
              Artikel speichern <Check size={17} />
            </button>
          </form>
        </Modal>
      )}
      {supplier && (
        <Modal title="Lieferant bearbeiten" close={() => setSupplier(null)}>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act("supplier", { value: supplier })) setSupplier(null);
            }}
          >
            <Field
              label="Name"
              value={supplier.name}
              onChange={(v) => setSupplier({ ...supplier, name: v })}
            />
            <Field
              label="Bestell-E-Mail"
              type="email"
              required={false}
              value={supplier.email}
              onChange={(v) => setSupplier({ ...supplier, email: v })}
            />
            <Field
              label="Telefon"
              required={false}
              value={supplier.phone}
              onChange={(v) => setSupplier({ ...supplier, phone: v })}
            />
            <label className="checkline">
              <input
                type="checkbox"
                checked={supplier.is_demo}
                onChange={(e) =>
                  setSupplier({
                    ...supplier,
                    is_demo: e.target.checked,
                    auto_send: e.target.checked ? false : supplier.auto_send,
                  })
                }
              />{" "}
              Demo-Lieferant (kein Versand)
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                disabled={supplier.is_demo}
                checked={supplier.auto_send}
                onChange={(e) =>
                  setSupplier({ ...supplier, auto_send: e.target.checked })
                }
              />{" "}
              Nachbestellungen automatisch an diesen Lieferanten senden
            </label>
            <button disabled={busy} className="button">
              Lieferant speichern
            </button>
          </form>
        </Modal>
      )}
      {bulk && (
        <Modal
          title={`${selected.length} Artikel bearbeiten`}
          close={() => setBulk(false)}
        >
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const patch: Record<string, unknown> = {};
              if (f.get("price"))
                patch.price_cents = Math.round(Number(f.get("price")) * 100);
              if (f.get("deposit"))
                patch.deposit_cents = Math.round(
                  Number(f.get("deposit")) * 100,
                );
              if (f.get("supplier")) patch.supplier_id = f.get("supplier");
              if (f.get("active")) patch.active = f.get("active") === "true";
              if (
                await act(
                  "bulk",
                  { ids: selected, patch },
                  "Ausgewählte Artikel aktualisiert.",
                )
              ) {
                setBulk(false);
                setSelected([]);
              }
            }}
          >
            <p>
              Nur ausgefüllte Felder werden bei allen ausgewählten Artikeln
              geändert.
            </p>
            <label>
              Neuer Bruttopreis (€)
              <input type="number" name="price" min="0" step="0.01" />
            </label>
            <label>
              Neues Pfand pro Gebinde (€)
              <input type="number" name="deposit" min="0" step="0.01" />
            </label>
            <label>
              Lieferant
              <select name="supplier">
                <option value="">Unverändert</option>
                {data?.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Aktiv
              <select name="active">
                <option value="">Unverändert</option>
                <option value="true">Ja</option>
                <option value="false">Nein</option>
              </select>
            </label>
            <button disabled={busy} className="button">
              Änderungen übernehmen
            </button>
          </form>
        </Modal>
      )}
      {confirmClose && (
        <Modal
          title="Testperiode festschreiben"
          close={() => setConfirmClose(false)}
        >
          <p>
            Der {mode === "day" ? "Tag" : "Monat"} <strong>{period}</strong>{" "}
            wird abgeschlossen. Danach können für diesen Zeitraum keine
            Testbelege mehr gebucht werden. Der Abschluss bleibt unveränderbar.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              if (
                await act(
                  "closing",
                  { value: { kind: mode, period } },
                  "Testabschluss festgeschrieben.",
                )
              )
                setConfirmClose(false);
            }}
          >
            Testabschluss verbindlich speichern
          </button>
        </Modal>
      )}
      {confirmReceive && (
        <Modal
          title="Wareneingang bestätigen"
          close={() => setConfirmReceive(null)}
        >
          <p>
            Die aufgeführten Mengen werden auf die Lagerbestände gebucht. Bitte
            bestätige nur tatsächlich erhaltene Ware. Für alle Artikel muss
            zuvor ein Istbestand erfasst sein.
          </p>
          {confirmReceive.items.map((i) => (
            <p key={i.id}>
              {i.quantity} × {i.name}
            </p>
          ))}
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              if (
                await act(
                  "receive",
                  { id: confirmReceive.id },
                  "Wareneingang einmalig gebucht.",
                )
              )
                setConfirmReceive(null);
            }}
          >
            Erhaltene Ware buchen
          </button>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Package;
}) {
  return (
    <article className="stat-card">
      <div>
        <span>{title}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="empty">
      <Package size={30} />
      <strong>{text}</strong>
      {sub && <p>{sub}</p>}
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  useDialog(true, close);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <h2>{title}</h2>
          <button
            autoFocus
            className="icon-button"
            onClick={close}
            aria-label="Dialog schließen"
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        step="1"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </label>
  );
}
function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        step="0.01"
        value={value === null ? "" : value / 100}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? null
              : Math.round(Number(e.target.value) * 100),
          )
        }
      />
    </label>
  );
}
function SettingsForm({
  settings,
  busy,
  save,
  testMail,
  mail,
}: {
  mail: Data["mail"];
  testMail: () => Promise<void>;
  settings: Config;
  busy: boolean;
  save: (v: Config & { smtp_password?: string }) => Promise<void>;
}) {
  const [s, setS] = useState(settings),
    [password, setPassword] = useState("");
  return (
    <form
      className="settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await save({ ...s, smtp_password: password });
        setPassword("");
      }}
    >
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Truck size={20} /> Bestellautomatik
          </h2>
        </div>
        <label className="checkline">
          <input
            type="checkbox"
            checked={s.auto_reorder}
            onChange={(e) => setS({ ...s, auto_reorder: e.target.checked })}
          />{" "}
          Bei unterschrittenem Mindestbestand automatisch Bestellentwürfe
          erstellen
        </label>
        <p className="fineprint">
          Prüfung nach Artikeländerungen und stündlich. Zielbestand, Lieferant
          und Automatik werden zusätzlich pro Artikel gepflegt. Echte
          Lieferanten können nach Einrichtung des E-Mail-Servers separat für den
          Versand freigegeben werden.
        </p>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Mail size={20} /> E-Mail-Server
          </h2>
          <span className="badge">
            {s.smtp_enabled ? "Versand aktiviert" : "Versand pausiert"}
          </span>
        </div>
        <label className="checkline">
          <input
            type="checkbox"
            checked={s.smtp_enabled || false}
            onChange={(e) => setS({ ...s, smtp_enabled: e.target.checked })}
          />{" "}
          Automatische E-Mails aktivieren (Anfragebestätigung & freigegebene
          Lieferanten)
        </label>
        <div className="form-grid two-columns">
          <Field
            label="SMTP-Server"
            value={s.smtp_host}
            required={false}
            onChange={(v) => setS({ ...s, smtp_host: v })}
          />
          <label>
            Port / Verschlüsselung
            <select
              value={s.smtp_port}
              onChange={(e) =>
                setS({ ...s, smtp_port: Number(e.target.value) })
              }
            >
              <option value={465}>465 · TLS</option>
              <option value={587}>587 · STARTTLS</option>
            </select>
          </label>
          <Field
            label="Benutzername"
            value={s.smtp_user}
            required={false}
            onChange={(v) => setS({ ...s, smtp_user: v })}
          />
          <Field
            label={`Passwort ${settings.smtp_password_set ? "(gespeichert; leer lassen zum Beibehalten)" : ""}`}
            type="password"
            value={password}
            required={false}
            onChange={setPassword}
          />
          <Field
            label="Absenderadresse"
            type="email"
            value={s.smtp_from}
            required={false}
            onChange={(v) => setS({ ...s, smtp_from: v })}
          />
        </div>
        <p className="fineprint">
          Das Passwort wird serverseitig verschlüsselt und nicht zurück an den
          Browser übertragen. Versand läuft alle fünf Minuten. Unklare
          Zustellungen werden nicht automatisch erneut versendet.
        </p>
        <button
          type="button"
          className="button secondary small"
          disabled={busy}
          onClick={testMail}
        >
          Gespeicherte SMTP-Verbindung prüfen
        </button>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Globe size={20} /> Domain & Instagram
          </h2>
        </div>
        <div className="form-grid two-columns">
          <Field
            label="Gewünschte Domain"
            value={s.domain}
            onChange={(v) => setS({ ...s, domain: v })}
          />
          <Field
            label="Instagram-Profil (vollständige URL)"
            type="url"
            required={false}
            value={s.instagram}
            onChange={(v) => setS({ ...s, instagram: v })}
          />
        </div>
        <p className="fineprint">
          Die Domain wird hier als Einstellung hinterlegt. Ihre Aktivierung
          benötigt die Domainzuordnung in Vercel und passende DNS-Einträge beim
          bisherigen Anbieter. Instagram wird nach dem Speichern automatisch auf
          der Website verlinkt.
        </p>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <ShieldCheck size={20} /> TSE & Fiskalisierung
          </h2>
          <span className="badge warning">Nicht verbunden</span>
        </div>
        <label>
          Anbieter
          <select
            value={s.tse_provider}
            onChange={(e) => setS({ ...s, tse_provider: e.target.value })}
          >
            <option value="">Noch nicht gewählt</option>
            <option value="fiskaly">fiskaly SIGN DE (vorbereitet)</option>
            <option value="other">Anderer zertifizierter TSE-Anbieter</option>
          </select>
        </label>
        <p>
          Die Auswahl aktiviert keine TSE. Erforderlich sind Vertrag,
          API-Zugang, Kassenregistrierung, Transaktionssignierung,
          DSFinV-K-Export, Archivierung und eine geprüfte Ausfallbehandlung.
        </p>
        <a
          className="text-link"
          target="_blank"
          rel="noreferrer"
          href="https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-steuergerechtigkeit-belegpflicht.html"
        >
          Offizielle BMF-Informationen <ArrowUpRight size={15} />
        </a>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Printer size={20} /> Bondrucker
          </h2>
        </div>
        <div className="form-grid two-columns">
          <label>
            Druckverfahren
            <select
              value={s.printer_mode}
              onChange={(e) => setS({ ...s, printer_mode: e.target.value })}
            >
              <option value="browser">PDF / Systemdruckdialog</option>
              <option value="epson">Epson ePOS (Integration ausstehend)</option>
              <option value="star">Star (Integration ausstehend)</option>
            </select>
          </label>
          <Field
            label="Druckeradresse / Gerätekennung"
            value={s.printer_address}
            required={false}
            onChange={(v) => setS({ ...s, printer_address: v })}
          />
        </div>
        <p className="fineprint">
          Die aktuelle Version erzeugt 80-mm-Testbons als PDF. Direkter
          Tablet-Druck wird nach Festlegung des Druckermodells mit dem passenden
          SDK umgesetzt und am Gerät geprüft.
        </p>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Smartphone size={20} /> Apps & Zugang
          </h2>
          <span className="badge">Nächste Projektphase</span>
        </div>
        <p>
          Die Website kann zum iPad-Home-Bildschirm hinzugefügt werden. Die
          native iPad-Kassen-App und Kunden-App folgen nach finaler Web-Abnahme.
          Apple-Entwicklerkonto, Signierung und Druckerhardware werden dafür
          benötigt.
        </p>
        <Link href="/passwort" className="text-link">
          Eigenes Passwort ändern <ArrowRight size={16} />
        </Link>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Mail size={20} /> Versandprotokoll
          </h2>
        </div>
        {mail.length ? (
          mail.map((m) => (
            <div className="line-row" key={m.id}>
              <div>
                <strong>{m.subject}</strong>
                <small>{m.recipient}</small>
                {m.error && <p>{m.error}</p>}
              </div>
              <span className="badge">{m.status}</span>
            </div>
          ))
        ) : (
          <p>Noch keine E-Mails in der Warteschlange.</p>
        )}
      </section>
      <div className="settings-save">
        <button className="button" disabled={busy}>
          Einstellungen speichern <Check size={18} />
        </button>
      </div>
    </form>
  );
}
