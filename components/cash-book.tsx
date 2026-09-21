"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CashBookReport, CashDay, CashCommand } from "@/lib/cash-book";
import { berlinDate } from "@/lib/finance-report";
import { euro } from "@/lib/money";
import { useDialog } from "./use-dialog";
type CashData = {
  operatorId: string;
  report: CashBookReport;
  allDays: CashDay[];
  settings: { live_mode?: boolean };
  readOnly: boolean;
  pending: {
    id: string;
    number: number;
    amount_cents: number;
    paid_at: string;
    mode: string;
  }[];
};
const today = () => berlinDate(new Date().toISOString());
const cents = (s: string) =>
  /^\d+(?:[.,]\d{1,2})?$/.test(s.trim())
    ? Math.round(Number(s.replace(",", ".")) * 100)
    : NaN;
const inputMoney = (v: number) => String(v / 100).replace(".", ",");
export default function CashBook({
  period = today(),
  onChange,
}: {
  period?: string;
  onChange?: () => void;
}) {
  const [data, setData] = useState<CashData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [opening, setOpening] = useState(""),
    [counted, setCounted] = useState(""),
    [next, setNext] = useState(""),
    [note, setNote] = useState(""),
    [transfer, setTransfer] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState<CashCommand | null>(null);
  const [mode, setMode] = useState<"overview" | "movement" | "close">(
      "overview",
    ),
    [direction, setDirection] = useState("out"),
    [amount, setAmount] = useState(""),
    [description, setDescription] = useState(""),
    [category, setCategory] = useState("Betriebsausgabe"),
    [reference, setReference] = useState(""),
    [documentDate, setDocumentDate] = useState(today()),
    [file, setFile] = useState<CashCommand["document"]>(),
    [reverse, setReverse] = useState("");
  const lock = useRef(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const restorePending = useCallback((d: CashData) => {
    try {
      const saved = sessionStorage.getItem("elias-cash-" + d.operatorId);
      if (saved) setPending(JSON.parse(saved));
    } catch {}
  }, []);
  const load = useCallback(async () => {
    const r = await fetch("/api/cash-book?period=" + period, {
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
    setConfirmed(false);
    setNeedsRefresh(false);
    return d as CashData;
  }, [period]);
  useEffect(() => {
    let active = true;
    fetch("/api/cash-book?period=" + period, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (active) {
          setData(d);
          restorePending(d);
          setError("");
          setMode("overview");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [period, restorePending]);
  async function act(value: Omit<CashCommand, "request_id"> | CashCommand) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const command =
      "request_id" in value
        ? value
        : { ...value, request_id: crypto.randomUUID() };
    setPending(command);
    const storageKey = "elias-cash-" + data?.operatorId;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(command));
      const r = await fetch("/api/cash-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status < 500) {
          setPending(null);
          sessionStorage.removeItem(storageKey);
        }
        throw Error(d.error || "Speichern fehlgeschlagen.");
      }
      setPending(null);
      sessionStorage.removeItem(storageKey);
      setMode("overview");
      setCounted("");
      setConfirmed(false);
      setNote("");
      setReverse("");
      try {
        await load();
        onChange?.();
      } catch {
        setNeedsRefresh(true);
        setError(
          "Die Buchung ist gespeichert. Bitte die Ansicht aktualisieren, bevor du weiterbuchst.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Verbindung unterbrochen. Vorgang erneut prüfen.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  if (!data)
    return (
      <section className="panel">
        <h2>Kassenbuch</h2>
        <p role="status">{error || "Kassenbestand wird geladen …"}</p>
      </section>
    );
  const current = data.allDays.find(
    (d) => !d.closed_at && d.test_mode === !data.settings.live_mode,
  );
  const day = data.report.days.find((d) => d.id === current?.id);
  const last = data.allDays
    .filter((d) => d.test_mode === !data.settings.live_mode)
    .at(-1);
  const suggested = last?.next_opening_cents ?? 25000;
  const active = !!day && !day.closed_at;
  const rows = data.report.entries.filter((e) => e.day_id === day?.id);
  const balance = rows.at(-1)?.balance_cents ?? 0;
  const revision = rows.at(-1)?.number ?? 0;
  const count = cents(counted),
    nextAmount = cents(next);
  const difference = Number.isFinite(count) ? count - balance : null;
  const physicalTransfer =
    Number.isFinite(count) && Number.isFinite(nextAmount)
      ? nextAmount - count
      : null;
  const canWrite = !data.readOnly && !busy && !pending && !needsRefresh;
  function exportFile(format: "pdf" | "csv", download = false) {
    const url = `/api/cash-book?period=${period}&format=${format}${download ? "&download=1" : ""}`;
    if (format === "pdf" && !download)
      window.dispatchEvent(
        new CustomEvent("elias:pdf-preview", { detail: url }),
      );
    else {
      const a = document.createElement("a");
      a.href = url;
      a.download = `Elias-Kassenbuch-${period}.${format}`;
      a.click();
    }
  }
  return (
    <section className="panel cash-book-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">BARGELD · {data.report.mode}</span>
          <h2>Kassenabschluss · Tagesbericht</h2>
        </div>
        <button
          type="button"
          className="button secondary small"
          disabled={busy}
          onClick={() => load().catch((e) => setError(e.message))}
        >
          Aktualisieren
        </button>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {pending && !busy && (
        <div className="notice">
          Der Speicherstatus ist unklar. Bitte denselben Vorgang prüfen, bevor
          du neu buchst.
          <button className="button" onClick={() => act(pending)}>
            Speicherstatus erneut prüfen
          </button>
        </div>
      )}
      <div className="cash-book-summary">
        <div>
          <small>Anfangsbestand</small>
          <strong>
            {euro(
              day?.opening_cents ?? data.report.days[0]?.opening_cents ?? 0,
            )}
          </strong>
        </div>
        <div>
          <small>
            {active ? "Soll-Bargeldbestand" : "Buchbestand am Zeitraumende"}
          </small>
          <strong>{euro(active ? balance : data.report.ending)}</strong>
        </div>
        <div>
          <small>Dokumentierte Zähldifferenz</small>
          <strong>{euro(data.report.difference)}</strong>
        </div>
      </div>
      <p className="fineprint">
        Barverkäufe, Pfandrücknahmen und Barstornos werden automatisch erfasst.
        EC / SumUp verändert den Bargeldbestand nicht. Einlagen, Entnahmen und
        Geldüberträge sind kein zusätzlicher Umsatz.
      </p>
      {!data.readOnly &&
        !current &&
        !data.allDays.some((d) => d.day === today()) &&
        period === today() && (
          <form
            className="form-grid two-columns"
            onSubmit={(e) => {
              e.preventDefault();
              void act({
                action: "open",
                opening_cents: cents(opening || inputMoney(suggested)),
                note,
              });
            }}
          >
            <label>
              Anfangsbestand heute (€)
              <input
                required
                inputMode="decimal"
                value={opening || inputMoney(suggested)}
                onChange={(e) => setOpening(e.target.value)}
              />
            </label>
            <label>
              Erläuterung bei abweichendem Vortrag
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
              />
            </label>
            <p className="fineprint span-two">
              Tatsächlichen Bestand zum Tagesbeginn bestätigen. Bereits heute
              gebuchte Barbons werden beim ersten Einrichten zusätzlich
              übernommen.
            </p>
            <button
              className="button"
              disabled={
                !canWrite ||
                !Number.isFinite(cents(opening || inputMoney(suggested)))
              }
            >
              Tageskasse öffnen · Bestand bestätigen
            </button>
          </form>
        )}
      {current && !active && (
        <p className="notice">
          Die Tageskasse vom {current.day} ist noch offen. Bitte diesen Tag
          auswählen und abschließen.
        </p>
      )}
      {active && canWrite && mode === "overview" && (
        <div className="toolbar">
          <button
            className="button secondary"
            onClick={() => {
              setMode("movement");
              setAmount("");
              setDescription("");
              setReference("");
              setFile(undefined);
            }}
          >
            Einlage / Entnahme mit Beleg
          </button>
          <button
            className="button"
            onClick={() => {
              setMode("close");
              setNext(inputMoney(day!.opening_cents));
              setCounted("");
              setConfirmed(false);
              setNote("");
              setTransfer("");
            }}
          >
            Bargeld zählen · Tagesabschluss
          </button>
        </div>
      )}
      {active && mode === "movement" && (
        <form
          className="form-grid two-columns cash-book-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act({
              action: "movement",
              day_id: day!.id,
              amount_cents: cents(amount) * (direction === "out" ? -1 : 1),
              description,
              category: category as CashCommand["category"],
              reference,
              document_date: documentDate,
              document: file,
            });
          }}
        >
          <label>
            Bewegung
            <select
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
                setCategory(
                  e.target.value === "out"
                    ? "Betriebsausgabe"
                    : "Privateinlage",
                );
              }}
            >
              <option value="out">Geld aus der Kasse</option>
              <option value="in">Geld in die Kasse</option>
            </select>
          </label>
          <label>
            Betrag (€)
            <input
              required
              inputMode="decimal"
              value={amount}
              placeholder="z. B. 10,00"
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Kategorie
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {(direction === "out"
                ? [
                    "Betriebsausgabe",
                    "Privatentnahme",
                    "Bank / Tresor",
                    "Sonstige Entnahme",
                  ]
                : ["Privateinlage", "Bank / Tresor", "Sonstige Einlage"]
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Verwendungszweck
            <input
              required
              minLength={3}
              maxLength={1000}
              value={description}
              placeholder="z. B. Porto bei Edeka"
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Belegdatum
            <input
              required
              type="date"
              max={today()}
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
            />
          </label>
          <label>
            Belegnummer / Papierbelegreferenz
            <input
              value={reference}
              maxLength={200}
              onChange={(e) => setReference(e.target.value)}
              required={category === "Betriebsausgabe" && !file}
            />
          </label>
          <label className="span-two">
            Beleg hochladen (PDF, JPEG, PNG · bis 2 MB)
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={async (e) => {
                setFile(undefined);
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) {
                  setError("Beleg darf höchstens 2 MB groß sein.");
                  e.target.value = "";
                  return;
                }
                try {
                  const base64 = await new Promise<string>(
                    (resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () =>
                        resolve(String(reader.result).split(",")[1]);
                      reader.onerror = reject;
                      reader.readAsDataURL(f);
                    },
                  );
                  setFile({
                    filename: f.name,
                    mime: f.type as "application/pdf",
                    base64,
                  });
                  setError("");
                } catch {
                  setError("Belegdatei konnte nicht gelesen werden.");
                }
              }}
            />
          </label>
          <p className="fineprint span-two">
            Die Ausgabe wird im Kassenbuch dokumentiert. Eine steuerliche
            Zuordnung und Vorsteuerprüfung erfolgt anhand des Belegs durch die
            Buchhaltung.
          </p>
          <button
            className="button"
            disabled={
              !canWrite || !Number.isFinite(cents(amount)) || cents(amount) <= 0
            }
          >
            Bewegung verbindlich buchen
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !!pending}
            onClick={() => setMode("overview")}
          >
            Abbrechen
          </button>
        </form>
      )}
      {active && mode === "close" && (
        <form
          className="form-grid two-columns cash-book-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act({
              action: "close",
              day_id: day!.id,
              revision,
              counted_cents: count,
              next_opening_cents: nextAmount,
              note,
              transfer_note: transfer,
              confirmed,
            });
          }}
        >
          <label>
            Gezählter Barbestand (€)
            <input
              autoFocus
              required
              inputMode="decimal"
              value={counted}
              placeholder="Bargeldzählung eingeben"
              onChange={(e) => {
                setCounted(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <div
            className={`cash-count-result ${difference ? "difference" : "balanced"}`}
            role="status"
          >
            <small>Soll {euro(balance)}</small>
            <strong>
              {difference === null
                ? "Bitte Bargeld zählen"
                : difference === 0
                  ? "Kassenbestand stimmt"
                  : `Differenz: ${euro(difference)}`}
            </strong>
          </div>
          <label>
            Anfangsbestand nächster Geschäftstag (€)
            <input
              required
              inputMode="decimal"
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label>
            Hinweis zur Zählung (optional)
            <input
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {physicalTransfer !== null && physicalTransfer !== 0 && (
            <>
              <p className="notice span-two">
                {physicalTransfer < 0
                  ? `${euro(-physicalTransfer)} aus der Kasse entnehmen`
                  : `${euro(physicalTransfer)} in die Kasse einlegen`}
                , damit {euro(nextAmount)} für den nächsten Geschäftstag
                verbleiben.
              </p>
              <label className="span-two">
                {physicalTransfer < 0
                  ? "Wohin wird das Geld gelegt?"
                  : "Woher stammt die Einlage?"}
                <input
                  required
                  minLength={3}
                  maxLength={200}
                  value={transfer}
                  placeholder="z. B. Tresor / Bankeinzahlung"
                  onChange={(e) => setTransfer(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="checkline span-two">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Bargeld gezählt, angezeigte Differenz geprüft und gegebenenfalls
            Entnahme / Einlage tatsächlich vorgenommen. Tagesabschluss
            verbindlich festschreiben.
          </label>
          <button
            className="button"
            disabled={
              !canWrite ||
              !confirmed ||
              !Number.isFinite(count) ||
              !Number.isFinite(nextAmount)
            }
          >
            Tagesabschluss bestätigen
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !!pending}
            onClick={() => setMode("overview")}
          >
            Zurück
          </button>
        </form>
      )}
      {active && data.pending.length > 0 && (
        <details>
          <summary>
            Bargeld aus Lieferrechnungen übernehmen ({data.pending.length})
          </summary>
          <p>
            Erst bestätigen, wenn das Bargeld tatsächlich in die Ladenkasse
            übergeben wird. Erstattungen reduzieren den Übertrag.
          </p>
          {data.pending
            .filter((p) => (p.mode === "setup") === day!.test_mode)
            .map((p) => (
              <div className="line-row" key={p.id}>
                <span>
                  RE-{p.number} ·{" "}
                  {new Date(p.paid_at).toLocaleDateString("de-DE")}
                </span>
                <strong>{euro(p.amount_cents)}</strong>
                {!data.readOnly && (
                  <button
                    className="button secondary small"
                    disabled={!canWrite}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Bargeldübertrag ${euro(p.amount_cents)} für RE-${p.number} tatsächlich erhalten bzw. ausgezahlt?`,
                        )
                      )
                        void act({
                          action: "delivery-transfer",
                          day_id: day!.id,
                          payment_id: p.id,
                        });
                    }}
                  >
                    Übergabe bestätigen
                  </button>
                )}
              </div>
            ))}
        </details>
      )}
      <div className="toolbar">
        <h3>Kassenbuch · {period}</h3>
        <button
          className="button secondary small"
          onClick={() => exportFile("pdf")}
        >
          PDF ansehen / drucken
        </button>
        <button
          className="button secondary small"
          onClick={() => exportFile("pdf", true)}
        >
          PDF herunterladen
        </button>
        <button
          className="button secondary small"
          onClick={() => exportFile("csv", true)}
        >
          CSV herunterladen
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Beleg / Datum</th>
              <th>Zweck</th>
              <th>Eingang</th>
              <th>Ausgang</th>
              <th>Bestand</th>
              <th>Bearbeiter / Beleg</th>
            </tr>
          </thead>
          <tbody>
            {data.report.entries.map((e) => (
              <tr key={e.id}>
                <td>
                  KB-{e.number}
                  <br />
                  {e.day}
                </td>
                <td>
                  {e.description}
                  <small className="cash-book-detail">
                    {e.category}
                    {e.reference ? " · " + e.reference : ""}
                  </small>
                </td>
                <td>{e.amount_cents > 0 ? euro(e.amount_cents) : "–"}</td>
                <td>{e.amount_cents < 0 ? euro(-e.amount_cents) : "–"}</td>
                <td>{euro(e.balance_cents)}</td>
                <td>
                  {e.actor_name}
                  {e.has_document && (
                    <button
                      className="text-link"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("elias:pdf-preview", {
                            detail: "/api/cash-book/document?id=" + e.id,
                          }),
                        )
                      }
                    >
                      Beleg ansehen
                    </button>
                  )}
                  {active &&
                    canWrite &&
                    e.kind === "manual" &&
                    !data.report.entries.some(
                      (x) => x.original_id === e.id,
                    ) && (
                      <button
                        className="text-link"
                        onClick={() => {
                          setReverse(e.id);
                          setNote("");
                        }}
                      >
                        Gegenbuchung
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.report.entries.length && (
          <p>Noch keine Kassenbucheinträge in diesem Zeitraum.</p>
        )}
      </div>
      {reverse && active && (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            void act({
              action: "reverse",
              day_id: day!.id,
              entry_id: reverse,
              note,
            });
          }}
        >
          <label>
            Grund der Gegenbuchung
            <input
              required
              minLength={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button className="button" disabled={!canWrite}>
            Gegenbuchung heute erfassen
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => setReverse("")}
          >
            Abbrechen
          </button>
        </form>
      )}
      {data.report.days.map((d) => (
        <div className="line-row" key={d.id}>
          <span>
            {d.day} · {d.closed_at ? "Abgeschlossen" : "Offen"}
          </span>
          <span>
            Gezählt {d.counted_cents === null ? "–" : euro(d.counted_cents)} ·
            Differenz{" "}
            {d.difference_cents === null ? "–" : euro(d.difference_cents)}
          </span>
          <strong>
            Nächster Anfang{" "}
            {d.next_opening_cents === null ? "–" : euro(d.next_opening_cents)}
          </strong>
        </div>
      ))}
      {data.readOnly && (
        <p className="fineprint">
          Steuerberaterzugang: Lesen, Belege ansehen und exportieren. Keine
          Buchungsrechte.
        </p>
      )}
    </section>
  );
}
export function CashBookDialog({
  close,
  onChange,
}: {
  close: () => void;
  onChange?: () => void;
}) {
  useDialog(true, close);
  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Kassenabschluss Tagesbericht"
        className="modal cash-book-dialog"
      >
        <button className="button secondary small" onClick={close}>
          Zurück zur Kasse
        </button>
        <CashBook onChange={onChange} />
      </section>
    </div>
  );
}
