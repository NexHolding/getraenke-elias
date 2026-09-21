"use client";
import { nativeApp, nativeRequest } from "@/lib/native-app";
import POSCatalog from "./pos-catalog";
import NumberInput from "./number-input";
import ItemDiscountDialog from "./item-discount-dialog";
import CashRegisterLink from "./cash-register-link";
import ManualPurchase from "./manual-purchase";
import StaffOrders from "./staff-orders";
import CheckoutFlow, { receiptDownload } from "./checkout-flow";
import InventoryPanel from "./inventory-panel";
import SettingsPanel from "./settings-panel";
import { CustomerManager, DeliveryManager, InvoiceLedger } from "./operations";
import { ProductPhoto } from "./product-photo";
import { can } from "@/lib/permissions";
import { depositProfiles, depositFor, returnTypes } from "@/lib/deposits";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useDialog } from "./use-dialog";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
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
  X,
  Minus,
  Trash2,
  Store,
  BottleWine,
  CheckCircle2,
  ShieldCheck,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Logo } from "./site-shell";
import { euro, pack, totals } from "@/lib/money";
import {
  discountedPrice,
  discountReasons,
  discountTotal,
} from "@/lib/discounts";
import { catalogPdf } from "@/lib/exports";
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
  totals: {
    gross: number;
    count: number;
    cash?: number;
    card?: number;
    opening?: number;
    counted?: number;
    difference?: number;
  };
  created_at: string;
};
type Data = {
  finance_readonly?: boolean;
  operatorId: string;
  pendingReceipt?: string | null;
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
  permissions: string[];
  name: string;
  summary?: { open: number; partial: number };
};
const nav = [
  ["uebersicht", "Übersicht", LayoutDashboard],
  ["finanzen", "Finanzen", Wallet],
  ["kasse", "Kasse", Store],
  ["artikel", "Artikel & Lager", Package],
  ["inventur", "Inventur", ClipboardList],
  ["bestellungen", "Bestellungen", ShoppingCart],
  ["kunden", "Kunden", Users],
  ["lieferung", "Lieferplanung", Truck],
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
    [posTool, setPosTool] = useState<"products" | "returns" | "discount">(
      "products",
    ),
    [catalogVisit, setCatalogVisit] = useState(0),
    [editingDiscount, setEditingDiscount] = useState<string | null>(null),
    [showArchived, setShowArchived] = useState(false),
    [category, setCategory] = useState("Alle Getränke"),
    [selected, setSelected] = useState<string[]>([]),
    [edit, setEdit] = useState<Product | null>(null),
    [supplier, setSupplier] = useState<Supplier | null>(null),
    [bulk, setBulk] = useState(false),
    [cart, setCart] = useState<
      {
        id: string;
        quantity: number;
        discount_percent?: number;
        discount_reason?: string;
      }[]
    >([]),
    [returns, setReturns] = useState<Record<string, number>>({}),
    [discountMode, setDiscountMode] = useState<"none" | "item" | "cart">(
      "none",
    ),
    [discount, setDiscount] = useState(0),
    [discountReason, setDiscountReason] = useState<string>("Aktion"),
    [opening, setOpening] = useState(0),
    [counted, setCounted] = useState(0),
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
  useEffect(() => {
    const showCatalog = () => setPosTool("products");
    window.addEventListener("elias:native-scan", showCatalog);
    return () => window.removeEventListener("elias:native-scan", showCatalog);
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
        (showArchived || p.active) &&
        (category === "Alle Getränke" || p.category === category) &&
        `${p.name} ${p.sku} ${p.barcode}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
    low = products.filter((p) => p.stock !== null && p.stock < p.min_stock),
    unverified = products.filter((p) => !p.verified),
    pending =
      data?.orders.filter(
        (o) => !["completed", "cancelled"].includes(o.status),
      ) || [],
    periodSales = (data?.sales || []).filter(
      (s) =>
        dateKey(s.created_at).slice(0, mode === "month" ? 7 : 10) === period,
    ),
    sum = (k: "total_cents" | "net_cents" | "tax_cents" | "deposit_cents") =>
      periodSales.reduce((s, x) => s + x[k], 0);
  const lines: SaleLine[] = cart
    .map<SaleLine>((l) => {
      const p = products.find((p) => p.id === l.id)!;
      const rate =
        data && can(data, "rabatt")
          ? discountMode === "cart"
            ? discount
            : discountMode === "item"
              ? l.discount_percent || 0
              : 0
          : 0;
      return {
        id: p.id,
        name: p.name,
        quantity: l.quantity,
        original_price_cents: p.price_cents,
        discount_percent: rate,
        price_cents: discountedPrice(p.price_cents, rate),
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
  async function exportFinance(format: "pdf" | "csv") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/finance?period=${encodeURIComponent(period)}&format=${format}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `Elias-${mode === "month" ? "Monatsbericht" : "Tagesbericht"}-${period}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={`admin-shell ${section === "kasse" ? "register-shell" : ""}`}
    >
      <aside className="sidebar">
        <Link href="/">
          <Logo />
        </Link>
        <div className="workspace-label">DEIN ARBEITSPLATZ</div>
        <nav aria-label="Verwaltung">
          {nav
            .filter(([id]) => data && can(data, id))
            .map(([id, label, Icon]) =>
              id === "kasse" ? (
                <CashRegisterLink key={id}>
                  <Icon size={19} />
                  {label}
                </CashRegisterLink>
              ) : (
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
              ),
            )}
        </nav>
        <div className="sidebar-bottom">
          <div>
            <span className="avatar">FE</span>
            <span>
              <strong>{data?.name || "Getränke Elias"}</strong>
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
        {section === "kasse" && (
          <header className="register-header">
            <Link
              href="/crm"
              className="register-back"
              onClick={(event) => {
                if (
                  (cart.length || Object.values(returns).some(Boolean)) &&
                  !window.confirm(
                    "Kasse verlassen und aktuellen ungebuchten Bon verwerfen?",
                  )
                )
                  event.preventDefault();
              }}
            >
              <Logo />
              <span>Zur Verwaltung</span>
            </Link>
            <h1>
              Kasse <small>{data?.name}</small>
            </h1>
            <div className="register-tools">
              <button
                type="button"
                onClick={() => {
                  if (nativeApp() === "pos")
                    nativeRequest({ type: "pos.scan" }).catch(() =>
                      setError(
                        "Scanner bitte über die App-Symbolleiste öffnen oder die App aktualisieren.",
                      ),
                    );
                  else {
                    setPosTool("products");
                    requestAnimationFrame(() =>
                      document.getElementById("pos-search")?.focus(),
                    );
                  }
                }}
              >
                <Search size={18} /> <span>Scannen / Suchen</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (nativeApp() === "pos")
                    nativeRequest({ type: "pos.printer" }).catch(() =>
                      setError(
                        "Druckereinrichtung bitte über die App-Symbolleiste öffnen oder die App aktualisieren.",
                      ),
                    );
                  else window.open("/crm/einstellungen", "_blank", "noopener");
                }}
              >
                <Printer size={18} />
                <span>Drucker</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (
                    (cart.length || Object.values(returns).some(Boolean)) &&
                    !window.confirm(
                      "Arbeitsplatz sperren und ungebuchten Bon verwerfen?",
                    )
                  )
                    return;
                  const response = await fetch("/api/terminal", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "lock" }),
                  });
                  if (!response.ok) {
                    setError("Arbeitsplatz konnte nicht gesperrt werden.");
                    return;
                  }
                  router.push("/kassenzugang");
                  router.refresh();
                }}
              >
                <ShieldCheck size={18} />
                <span>Sperren</span>
              </button>
            </div>
          </header>
        )}
        <header className="admin-topbar">
          <span>
            Verwaltung <ChevronRight size={14} /> <strong>{heading}</strong>
          </span>
          <div>
            <span className="status-dot" /> Supabase{" "}
            <span className="test-pill">
              {data?.settings.live_mode ? "Live-Modus" : "Einrichtung"}
            </span>
            <button
              className="text-link"
              onClick={async () => {
                const response = await fetch("/api/terminal", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "lock" }),
                });
                if (!response.ok) {
                  setError("Arbeitsplatz konnte nicht gesperrt werden.");
                  return;
                }
                router.push("/kassenzugang");
                router.refresh();
              }}
            >
              Mitarbeiter wechseln
            </button>
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
          ) : !can(data, section) ? (
            <div className="panel empty">
              <ShieldCheck size={38} />
              <h2>Du hast keinen Zugriff auf diese Inhalte.</h2>
              <p>
                Der Inhaber kann den Bereich in deinen Mitarbeiterrechten
                freischalten.
              </p>
            </div>
          ) : (
            <>
              {section === "inventur" && (
                <InventoryPanel onStockChange={load} />
              )}
              {section === "kunden" && <CustomerManager orders={data.orders} />}
              {section === "lieferung" && (
                <DeliveryManager orders={data.orders} reload={load} />
              )}
              {section === "uebersicht" && (
                <>
                  {section === "uebersicht" && (
                    <Link className="partial-banner" href="/crm/lieferung">
                      <Truck size={22} />
                      <span>
                        <strong>
                          {data.summary?.partial || 0} offene Restlieferungen
                        </strong>
                        <small>
                          Fehlende Artikel bleiben bis zur vollständigen
                          Übergabe vorgemerkt.
                        </small>
                      </span>
                      <ArrowRight />
                    </Link>
                  )}
                  <div className="stats-grid">
                    <Stat
                      title="Artikel im Sortiment"
                      value={String(products.filter((p) => p.active).length)}
                      detail="Aus der Elias-Lieferliste"
                      icon={Package}
                    />
                    <Stat
                      title="Neue Lieferanfragen"
                      value={String(data.summary?.open ?? pending.length)}
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
                      title="Umsatz heute"
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
                          "Bestelladresse und Versandfreigabe am Lieferanten pflegen.",
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
                        <CashRegisterLink>
                          <Store />
                          <strong>Kasse öffnen</strong>
                          <small>Verkauf starten</small>
                        </CashRegisterLink>
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
                            {o.requested_delivery_date && (
                              <p>
                                <strong>
                                  Gewünschte Lieferung:{" "}
                                  {new Date(
                                    o.requested_delivery_date + "T12:00:00Z",
                                  ).toLocaleDateString("de-DE")}
                                </strong>
                                {o.subscription_id ? " · Lieferautomatik" : ""}
                              </p>
                            )}
                            {!["new", "cancelled", "completed"].includes(
                              o.status,
                            ) && (
                              <Link className="text-link" href="/crm/lieferung">
                                Lieferschein & Übergabe öffnen{" "}
                                <ArrowRight size={16} />
                              </Link>
                            )}
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
                </>
              )}
              {section === "artikel" && (
                <>
                  <div className="category-tabs">
                    {categories.map((c) => (
                      <button
                        key={c}
                        className={category === c ? "selected" : ""}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <div className="panel toolbar">
                    <label className="checkline">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(e) => setShowArchived(e.target.checked)}
                      />
                      Archiv anzeigen
                    </label>
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
                          tax_rate: data.settings.default_tax_rate ?? 19,
                          deposit_tax_rate:
                            data.settings.default_deposit_tax_rate ?? 19,
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
                          <th>MwSt.</th>
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
                              <strong>{p.tax_rate} %</strong>
                              <small>Pfand: {p.deposit_tax_rate} %</small>
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
                                {!!p.loose_stock && (
                                  <small>
                                    + {p.loose_stock} lose Einheiten
                                  </small>
                                )}
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
                            {`L-${String(s.number || 0).padStart(5, "0")}`}
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
                  <ManualPurchase
                    products={data.products}
                    suppliers={data.suppliers}
                    reload={load}
                  />
                  <div className="notice">
                    <Truck size={22} />
                    <div>
                      <strong>Nachbestellungen mit Kontrolle.</strong>
                      <p>
                        Bei aktivierter Automatik werden unterhalb des
                        Mindestbestands Entwürfe bis zum Zielbestand erstellt.
                        Nur offene automatische Bestellmengen werden
                        berücksichtigt. Manuelle Zusatzbestellungen bleiben
                        zusätzlich. Der Bedarf wird bis zum konfigurierten
                        Bestelltermin gesammelt.
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
                          <p>
                            <span className="badge">
                              {p.source === "manual"
                                ? "Manuelle Zusatzbestellung"
                                : "Bestellautomatik"}
                            </span>
                            {p.dispatch_method === "external" && (
                              <span className="badge">
                                Telefonisch / extern bestellt
                              </span>
                            )}
                          </p>
                          {p.reference && (
                            <p>
                              <strong>Bezug:</strong> {p.reference}
                            </p>
                          )}
                          {p.requested_date && (
                            <p>
                              Wunschtermin:{" "}
                              {new Date(
                                p.requested_date + "T12:00:00Z",
                              ).toLocaleDateString("de-DE")}
                            </p>
                          )}
                          {p.notes && <p>{p.notes}</p>}
                          {p.dispatch && (
                            <p
                              className={p.dispatch.error ? "notice" : "muted"}
                            >
                              E-Mail:{" "}
                              {(
                                {
                                  pending: "wartet auf Versand",
                                  sending: "wird versendet",
                                  sent: "an Mailserver übergeben",
                                  failed: "nicht versendet",
                                  uncertain:
                                    "Versand unklar – vor Wiederholung prüfen",
                                } as Record<string, string>
                              )[p.dispatch.status] || p.dispatch.status}
                              {p.dispatch.error ? ` · ${p.dispatch.error}` : ""}
                            </p>
                          )}
                          {p.source === "manual" && (
                            <p className="muted">
                              Zusätzlicher Bedarf · wird nicht auf automatische
                              Bestellmengen angerechnet.
                            </p>
                          )}
                          {p.items.map((i) => (
                            <div className="line-row" key={i.id}>
                              <span>
                                {i.name}
                                {i.pack_count && i.volume_ml
                                  ? ` · ${pack({ pack_count: i.pack_count, volume_ml: i.volume_ml })}`
                                  : ""}
                              </span>
                              <strong>{i.quantity} Gebinde</strong>
                            </div>
                          ))}
                          {["draft", "sent"].includes(p.status) && (
                            <div className="toolbar">
                              <button
                                disabled={busy}
                                className="button small secondary"
                                onClick={() => setConfirmReceive(p)}
                              >
                                Wareneingang buchen
                              </button>
                              {p.status === "draft" && (
                                <>
                                  <button
                                    className="button small secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      act(
                                        "purchase-send",
                                        { id: p.id },
                                        "Bestellung zum E-Mail-Versand vorgemerkt. Den Versandstatus findest du in der Übersicht.",
                                      )
                                    }
                                  >
                                    Bestellung per E-Mail senden
                                  </button>
                                  <button
                                    className="button small secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      act(
                                        "purchase-external",
                                        { id: p.id },
                                        "Bestellung als telefonisch / extern bestellt markiert.",
                                      )
                                    }
                                  >
                                    Als extern bestellt markieren
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
                                </>
                              )}
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
                <>
                  <StaffOrders products={data.products} reload={load} />
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
                              disabled={[
                                "partial",
                                "completed",
                                "cancelled",
                              ].includes(o.status)}
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

                              <option value="partial" disabled>
                                Restlieferung offen
                              </option>
                              <option value="completed" disabled>
                                Vollständig geliefert
                              </option>
                              <option value="cancelled">Storniert</option>
                            </select>
                          </div>
                          <p>{o.address}</p>
                          {!["new", "cancelled", "completed"].includes(
                            o.status,
                          ) && (
                            <Link className="text-link" href="/crm/lieferung">
                              Lieferschein & Übergabe öffnen{" "}
                              <ArrowRight size={16} />
                            </Link>
                          )}
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
                            {o.status === "new"
                              ? "Anfrage – Bestätigung noch offen."
                              : o.created_by
                                ? "Im CRM erfasst."
                                : o.subscription_id
                                  ? "Automatisch aus Lieferabo erstellt."
                                  : "Lieferauftrag."}
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
                </>
              )}
              {section === "kasse" && (
                <>
                  <div className="pos-layout">
                    <section className="pos-workspace">
                      <div
                        className="pos-workspace-tabs"
                        role="group"
                        aria-label="Kassenfunktionen"
                      >
                        <button
                          aria-pressed={posTool === "products"}
                          onClick={() => {
                            setPosTool("products");
                            setCatalogVisit((v) => v + 1);
                          }}
                        >
                          <Package size={18} /> Artikel
                        </button>
                        <button
                          aria-pressed={posTool === "returns"}
                          onClick={() => setPosTool("returns")}
                        >
                          <BottleWine size={18} /> Pfandrücknahme{" "}
                          <b>
                            {Object.values(returns).reduce(
                              (s, n) => s + n,
                              0,
                            ) || ""}
                          </b>
                        </button>
                        {can(data, "rabatt") && (
                          <button
                            aria-pressed={posTool === "discount"}
                            onClick={() => setPosTool("discount")}
                          >
                            % Rabatt {discountMode !== "none" && "aktiv"}
                          </button>
                        )}
                      </div>
                      <div
                        className="pos-tool-content"
                        hidden={posTool !== "products"}
                      >
                        <POSCatalog
                          key={catalogVisit}
                          products={products}
                          onSelect={(p) => {
                            setLastSale(null);
                            if (cart.length === 0) {
                              setDiscountMode("none");
                              setDiscount(0);
                              setDiscountReason("Aktion");
                            }
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
                        />
                      </div>
                      <div
                        className="pos-tool-content pos-adjustments"
                        hidden={posTool !== "returns"}
                      >
                        <h2>Pfand zurücknehmen</h2>
                        <p>
                          Leergut antippen oder die Anzahl direkt eingeben. Die
                          Rücknahme erscheint auf dem Bon.
                        </p>
                        <h3 className="pos-subhead">Pfandrücknahme</h3>
                        <div className="return-grid">
                          {returnTypes.map((d) => (
                            <div className="return-tile" key={d.cents}>
                              <button
                                onClick={() =>
                                  setReturns({
                                    ...returns,
                                    [d.cents]: Math.min(
                                      1000,
                                      (returns[d.cents] || 0) + 1,
                                    ),
                                  })
                                }
                              >
                                {d.kind === "bottle" ? (
                                  <BottleWine size={22} />
                                ) : (
                                  <Package size={22} />
                                )}
                                <strong>{d.label}</strong>
                                <span>{euro(d.cents)}</span>
                              </button>
                              <label>
                                Menge
                                <NumberInput
                                  aria-label={`Rückgabe ${d.label}`}
                                  placeholder="Menge eingeben"
                                  min="0"
                                  max="1000"
                                  value={returns[d.cents] || 0}
                                  onChange={(e) =>
                                    setReturns({
                                      ...returns,
                                      [d.cents]: Math.max(
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
                            </div>
                          ))}
                        </div>
                      </div>
                      <div
                        className="pos-tool-content pos-adjustments"
                        hidden={posTool !== "discount"}
                      >
                        <h2>Rabatt vergeben</h2>
                        <p>
                          Artikelrabatte bearbeitest du direkt an der jeweiligen
                          Bonposition.
                        </p>
                        {can(data, "rabatt") && (
                          <fieldset
                            className="pos-discount-panel"
                            disabled={busy || cart.length === 0}
                          >
                            <legend>Rabatt</legend>
                            <div
                              className="segmented"
                              role="group"
                              aria-label="Rabattart"
                            >
                              {(
                                [
                                  ["none", "Kein Rabatt"],
                                  ["item", "Einzelartikel"],
                                  ["cart", "Warenkorb"],
                                ] as const
                              ).map(([value, label]) => (
                                <button
                                  type="button"
                                  key={value}
                                  aria-pressed={discountMode === value}
                                  className={
                                    discountMode === value ? "active" : ""
                                  }
                                  onClick={() => {
                                    setDiscountMode(value);
                                    setDiscount(
                                      value === "cart"
                                        ? (data.settings.discount_percent ?? 10)
                                        : 0,
                                    );
                                    setDiscountReason("Aktion");
                                    setCart((c) =>
                                      c.map((line) => ({
                                        ...line,
                                        discount_percent: 0,
                                        discount_reason: "",
                                      })),
                                    );
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            {discountMode === "cart" && (
                              <div className="pos-discount-fields">
                                <label>
                                  Warenkorbrabatt (%)
                                  <NumberInput
                                    aria-label="Warenkorbrabatt (%)"
                                    placeholder="Prozent eingeben"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={discount}
                                    onChange={(e) =>
                                      setDiscount(
                                        Math.max(
                                          0,
                                          Math.min(
                                            100,
                                            Math.trunc(
                                              Number(e.target.value) || 0,
                                            ),
                                          ),
                                        ),
                                      )
                                    }
                                  />
                                </label>
                                <label>
                                  Rabattgrund
                                  <select
                                    value={discountReason}
                                    onChange={(e) =>
                                      setDiscountReason(e.target.value)
                                    }
                                  >
                                    {discountReasons.map((reason) => (
                                      <option key={reason}>{reason}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            )}
                            <small className="muted">
                              {discountMode === "item"
                                ? "Rabatt an der jeweiligen Position eingeben. "
                                : ""}
                              Pfand und Pfandrücknahmen bleiben unverändert.
                              Rabatte werden je Einheit auf Cent gerundet.
                            </small>
                          </fieldset>
                        )}
                      </div>
                    </section>
                    <aside
                      className="panel pos-cart"
                      aria-label="Aktueller Bon"
                    >
                      <div className="panel-head">
                        <h2>Aktueller Bon</h2>
                        <button
                          className="icon-button"
                          aria-label="Bon leeren"
                          onClick={() => {
                            setCart([]);
                            setDiscountMode("none");
                            setDiscount(0);
                            setDiscountReason("Aktion");
                            setReturns({});
                            setSaleId(crypto.randomUUID());
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                      <div className="pos-cart-lines">
                        {cart.length === 0 &&
                          !Object.values(returns).some(Boolean) && (
                            <p className="muted">
                              Artikel auswählen oder Pfand zurücknehmen.
                            </p>
                          )}
                        {cart.map((l) => {
                          const p = products.find((p) => p.id === l.id)!;
                          const priced = lines.find(
                            (line) => line.id === l.id,
                          )!;
                          return (
                            <div className="pos-item" key={l.id}>
                              <div className="pos-line">
                                <div>
                                  <strong>{p.name}</strong>
                                  <small className="pos-line-pack">
                                    {pack(p)}
                                  </small>
                                  <small>
                                    {priced.price_cents !== p.price_cents && (
                                      <del>{euro(p.price_cents)} </del>
                                    )}
                                    {euro(priced.price_cents)} +{" "}
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
                                              ? [
                                                  {
                                                    ...x,
                                                    quantity: x.quantity - 1,
                                                  },
                                                ]
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
                              {can(data, "rabatt") && (
                                <button
                                  className={`pos-item-discount ${discountMode === "item" && l.discount_percent ? "applied" : ""}`}
                                  aria-label={`Rabatt für ${p.name}, ${pack(p)}`}
                                  onClick={() => setEditingDiscount(l.id)}
                                >
                                  <span>%</span>
                                  {discountMode === "item" && l.discount_percent
                                    ? `${l.discount_percent} % Rabatt bearbeiten`
                                    : "Rabatt"}
                                </button>
                              )}
                              {discountMode === "item" &&
                                !!l.discount_percent && (
                                  <small className="pos-item-saving">
                                    −{euro(discountTotal([priced]))} ·{" "}
                                    {l.discount_reason}
                                  </small>
                                )}
                            </div>
                          );
                        })}
                        {Object.entries(returns)
                          .filter(([, quantity]) => quantity > 0)
                          .map(([cents, quantity]) => (
                            <div className="pos-return-line" key={cents}>
                              <div>
                                <strong>Pfandrücknahme</strong>
                                <small>
                                  {quantity} × {euro(Number(cents))}
                                </small>
                              </div>
                              <b>−{euro(Number(cents) * quantity)}</b>
                              <button
                                className="icon-button"
                                aria-label={`Pfandrücknahme ${cents} entfernen`}
                                onClick={() =>
                                  setReturns((current) => ({
                                    ...current,
                                    [cents]: 0,
                                  }))
                                }
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ))}
                      </div>
                      <div className="pos-checkout">
                        <div className="cart-totals" aria-live="polite">
                          {discountTotal(lines) > 0 && (
                            <div className="discount-saving">
                              <span>Rabatt gesamt (ohne Pfand)</span>
                              <strong>−{euro(discountTotal(lines))}</strong>
                            </div>
                          )}
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
                        <CheckoutFlow
                          key={data.operatorId}
                          totalCents={total.gross}
                          settings={data.settings}
                          operatorId={data.operatorId}
                          pendingReceipt={data.pendingReceipt}
                          disabled={busy || !lines.length}
                          onRefresh={load}
                          payload={{
                            id: saleId,
                            lines: cart.map((line) => ({
                              id: line.id,
                              quantity: line.quantity,
                              discount_percent:
                                can(data, "rabatt") && discountMode === "item"
                                  ? line.discount_percent || 0
                                  : 0,
                              discount_reason: can(data, "rabatt")
                                ? discountMode === "cart"
                                  ? discountReason
                                  : discountMode === "item"
                                    ? line.discount_reason || discountReasons[0]
                                    : ""
                                : "",
                            })),
                            payment,
                            discount:
                              can(data, "rabatt") && discountMode === "cart"
                                ? discount
                                : 0,
                            returns: Object.entries(returns)
                              .filter(([, q]) => q > 0)
                              .map(([d, q]) => ({
                                deposit_cents: Number(d),
                                quantity: q,
                              })),
                          }}
                          onBooked={(s) => {
                            setLastSale(s);
                            setCart([]);
                            setDiscountMode("none");
                            setDiscount(0);
                            setDiscountReason("Aktion");
                            setReturns({});
                            setSaleId(crypto.randomUUID());
                          }}
                        />
                        {lastSale && (
                          <button
                            className="button secondary full"
                            onClick={() => receiptDownload(lastSale.id)}
                          >
                            <Printer size={18} /> Bon als PDF
                          </button>
                        )}
                        <p className="fineprint">
                          {payment === "card"
                            ? "Zahlung zuerst am separaten SumUp-Terminal prüfen."
                            : "Barzahlung am Tresen."}
                        </p>
                      </div>
                    </aside>
                  </div>
                </>
              )}
              {section === "kasse" &&
                editingDiscount &&
                can(data, "rabatt") &&
                (() => {
                  const product = products.find(
                    (p) => p.id === editingDiscount,
                  );
                  const line = cart.find((l) => l.id === editingDiscount);
                  return product && line ? (
                    <ItemDiscountDialog
                      key={editingDiscount}
                      product={product}
                      percent={
                        discountMode === "item" ? line.discount_percent || 0 : 0
                      }
                      reason={line.discount_reason || discountReasons[0]}
                      cartDiscount={discountMode === "cart" ? discount : 0}
                      onClose={() => setEditingDiscount(null)}
                      onApply={(percent, reason) => {
                        setDiscountMode("item");
                        setDiscount(0);
                        setCart((c) =>
                          c.map((l) =>
                            l.id === editingDiscount
                              ? {
                                  ...l,
                                  discount_percent: percent,
                                  discount_reason: reason,
                                }
                              : l,
                          ),
                        );
                        setEditingDiscount(null);
                      }}
                    />
                  ) : null;
                })()}
              {section === "finanzen" && (
                <>
                  <InvoiceLedger readOnly={!!data.finance_readonly} />
                  {can(data, "inventur") && (
                    <p>
                      <Link className="text-link" href="/crm/inventur">
                        Inventurberichte und Bestandskorrekturbelege öffnen →
                      </Link>
                    </p>
                  )}
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
                      disabled={busy || !period}
                      onClick={() => exportFinance("csv")}
                    >
                      <Download size={16} /> CSV
                    </button>
                    <button
                      className="button secondary small"
                      disabled={busy || !period}
                      onClick={() => exportFinance("pdf")}
                    >
                      <Printer size={16} /> PDF
                    </button>
                    {!data.finance_readonly && (
                      <button
                        className="button small"
                        onClick={() => setConfirmClose(true)}
                        disabled={!period}
                      >
                        {data.closings.some(
                          (c) => c.kind === mode && c.period === period,
                        )
                          ? "Abschluss aktualisieren"
                          : `${mode === "day" ? "Tages" : "Monats"}abschluss`}
                      </button>
                    )}
                  </div>
                  <p className="fineprint">
                    PDF und CSV enthalten Kassenbons und Lieferrechnungen mit
                    getrennten Summen. Die folgenden Kennzahlen beziehen sich
                    auf die Kasse.
                    {data.finance_readonly
                      ? " Ihr Zugang erlaubt ausschließlich Lesen und Exportieren."
                      : ""}
                  </p>
                  <div className="stats-grid">
                    <Stat
                      title="Kassenumsatz brutto"
                      value={euro(sum("total_cents"))}
                      detail={`${periodSales.length} Belege`}
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
                      detail="Aus den Belegpositionen"
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
                      <h2>Belege im Zeitraum</h2>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>Bon</th>
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
                            <td>E-{s.number}</td>
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
                                onClick={() => receiptDownload(s.id)}
                              >
                                PDF-Bon
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!periodSales.length && (
                      <Empty text="Keine Belege in diesem Zeitraum." />
                    )}
                  </div>
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Gespeicherte Abschlüsse</h2>
                    </div>
                    {data.closings.length ? (
                      data.closings.map((c) => (
                        <div className="line-row" key={c.id}>
                          <span>
                            {c.kind === "day" ? "Tag" : "Monat"} · {c.period} ·{" "}
                            {c.totals.count} Belege
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
                <SettingsPanel
                  key={JSON.stringify(data.settings)}
                  settings={data.settings}
                  owner={data.role === "owner"}
                  busy={busy}
                  testMail={() =>
                    act("smtp-test", {}, "SMTP-Verbindung geprüft.")
                  }
                  save={(v) => act("settings", { value: v })}
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
              onChange={(v) =>
                setEdit({
                  ...edit,
                  pack_count: v ?? 1,
                  deposit_cents: depositFor(
                    edit.deposit_profile || "custom",
                    v ?? 1,
                    edit.deposit_cents || 0,
                  ),
                })
              }
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
            <Field
              label="Sortengruppe im Shop"
              required={false}
              value={edit.group_name || ""}
              onChange={(v) => setEdit({ ...edit, group_name: v })}
            />
            <Field
              label="Sorte / Variante"
              required={false}
              value={edit.variant || ""}
              onChange={(v) => setEdit({ ...edit, variant: v })}
            />
            <label>
              Pfandprofil
              <select
                value={edit.deposit_profile || "custom"}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    deposit_profile: e.target.value,
                    deposit_cents: depositFor(
                      e.target.value,
                      edit.pack_count,
                      edit.deposit_cents || 0,
                    ),
                  })
                }
              >
                {depositProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Produktfoto hochladen
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const form = new FormData();
                  form.set("file", f);
                  try {
                    const r = await fetch("/api/upload", {
                      method: "POST",
                      body: form,
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    setEdit({
                      ...edit,
                      image_url: d.url,
                      image_source: "Eigener Upload",
                    });
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Upload fehlgeschlagen.",
                    );
                  }
                }}
              />
            </label>
            {edit.image_url && <ProductPhoto product={edit} />}
            {edit.data_note && (
              <p className="notice span-two">{edit.data_note}</p>
            )}
            <MoneyField
              label="Pfand pro Gebinde (€)"
              value={edit.deposit_cents}
              onChange={(v) =>
                setEdit({
                  ...edit,
                  deposit_cents: v,
                  deposit_profile: "custom",
                })
              }
            />
            <label>
              Umsatzsteuer Artikel
              <select
                aria-label="Umsatzsteuer Artikel"
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
                aria-label="Umsatzsteuer Pfand"
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
            <label>
              Istbestand (volle Gebinde)
              <input readOnly value={edit.stock ?? "Unbekannt"} />
              <small>
                Zusätzlich {edit.loose_stock || 0} lose Einheiten. Änderungen
                über Inventur oder Bruch & Bestandskorrekturen buchen.
              </small>
            </label>
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
              Preis, Pfand und Steuersätze geprüft; fachlich geprüft
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
            {(["company", "address", "contact", "notes"] as const).map(
              (key, i) => (
                <Field
                  key={key}
                  label={
                    ["Firma", "Anschrift", "Ansprechpartner", "Notizen"][i]
                  }
                  required={false}
                  value={supplier[key] || ""}
                  onChange={(v) => setSupplier({ ...supplier, [key]: v })}
                />
              ),
            )}
            <p className="fineprint">
              Lieferantennummer:{" "}
              {supplier.number
                ? `L-${String(supplier.number).padStart(5, "0")}`
                : "wird automatisch vergeben"}
            </p>
            <label className="checkline">
              <input
                type="checkbox"
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
              for (const key of ["tax_rate", "deposit_tax_rate"]) {
                if (f.get(key) !== "") patch[key] = Number(f.get(key));
              }
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
            {(
              [
                ["tax_rate", "Umsatzsteuer Artikel"],
                ["deposit_tax_rate", "Umsatzsteuer Pfand"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <select aria-label={label} name={key} defaultValue="">
                  <option value="">Unverändert</option>
                  <option value="19">19 %</option>
                  <option value="7">7 %</option>
                  <option value="0">0 % (nur begründeter Sonderfall)</option>
                </select>
              </label>
            ))}
            <p className="fineprint">
              Steueränderungen gelten für künftige Verkäufe. Die Bruttopreise
              und abgeschlossene Belege bleiben unverändert.
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
          title="Zeitraum abschließen"
          close={() => setConfirmClose(false)}
        >
          <p>
            Auswertung für {period}. Im Einrichtungsmodus kann der Abschluss
            nach weiteren Buchungen aktualisiert werden.
          </p>
          <MoneyField
            label="Kassenanfangsbestand (€)"
            value={opening}
            onChange={(v) => setOpening(v || 0)}
          />
          <MoneyField
            label="Gezählter Bargeldbestand (€)"
            value={counted}
            onChange={(v) => setCounted(v || 0)}
          />
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              if (
                await act(
                  "closing",
                  { value: { kind: mode, period, opening, counted } },
                  "Abschluss gespeichert.",
                )
              )
                setConfirmClose(false);
            }}
          >
            Abschluss speichern
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
      <NumberInput
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
      <NumberInput
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
