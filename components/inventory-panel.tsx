"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ClipboardList,
  Plus,
  Check,
  ArrowLeft,
  ArrowRight,
  Download,
  Package,
  AlertTriangle,
  Search,
} from "lucide-react";
import { ProductPhoto } from "./product-photo";
import { categories } from "@/lib/catalog";
import { searchInventoryProducts } from "@/lib/inventory-catalog";
import { euro, pack } from "@/lib/money";
import {
  inventoryReasons,
  quantityLabel,
  inventoryValue,
  reasonLabel,
} from "@/lib/inventory";
import type {
  InventoryRun,
  InventoryLine,
  StockAdjustment,
  InventoryEvent,
} from "@/lib/inventory";
import type { Product } from "@/lib/types";
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(),
  );
const statusName = {
  counting: "In Zählung",
  review: "Zur Prüfung",
  applied: "Bestand übernommen",
  cancelled: "Abgebrochen",
};
type Data = {
  runs: InventoryRun[];
  products: Product[];
  lines: InventoryLine[];
  events: InventoryEvent[];
  adjustments: StockAdjustment[];
  owner: boolean;
  canAdjust: boolean;
};
export default function InventoryPanel({
  onStockChange,
}: {
  onStockChange: () => Promise<void>;
}) {
  const [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState(""),
    [lineId, setLineId] = useState(""),
    [tab, setTab] = useState("counts"),
    [category, setCategory] = useState("Alle Getränke"),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [dialog, setDialog] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [addId, setAddId] = useState(() => crypto.randomUUID());
  const load = useCallback(async () => {
    const r = await fetch(
      "/api/inventory" + (selected ? "?id=" + selected : ""),
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
    return d as Data;
  }, [selected]);
  useEffect(() => {
    let active = true;
    fetch("/api/inventory" + (selected ? "?id=" + selected : ""), {
      cache: "no-store",
    })
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
  }, [selected]);
  const act = async (action: string, value: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      if (["apply", "adjust", "reverse", "add"].includes(action))
        await onStockChange();
      return d;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
      return null;
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <section className="panel">
        {message || "Inventur wird geladen …"}
      </section>
    );
  const run = data.runs.find((r) => r.id === selected);
  const lines = [...data.lines].sort((a, b) =>
    a.product_snapshot.name.localeCompare(b.product_snapshot.name, "de"),
  );
  const filtered = lines.filter(
    (l) =>
      (category === "Alle Getränke" ||
        l.product_snapshot.category === category) &&
      `${l.product_snapshot.name} ${l.product_snapshot.sku} ${l.product_snapshot.barcode}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const line =
    filtered.find((l) => l.id === lineId) ||
    filtered.find((l) => l.counted_units === null) ||
    filtered[0];
  const product = data.products.find((p) => p.id === line?.product_id);
  const counted = lines.filter((l) => l.counted_units !== null).length,
    missing = lines.filter(
      (l) => (l.counted_units || 0) > 0 && l.cost_net_cents === null,
    ).length;
  const value = lines.reduce(
    (sum, l) =>
      sum +
      (inventoryValue(
        run?.status === "applied" ? l.applied_units : l.counted_units,
        l.product_snapshot.pack_count,
        l.cost_net_cents,
      ) || 0),
    0,
  );
  const choose = (id: string) => {
    setData((d) => (d ? { ...d, lines: [], events: [] } : d));
    setSelected(id);
    setLineId("");
    setCategory("Alle Getränke");
    setSearch("");
    setMessage("");
  };
  const report = run ? `/api/inventory/${run.id}?format=pdf` : "";
  return (
    <div className="inventory-workspace">
      <div className="category-tabs">
        <button
          className={tab === "counts" ? "selected" : ""}
          onClick={() => setTab("counts")}
        >
          <ClipboardList size={17} /> Inventuren
        </button>
        <button
          className={tab === "adjustments" ? "selected" : ""}
          onClick={() => setTab("adjustments")}
        >
          <Package size={17} /> Bruch & Bestandskorrekturen
        </button>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {tab === "counts" ? (
        <>
          <div className="panel inventory-intro">
            <div>
              <span className="eyebrow">ZÄHLEN. PRÜFEN. ÜBERNEHMEN.</span>
              <h2>Dein Bestand, nachvollziehbar.</h2>
              <p>
                Zählungen verändern den Bestand erst nach Prüfung und
                Bestätigung durch den Inhaber. Auch Nullbestände müssen
                ausdrücklich gezählt werden.
              </p>
            </div>
            <button
              className="button"
              disabled={
                busy ||
                data.runs.some((r) => ["counting", "review"].includes(r.status))
              }
              onClick={() => setDialog("start")}
            >
              <Plus size={18} /> Inventur starten
            </button>
          </div>
          <div className="inventory-runs">
            {data.runs.map((r) => (
              <button
                key={r.id}
                className={
                  "panel inventory-run " + (selected === r.id ? "selected" : "")
                }
                onClick={() => choose(r.id)}
              >
                <small>
                  INV-{String(r.number).padStart(5, "0")} · {r.inventory_date}
                </small>
                <strong>{r.title}</strong>
                <span>
                  {r.location} · {statusName[r.status]}
                </span>
              </button>
            ))}
          </div>
          {!run && (
            <div className="panel empty">
              <ClipboardList size={36} />
              <h3>Eine Inventur auswählen oder starten</h3>
              <p>
                Alle aktiven Artikel und vorhandene Restbestände werden in die
                Zählliste übernommen.
              </p>
            </div>
          )}
          {run && (
            <>
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">
                      INV-{String(run.number).padStart(5, "0")} ·{" "}
                      {statusName[run.status]}
                    </span>
                    <h2>{run.title}</h2>
                    <p>
                      {run.location} · gestartet von {run.created_name}
                    </p>
                  </div>
                  <div className="inline-actions">
                    <a
                      className="button secondary"
                      href={report}
                      target="_blank"
                    >
                      <Download size={17} /> Inventurbericht PDF
                    </a>
                    <a
                      className="text-link"
                      href={`/api/inventory/${run.id}?format=csv`}
                    >
                      CSV / Steuerberater
                    </a>
                  </div>
                </div>
                <div className="inventory-metrics">
                  <div>
                    <strong>
                      {counted} / {lines.length}
                    </strong>
                    <span>Positionen gezählt</span>
                  </div>
                  <div>
                    <strong>
                      {
                        lines.filter(
                          (l) =>
                            l.book_units !== null &&
                            l.counted_units !== null &&
                            l.book_units !== l.counted_units,
                        ).length
                      }
                    </strong>
                    <span>Differenzen</span>
                  </div>
                  <div>
                    <strong>{euro(value)}</strong>
                    <span>
                      {missing
                        ? "Teilwert · " + missing + " Bewertungen offen"
                        : "Warenwert netto, ohne Pfand"}
                    </span>
                  </div>
                </div>
                {run.status === "counting" && (
                  <div className="inline-actions">
                    <button
                      className="button secondary"
                      onClick={() => {
                        setAddId(crypto.randomUUID());
                        setDialog("add");
                      }}
                    >
                      Artikel ergänzen
                    </button>
                    <button
                      className="button"
                      disabled={
                        busy || counted !== lines.length || !lines.length
                      }
                      onClick={async () => {
                        if (
                          await act("submit", {
                            run_id: run.id,
                            revision: run.revision,
                          })
                        )
                          setMessage(
                            "Zählung zur Prüfung vorgelegt. Der Bestand ist noch unverändert.",
                          );
                      }}
                    >
                      <Check size={17} /> Zur Prüfung vorlegen
                    </button>
                  </div>
                )}
                {run.status === "review" && (
                  <p className="notice">
                    Die Zählung ist zur Prüfung gesperrt.{" "}
                    {missing
                      ? `${missing} Einkaufswerte fehlen noch. Vor Übernahme wieder öffnen und ergänzen.`
                      : "Der Inhaber kann jetzt den neuen Bestand übernehmen."}{" "}
                    Laufende Warenbewegungen seit jeder Zählung werden bei
                    bekannten Beständen berücksichtigt.
                  </p>
                )}
                {data.owner && run.status === "review" && (
                  <div className="inline-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        act("reopen", {
                          run_id: run.id,
                          revision: run.revision,
                        })
                      }
                    >
                      Zur Zählung zurück
                    </button>
                    <button
                      className="button"
                      disabled={busy || !!missing}
                      onClick={() => {
                        setConfirmed(false);
                        setDialog("apply");
                      }}
                    >
                      Bestand übernehmen …
                    </button>
                  </div>
                )}
                {data.owner && ["counting", "review"].includes(run.status) && (
                  <button
                    className="text-link"
                    onClick={() => {
                      setConfirmed(false);
                      setDialog("cancel");
                    }}
                  >
                    Inventur abbrechen …
                  </button>
                )}
                {run.status === "applied" && (
                  <p className="notice">
                    Am {new Date(run.applied_at!).toLocaleString("de-DE")} von{" "}
                    {run.applied_name} übernommen. Bericht und Zählprotokoll
                    bleiben erhalten.
                  </p>
                )}
              </div>
              <div className="table-toolbar">
                <input
                  aria-label="Inventurartikel suchen"
                  placeholder="Artikel, Artikelnummer oder Barcode"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="Inventurkategorie"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setLineId("");
                  }}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => load().catch((e) => setMessage(e.message))}
                >
                  Aktualisieren
                </button>
              </div>
              {run.status === "counting" && line && product && (
                <CountCard
                  key={`${line.id}-${line.revision}-${product.stock_version}`}
                  line={line}
                  product={product}
                  busy={busy}
                  position={filtered.indexOf(line) + 1}
                  total={filtered.length}
                  move={(step) =>
                    setLineId(
                      filtered[
                        Math.max(
                          0,
                          Math.min(
                            filtered.length - 1,
                            filtered.indexOf(line) + step,
                          ),
                        )
                      ].id,
                    )
                  }
                  save={async (v) => {
                    if (
                      await act("count", {
                        ...v,
                        run_id: run.id,
                        line_id: line.id,
                        revision: line.revision,
                        stock_version: product.stock_version || 0,
                      })
                    ) {
                      const next = filtered[filtered.indexOf(line) + 1];
                      if (next) setLineId(next.id);
                      setMessage(
                        "Zählung gespeichert. Bestand noch nicht verändert.",
                      );
                      return true;
                    }
                    return false;
                  }}
                />
              )}
              <div className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Artikel / Gebinde</th>
                      <th>Soll bei Zählung</th>
                      <th>Gezählt</th>
                      <th>Differenz</th>
                      <th>Grund / Zählung</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.product_snapshot.name}</strong>
                          <small>
                            {l.product_snapshot.sku} ·{" "}
                            {pack(l.product_snapshot)}
                          </small>
                        </td>
                        <td>
                          {quantityLabel(
                            l.book_units,
                            l.product_snapshot.pack_count,
                          )}
                        </td>
                        <td>
                          {l.counted_units === null
                            ? "Noch offen"
                            : quantityLabel(
                                l.counted_units,
                                l.product_snapshot.pack_count,
                              )}
                        </td>
                        <td>
                          {l.counted_units === null
                            ? "—"
                            : l.book_units === null
                              ? "Erstbestand"
                              : quantityLabel(
                                  l.counted_units - l.book_units,
                                  l.product_snapshot.pack_count,
                                )}
                        </td>
                        <td>
                          {reasonLabel(l.reason) || "—"}
                          <small>
                            {l.counted_name}
                            {l.counted_at
                              ? " · " +
                                new Date(l.counted_at).toLocaleString("de-DE")
                              : ""}
                          </small>
                          {l.note && <small>{l.note}</small>}
                        </td>
                        <td>
                          {run.status === "counting" && (
                            <button
                              className="text-link"
                              onClick={() => {
                                setLineId(l.id);
                                document
                                  .getElementById("inventory-count-card")
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                              }}
                            >
                              Zählen
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="panel">
                <summary>
                  Zähl- und Änderungsprotokoll ({data.events.length})
                </summary>
                {data.events.map((e) => (
                  <p key={e.id}>
                    {new Date(e.created_at).toLocaleString("de-DE")} ·{" "}
                    {e.actor_name} ·{" "}
                    {{
                      started: "Inventur gestartet",
                      counted: "Zählposition gespeichert",
                      article_added: "Artikel ergänzt",
                      submit: "Zur Prüfung",
                      reopen: "Wieder geöffnet",
                      apply: "Bestand übernommen",
                      cancel: "Abgebrochen",
                    }[e.action] || e.action}
                    {e.line_id
                      ? " · " +
                        lines.find((l) => l.id === e.line_id)?.product_snapshot
                          .name
                      : ""}
                  </p>
                ))}
              </details>
            </>
          )}
        </>
      ) : (
        <>
          <div className="panel">
            <span className="eyebrow">BESTANDSBEWEGUNGEN MIT BELEG</span>
            <h2>Bruch, Schwund & Entnahmen</h2>
            <p>
              Jede Buchung dokumentiert Artikel, Menge, Grund, Ereignisdatum,
              Mitarbeiter und Bestand vorher / nachher. Einzelne Flaschen oder
              Dosen lassen sich auch aus einem Gebinde abbuchen.
            </p>
          </div>
          {data.canAdjust ? (
            <AdjustmentForm
              products={data.products}
              owner={data.owner}
              busy={busy}
              save={async (v) => {
                const d = await act("adjust", v);
                if (d) setMessage("Bestand korrigiert und Beleg erstellt.");
                return !!d;
              }}
            />
          ) : (
            <p className="notice">
              Du hast keinen Zugriff auf Bestandskorrekturen. Die Freigabe
              erfolgt in den Mitarbeiterrechten.
            </p>
          )}
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Beleg / Datum</th>
                  <th>Artikel</th>
                  <th>Bewegung</th>
                  <th>Grund / Bearbeiter</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.adjustments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      BK-{String(a.number).padStart(5, "0")}
                      <small>{a.occurred_on}</small>
                    </td>
                    <td>
                      {a.product_snapshot.name}
                      <small>
                        {quantityLabel(
                          a.before_units,
                          a.product_snapshot.pack_count,
                        )}{" "}
                        →{" "}
                        {quantityLabel(
                          a.after_units,
                          a.product_snapshot.pack_count,
                        )}
                      </small>
                    </td>
                    <td>
                      {quantityLabel(
                        a.delta_units,
                        a.product_snapshot.pack_count,
                      )}
                    </td>
                    <td>
                      {reasonLabel(a.reason)}
                      <small>
                        {a.note ? `${a.note} · ` : ""}
                        {a.actor_name}
                      </small>
                    </td>
                    <td>
                      <a
                        className="text-link"
                        target="_blank"
                        href={`/api/inventory/${a.id}?kind=adjustment&format=pdf`}
                      >
                        Beleg PDF
                      </a>
                      {data.owner &&
                        !a.reverses_id &&
                        !data.adjustments.some(
                          (x) => x.reverses_id === a.id,
                        ) && (
                          <button
                            className="text-link"
                            onClick={() => setDialog("reverse:" + a.id)}
                          >
                            Gegenbuchung …
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.adjustments.length && <p>Noch keine Bestandskorrekturen.</p>}
          </div>
        </>
      )}
      {dialog && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Inventuraktion"
          >
            <div className="panel-head">
              <h2>
                {dialog === "start"
                  ? "Neue Inventur"
                  : dialog === "add"
                    ? "Artikel ergänzen"
                    : dialog === "apply"
                      ? "Neuen Warenbestand festlegen?"
                      : dialog === "cancel"
                        ? "Inventur abbrechen?"
                        : "Gegenbuchung dokumentieren"}
              </h2>
              <button disabled={busy} onClick={() => setDialog("")}>
                Schließen
              </button>
            </div>
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            {dialog === "start" && (
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const id = crypto.randomUUID();
                  if (
                    await act("start", {
                      run_id: id,
                      title: f.get("title"),
                      location: f.get("location"),
                      inventory_date: today(),
                      notes: f.get("notes"),
                    })
                  ) {
                    choose(id);
                    setDialog("");
                  }
                }}
              >
                <label>
                  Bezeichnung
                  <input
                    name="title"
                    required
                    defaultValue={"Inventur " + today()}
                    maxLength={150}
                  />
                </label>
                <label>
                  Lagerort / Filiale
                  <input
                    name="location"
                    required
                    defaultValue="Getränkemarkt Heilbronn"
                    maxLength={150}
                  />
                </label>
                <p>
                  Zählbeginn: {today()}. Der Bericht hält die tatsächlichen
                  Zähl- und Übernahmezeitpunkte fest.
                </p>
                <label>
                  Hinweise
                  <textarea name="notes" maxLength={1500} />
                </label>
                <button className="button" disabled={busy}>
                  Zählliste mit allen Artikeln erstellen
                </button>
              </form>
            )}
            {dialog === "add" && run && (
              <AddArticle
                products={data.products.filter(
                  (p) => !lines.some((l) => l.product_id === p.id),
                )}
                busy={busy}
                save={async (v) => {
                  const d = await act("add", {
                    ...v,
                    id: addId,
                    run_id: run.id,
                  });
                  if (d) {
                    setDialog("");
                    setMessage(
                      "Artikel ist in der Zählliste. Neu angelegte Artikel bleiben bis zur Freigabe im Artikelbereich intern.",
                    );
                  }
                }}
              />
            )}
            {["apply", "cancel"].includes(dialog) && run && (
              <>
                <p>
                  {dialog === "apply"
                    ? "Die gezählten Mengen ersetzen nach Abgleich mit zwischenzeitlichen Warenbewegungen den aktuellen Warenbestand. Diese Übernahme wird protokolliert und kann nicht überschrieben werden."
                    : "Die Zählung wird abgeschlossen, ohne den Bestand zu ändern. Das Protokoll bleibt erhalten."}
                </p>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{" "}
                  {dialog === "apply"
                    ? "Ich habe Mengen, Differenzen, Gründe und Einkaufswerte geprüft und möchte den neuen Bestand festlegen."
                    : "Ich möchte die Inventur ohne Übernahme abbrechen."}
                </label>
                <button
                  className="button full"
                  disabled={busy || !confirmed}
                  onClick={async () => {
                    if (
                      await act(dialog, {
                        run_id: run.id,
                        revision: run.revision,
                        ...(dialog === "apply"
                          ? { confirmation: "BESTAND ÜBERNEHMEN" }
                          : {}),
                      })
                    ) {
                      setDialog("");
                      setMessage(
                        dialog === "apply"
                          ? "Neuer Bestand übernommen. Inventurbericht ist verfügbar."
                          : "Inventur ohne Bestandsänderung abgebrochen.",
                      );
                    }
                  }}
                >
                  {dialog === "apply"
                    ? "Ja, neuen Warenbestand festlegen"
                    : "Ja, abbrechen"}
                </button>
              </>
            )}
            {dialog.startsWith("reverse:") && (
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    await act("reverse", {
                      id: crypto.randomUUID(),
                      reverses_id: dialog.split(":")[1],
                      note: f.get("note"),
                      reference: "",
                      occurred_on: today(),
                    })
                  ) {
                    setDialog("");
                    setMessage(
                      "Gegenbuchung erstellt. Ursprünglicher Beleg bleibt erhalten.",
                    );
                  }
                }}
              >
                <p>
                  Die ursprüngliche Menge wird gegenläufig gebucht. Bitte nur
                  für eine tatsächlich fehlerhafte Buchung verwenden.
                </p>
                <label>
                  Begründung
                  <textarea
                    name="note"
                    required
                    minLength={3}
                    maxLength={1500}
                  />
                </label>
                <button className="button" disabled={busy}>
                  Gegenbuchung verbindlich speichern
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function CountCard({
  line,
  product,
  busy,
  position,
  total,
  move,
  save,
}: {
  line: InventoryLine;
  product: Product;
  busy: boolean;
  position: number;
  total: number;
  move: (s: number) => void;
  save: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [packs, setPacks] = useState(
      line.counted_units === null
        ? ""
        : String(Math.floor(line.counted_units / product.pack_count)),
    ),
    [loose, setLoose] = useState(
      line.counted_units === null
        ? "0"
        : String(line.counted_units % product.pack_count),
    ),
    [cost, setCost] = useState(
      line.cost_net_cents === null
        ? ""
        : (line.cost_net_cents / 100).toFixed(2),
    ),
    [reason, setReason] = useState(line.reason),
    [note, setNote] = useState(line.note);
  const current =
    product.stock === null
      ? null
      : product.stock * product.pack_count + (product.loose_stock || 0);
  const amount =
    packs === "" ? null : Number(packs) * product.pack_count + Number(loose);
  const diff = amount === null || current === null ? null : amount - current;
  return (
    <section className="panel inventory-count-card" id="inventory-count-card">
      <div className="inventory-count-heading">
        <ProductPhoto product={product} />
        <div>
          <span className="eyebrow">
            POSITION {position} VON {total} · {product.category}
          </span>
          <h2>{product.name}</h2>
          <p>
            {product.sku} · {pack(product)}
          </p>
          <small>
            Aktueller Buchbestand: {quantityLabel(current, product.pack_count)}
          </small>
        </div>
      </div>
      <form
        className="form-grid two-columns"
        onSubmit={async (e) => {
          e.preventDefault();
          await save({
            packs: Number(packs),
            loose: Number(loose),
            cost_net_cents:
              cost === ""
                ? null
                : Math.round(Number(cost.replace(",", ".")) * 100),
            reason,
            note,
          });
        }}
      >
        <label className="inventory-number">
          {product.pack_count === 1 ? "Gezählte Stück" : "Volle Gebinde"}
          <input
            autoFocus
            aria-label="Gezählte Gebinde"
            type="number"
            inputMode="numeric"
            min="0"
            max="1000000"
            step="1"
            required
            value={packs}
            onChange={(e) => setPacks(e.target.value)}
          />
        </label>
        {product.pack_count > 1 && (
          <label className="inventory-number">
            Lose Flaschen / Dosen
            <input
              aria-label="Lose Einheiten"
              type="number"
              inputMode="numeric"
              min="0"
              max={product.pack_count - 1}
              step="1"
              required
              value={loose}
              onChange={(e) => setLoose(e.target.value)}
            />
            <small>
              Zusätzlich zu vollen Gebinden, maximal {product.pack_count - 1}.
            </small>
          </label>
        )}
        <p className="notice span-two">
          {current === null
            ? "Erste Bestandsfestlegung: Bisher ist kein Sollbestand bekannt."
            : diff === null
              ? "Menge eingeben."
              : `Differenz zum Buchbestand: ${quantityLabel(diff, product.pack_count)}.`}
        </p>
        {diff !== null && diff !== 0 && (
          <label>
            Ursache der Differenz
            <select
              aria-label="Differenzgrund"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">Bitte wählen</option>
              {Object.entries(inventoryReasons).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Netto-Einkaufswert je {product.pack_count === 1 ? "Stück" : "Gebinde"}{" "}
          (€)
          <input
            aria-label="Netto-Einkaufswert"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <small>
            Ohne Pfand. Darf beim Zählen offen bleiben; vor Übernahme ergänzen.
          </small>
        </label>
        <label>
          Notiz / Nachweis
          <textarea
            aria-label="Inventurnotiz"
            maxLength={1500}
            required={reason === "other"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="inline-actions span-two">
          <button
            type="button"
            className="button secondary"
            disabled={busy || position === 1}
            onClick={() => move(-1)}
          >
            <ArrowLeft size={17} /> Zurück
          </button>
          <button className="button" disabled={busy}>
            <Check size={18} /> Speichern & weiter
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || position === total}
            onClick={() => move(1)}
          >
            Weiter <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </section>
  );
}
function AddArticle({
  products,
  busy,
  save,
}: {
  products: Product[];
  busy: boolean;
  save: (v: Record<string, unknown>) => Promise<void>;
}) {
  const [existing, setExisting] = useState("");
  return (
    <form
      className="form-grid two-columns"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const p = products.find((p) => p.id === existing);
        await save({
          ...(p ? { product_id: p.id } : {}),
          name: p?.name || f.get("name"),
          category: p?.category || f.get("category"),
          pack_count: p?.pack_count || Number(f.get("pack_count")),
          volume_ml: p?.volume_ml ?? Number(f.get("volume_ml")),
          barcode: p?.barcode || String(f.get("barcode") || ""),
        });
      }}
    >
      <label className="span-two">
        Vorhandenen Artikel ergänzen
        <select value={existing} onChange={(e) => setExisting(e.target.value)}>
          <option value="">Neuen Artikel anlegen</option>
          {products.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name} · {pack(p)}
            </option>
          ))}
        </select>
      </label>
      {!existing && (
        <>
          <label>
            Artikelname
            <input name="name" minLength={2} maxLength={150} required />
          </label>
          <label>
            Kategorie
            <select name="category" aria-label="Kategorie">
              {categories.slice(1).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Einheiten je Gebinde
            <input
              name="pack_count"
              type="number"
              min="1"
              max="1000"
              step="1"
              defaultValue="1"
              required
            />
          </label>
          <label>
            Inhalt je Einheit (ml)
            <input
              name="volume_ml"
              type="number"
              min="0"
              max="1000000"
              step="1"
              defaultValue="0"
              required
            />
          </label>
          <label>
            Barcode / EAN (optional)
            <input name="barcode" maxLength={80} />
          </label>
          <p>
            Der Artikel erhält automatisch eine Artikelnummer und wird intern in
            Artikel & Lager angelegt. Preis, Pfand und Shopfreigabe ergänzt der
            Inhaber dort.
          </p>
        </>
      )}
      <button className="button span-two" disabled={busy}>
        Zur Inventur hinzufügen
      </button>
    </form>
  );
}
function AdjustmentForm({
  products,
  owner,
  busy,
  save,
}: {
  products: Product[];
  owner: boolean;
  busy: boolean;
  save: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [pid, setPid] = useState(""),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(6),
    [reason, setReason] = useState("breakage"),
    [direction, setDirection] = useState(-1),
    [unit, setUnit] = useState("single"),
    [qty, setQty] = useState("1"),
    [id, setId] = useState(() => crypto.randomUUID());
  const p = products.find((x) => x.id === pid);
  const matches = searchInventoryProducts(products, query);
  const delta =
    Number(qty) * (unit === "pack" ? p?.pack_count || 1 : 1) * direction;
  return (
    <form
      className="panel form-grid two-columns"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !p || p.stock === null) return;
        const form = e.currentTarget;
        const f = new FormData(form);
        if (
          await save({
            id,
            product_id: pid,
            delta_units: delta,
            reason,
            note: f.get("note"),
            reference: f.get("reference"),
            occurred_on: f.get("date"),
          })
        ) {
          form.reset();
          setId(crypto.randomUUID());
          setQty("1");
        }
      }}
    >
      <section
        className="span-two adjustment-catalog"
        aria-label="Artikel auswählen"
      >
        <label>
          Artikel suchen
          <span className="adjustment-search">
            <Search size={19} aria-hidden="true" />
            <input
              type="search"
              aria-label="Korrekturartikel suchen"
              placeholder="Name, Marke, Artikelnummer oder EAN"
              autoComplete="off"
              value={query}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setPid("");
                setLimit(6);
              }}
            />
          </span>
        </label>
        {p ? (
          <div className="adjustment-selection">
            <Check size={20} aria-hidden="true" />
            <div>
              <strong>{p.name}</strong>
              <span>
                {pack(p)} · Art.-Nr. {p.sku}
              </span>
              <span>
                Bestand:{" "}
                {quantityLabel(
                  p.stock === null
                    ? null
                    : p.stock * p.pack_count + (p.loose_stock || 0),
                  p.pack_count,
                )}
              </span>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setPid("")}
            >
              Artikel ändern
            </button>
          </div>
        ) : (
          <>
            <p className="fineprint" role="status">
              {matches.length
                ? `${matches.length} Artikel gefunden · Bitte den passenden Artikel auswählen.`
                : "Keine passenden Artikel gefunden. Suche nach Name, Artikelnummer oder EAN ändern."}
            </p>
            <ul className="adjustment-results" aria-label="Gefundene Artikel">
              {matches.slice(0, limit).map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={busy}
                    data-product-id={product.id}
                    onClick={() => setPid(product.id)}
                  >
                    <span>
                      <strong>{product.name}</strong>
                      <small>
                        {pack(product)} · Art.-Nr. {product.sku}
                        {!product.active ? " · Inaktiv" : ""}
                      </small>
                    </span>
                    <span className="adjustment-result-stock">
                      <small>Bestand</small>
                      <strong>
                        {quantityLabel(
                          product.stock === null
                            ? null
                            : product.stock * product.pack_count +
                                (product.loose_stock || 0),
                          product.pack_count,
                        )}
                      </strong>
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {matches.length > limit && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setLimit(limit + 12)}
              >
                Weitere Artikel anzeigen ({matches.length - limit})
              </button>
            )}
          </>
        )}
      </section>
      <label>
        Grund
        <select
          aria-label="Korrekturgrund"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setDirection(-1);
          }}
        >
          {Object.entries(inventoryReasons).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {owner && ["found", "count_error", "other"].includes(reason) && (
        <label>
          Richtung
          <select
            value={direction}
            onChange={(e) => setDirection(Number(e.target.value))}
          >
            <option value={-1}>Bestand reduzieren</option>
            <option value={1}>Bestand erhöhen</option>
          </select>
        </label>
      )}
      <label>
        Menge
        <input
          type="number"
          aria-label="Korrekturmenge"
          min="1"
          max="1000000"
          step="1"
          required
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </label>
      <label>
        Einheit
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="single">Einzelne Flasche / Dose / Stück</option>
          <option value="pack">Ganzes Gebinde</option>
        </select>
      </label>
      <label>
        Ereignisdatum
        <input
          name="date"
          type="date"
          defaultValue={today()}
          max={today()}
          required
        />
      </label>
      <label>
        Referenz / Belegnummer (optional)
        <input name="reference" maxLength={300} />
      </label>
      <label className="span-two">
        Begründung / Dokumentation (optional)
        <textarea
          name="note"
          aria-label="Korrekturbegründung"
          maxLength={1500}
          placeholder="Was ist passiert? Bei Geschenken z. B. Anlass und Empfänger; bei Bruch betroffene Ware."
        />
      </label>
      {p && (
        <p className="notice span-two">
          Bestand:{" "}
          {quantityLabel(
            p.stock === null
              ? null
              : p.stock * p.pack_count + (p.loose_stock || 0),
            p.pack_count,
          )}
          . Buchung: {quantityLabel(delta, p.pack_count)}.{" "}
          {p.stock === null ? "Bitte zuerst inventarisieren." : ""}
        </p>
      )}
      <p className="fineprint span-two">
        Die Buchung ist ein Bestandsnachweis. Die steuerliche Behandlung von
        Geschenken oder Privatentnahmen erfolgt gesondert in der Buchführung.
      </p>
      <button
        className="button span-two"
        disabled={busy || !p || p.stock === null}
      >
        <AlertTriangle size={17} /> Bestandsänderung verbindlich buchen
      </button>
    </form>
  );
}
