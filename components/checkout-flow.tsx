"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import PaymentDialog from "./payment-dialog";
import Image from "next/image";
import { useDialog } from "./use-dialog";
import { printPdf, printerVerified } from "@/lib/epson-client";
import { EpsonError } from "@/lib/epson";
import type { Sale, Settings } from "@/lib/types";
import { euro } from "@/lib/money";

type Payload = { id: string; payment: string; [key: string]: unknown };
type Workflow = {
  stage: string;
  public_token: string | null;
  share_expires_at: string | null;
};
type Output = {
  sale: Sale;
  workflow: Workflow | null;
  jobs: { id: string; status: string; copy: boolean; detail: string }[];
  archived_at: string;
};
async function request(path: string, body?: unknown) {
  const r = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error || "Beleg konnte nicht geladen werden.");
  return data;
}
export function receiptDownload(id: string) {
  window.open(
    `/api/receipts/${id}?format=pdf`,
    "_blank",
    "noopener,noreferrer",
  );
}

export default function CheckoutFlow({
  payload,
  totalCents,
  disabled,
  settings,
  operatorId,
  pendingReceipt,
  onBooked,
  onRefresh,
}: {
  payload: Payload;
  totalCents: number;
  disabled: boolean;
  settings: Settings;
  operatorId: string;
  pendingReceipt?: string | null;
  onBooked: (sale: Sale) => void;
  onRefresh: () => Promise<void>;
}) {
  const [inFlight, setInFlight] = useState(false),
    [saved, setSaved] = useState<Payload | null>(() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = sessionStorage.getItem(`elias-checkout-${operatorId}`);
        const value = raw ? JSON.parse(raw) : null;
        return value && typeof value.id === "string" ? value : null;
      } catch {
        return null;
      }
    }),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState<string | null>(null),
    [completed, setCompleted] = useState<string[]>([]),
    [review, setReview] = useState<{ payload: Payload; total: number } | null>(
      null,
    ),
    [cashReceived, setCashReceived] = useState<number | null>(null);
  const lock = useRef(false),
    key = `elias-checkout-${operatorId}`;
  const activeReceipt =
    receipt ||
    (pendingReceipt && !completed.includes(pendingReceipt)
      ? pendingReceipt
      : null);
  useDialog(!!saved && !activeReceipt, () => {});
  async function pay(value: Payload) {
    if (lock.current) return;
    lock.current = true;
    setInFlight(true);
    setError("");
    try {
      // Persist before sending. A lost HTTP response is retried with the same sale ID and body.
      sessionStorage.setItem(key, JSON.stringify(value));
      setSaved(value);
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sale", value }),
      });
      const result = await r.json();
      if (!r.ok) {
        if (result.booking_failed) {
          sessionStorage.removeItem(key);
          setSaved(null);
        }
        throw new Error(
          result.error ||
            "Buchungsstatus unklar. Vorgang mit derselben Nummer erneut prüfen.",
        );
      }
      if (result.id !== value.id)
        throw new Error("Buchungsbestätigung fehlt. Vorgang erneut prüfen.");
      // Acknowledge the committed sale before refreshing unrelated dashboard data.
      sessionStorage.removeItem(key);
      setSaved(null);
      setReceipt(result.id);
      onBooked(result);
      setCashReceived(
        typeof value.cash_received_cents === "number"
          ? value.cash_received_cents
          : null,
      );
      void onRefresh().catch(() => {});
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Verbindung unterbrochen. Buchungsstatus erneut prüfen.",
      );
    } finally {
      setInFlight(false);
      lock.current = false;
    }
  }
  return (
    <>
      <button
        className="button full"
        disabled={
          disabled || inFlight || !!saved || !!activeReceipt || !!review
        }
        onClick={() => {
          if (disabled || lock.current || saved || activeReceipt) return;
          setError("");
          setReview({ payload, total: totalCents });
        }}
      >
        {inFlight ? "Wird verbucht …" : "Bezahlen"}
      </button>
      {disabled && !inFlight && !saved && !activeReceipt && (
        <p className="payment-empty-hint">
          Zuerst Artikel oder Pfandrücknahme hinzufügen.
        </p>
      )}
      {review && (
        <PaymentDialog
          total={review.total}
          payment={review.payload.payment}
          stale={
            disabled ||
            JSON.stringify(review.payload) !== JSON.stringify(payload) ||
            review.total !== totalCents
          }
          onCancel={() => setReview(null)}
          onConfirm={(received) => {
            if (
              disabled ||
              lock.current ||
              saved ||
              activeReceipt ||
              JSON.stringify(review.payload) !== JSON.stringify(payload) ||
              review.total !== totalCents
            )
              return;
            const value = {
              ...review.payload,
              ...(received === null ? {} : { cash_received_cents: received }),
            };
            setReview(null);
            void pay(value);
          }}
        />
      )}
      {error && !saved && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && !activeReceipt && (
        <div className="modal-backdrop">
          <section
            className="modal receipt-output"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-recovery-title"
          >
            <h2 id="payment-recovery-title">
              {inFlight ? "Zahlung wird verbucht" : "Buchungsstatus prüfen"}
            </h2>
            <p>
              Vorgang {saved.id.slice(0, 8)}. Bei einer unterbrochenen
              Verbindung wird derselbe Verkauf geprüft. Bitte keine zweite
              Zahlung am Kartenterminal auslösen.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="button"
              disabled={inFlight}
              onClick={() => pay(saved)}
            >
              {inFlight ? "Bitte warten …" : "Buchungsstatus erneut prüfen"}
            </button>
          </section>
        </div>
      )}
      {activeReceipt && (
        <ReceiptOutput
          key={activeReceipt}
          id={activeReceipt}
          settings={settings}
          cashReceived={receipt === activeReceipt ? cashReceived : null}
          complete={() => {
            setCompleted((v) => [...v, activeReceipt]);
            setReceipt(null);
            if (saved?.id === activeReceipt) {
              sessionStorage.removeItem(key);
              setSaved(null);
            }
            void onRefresh().catch(() => {});
          }}
        />
      )}
    </>
  );
}
function ReceiptOutput({
  id,
  settings,
  complete,
  cashReceived,
}: {
  id: string;
  settings: Settings;
  cashReceived?: number | null;
  complete: () => void;
}) {
  const [data, setData] = useState<Output | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [digital, setDigital] = useState(false),
    [consent, setConsent] = useState(false),
    [copy, setCopy] = useState(false),
    [qr, setQr] = useState(""),
    [message, setMessage] = useState(""),
    [manual, setManual] = useState(false),
    [paperConfirmed, setPaperConfirmed] = useState(false);
  const lock = useRef(false);
  useDialog(true, () => {});
  const refresh = useCallback(async () => {
    const d: Output = await request(`/api/receipts/${id}`);
    setData(d);
    if (d.workflow?.stage === "digital") setDigital(true);
    return d;
  }, [id]);
  useEffect(() => {
    let active = true;
    request(`/api/receipts/${id}`)
      .then((d) => {
        if (active) {
          setData(d);
          if (d.workflow?.stage === "digital") setDigital(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const url = data?.workflow?.public_token
    ? `${window.location.origin}/api/bon/${data.workflow.public_token}`
    : "";
  useEffect(() => {
    let active = true;
    if (url)
      void import("qrcode")
        .then((q) =>
          q.toDataURL(url, {
            width: 260,
            margin: 2,
            errorCorrectionLevel: "M",
          }),
        )
        .then((src) => {
          if (active) setQr(src);
        })
        .catch(() => {
          if (active)
            setError(
              "QR-Code konnte nicht erstellt werden. PDF-Link verwenden.",
            );
        });
    return () => {
      active = false;
    };
  }, [url]);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ausgabe fehlgeschlagen.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  const command = (action: string, value: Record<string, unknown> = {}) =>
    request(`/api/receipts/${id}`, { action, value });
  async function print() {
    if (settings.printer_mode !== "epson" || !printerVerified(settings))
      throw new Error(
        "Epson zuerst auf diesem Kassengerät mit dem Assistenten einrichten und Testbon bestätigen.",
      );
    const response = await fetch(`/api/receipts/${id}?format=pdf`, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        "Archivierten Bon konnte ich nicht laden. Bitte erneut versuchen.",
      );
    const bytes = new Uint8Array(await response.arrayBuffer()),
      jobId = crypto.randomUUID();
    let result;
    try {
      result = await command("print_start", {
        job_id: jobId,
        confirm_copy: copy,
      });
    } catch (e) {
      await refresh().catch(() => {});
      throw e;
    }

    if (!result.may_send)
      throw new Error(
        "Druckauftrag existiert bereits. Drucker und Status prüfen.",
      );
    // Never resend automatically after a timeout. The printer may already have printed.
    let outcome: "confirmed" | "failed" | "unknown" = "confirmed",
      detail = "Epson ePOS bestätigt",
      printError: unknown;
    try {
      const status = await printPdf(settings, bytes, result.job.copy);
      if (status.nearEnd) detail += "; Papier geht zur Neige";
    } catch (e) {
      outcome = e instanceof EpsonError ? e.outcome : "failed";
      detail =
        e instanceof Error
          ? e.message
          : "Druckbild konnte nicht erzeugt werden";
      printError = e;
    }
    try {
      await command("print_finish", {
        job_id: jobId,
        status: outcome,
        detail: detail.slice(0, 500),
      });
    } catch {
      await refresh();
      throw new Error(
        "Druckstatus konnte nicht gespeichert werden. Ein Ausdruck kann erfolgt sein. Vor einer Kopie am Drucker prüfen.",
      );
    }
    await refresh();
    setCopy(false);
    if (printError) throw printError;
    setMessage(
      "Epson hat den Druck bestätigt. Bitte Bon dem Kunden anbieten." +
        (detail.includes("Neige") ? " Papier geht zur Neige." : ""),
    );
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal receipt-output"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <p className="eyebrow">ZAHLUNG VERBUCHT</p>
        <h2 id="receipt-title">
          {data?.workflow?.stage === "done"
            ? "Bon ausgegeben"
            : "Bon erwünscht?"}
        </h2>
        <p>
          {data
            ? `Bon ${data.sale.number} · ${euro(data.sale.total_cents)} · ${data.sale.payment === "cash" ? "Barzahlung" : "Kartenzahlung erfasst"}`
            : "Gespeicherten Beleg laden und archivieren …"}
        </p>
        {data?.sale.payment === "cash" &&
          cashReceived != null &&
          data.sale.total_cents >= 0 && (
            <div className="cash-receipt-summary">
              <span>Gegeben {euro(cashReceived)}</span>
              <strong>
                {cashReceived >= data.sale.total_cents
                  ? `Rückgeld ${euro(cashReceived - data.sale.total_cents)}`
                  : "Betrag geändert – Zahlung prüfen"}
              </strong>
            </div>
          )}
        {data?.sale.test_mode && (
          <p className="notice">
            Einrichtungsbeleg · noch kein fiskalisierter Live-Verkauf.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {!data && (
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await refresh();
              })
            }
          >
            Belegarchiv erneut laden
          </button>
        )}
        {data && (
          <>
            <p className="fineprint">
              Beleg ist archiviert. Ein Druckproblem ändert die Buchung und den
              Warenbestand nicht.
            </p>
            {data.workflow?.stage !== "done" && (
              <>
                <div className="receipt-choices">
                  <button
                    className="button"
                    disabled={busy || (data.jobs.length > 0 && !copy)}
                    onClick={() => run(print)}
                  >
                    {busy ? "Bitte warten …" : "Ja · Bon automatisch drucken"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setDigital(true)}
                  >
                    Nein · digital anbieten
                  </button>
                </div>
                {data.jobs.length > 0 && (
                  <div className="notice">
                    <p>
                      Letzter Druckstatus:{" "}
                      {
                        (
                          {
                            sending:
                              "Antwort ausstehend / nach Unterbrechung unklar",
                            unknown: "Unklar – Drucker prüfen",
                            failed: "Fehlgeschlagen",
                            confirmed: "Bestätigt",
                          } as Record<string, string>
                        )[data.jobs[0].status]
                      }
                      . {data.jobs[0].detail}
                    </p>
                    <label className="checkline">
                      <input
                        type="checkbox"
                        checked={copy}
                        disabled={busy}
                        onChange={(e) => setCopy(e.target.checked)}
                      />
                      Drucker geprüft. Erneuten Ausdruck ausdrücklich als Kopie
                      starten.
                    </label>
                  </div>
                )}
                {digital && (
                  <div className="digital-receipt">
                    <h3>Digitalbon bereitstellen</h3>
                    <p>
                      Kein Papierbon? Der Kunde muss der elektronischen Ausgabe
                      zustimmen. Der Downloadcode ist 30 Tage gültig; der Beleg
                      bleibt intern archiviert.
                    </p>
                    {!url && (
                      <>
                        <label className="checkline">
                          <input
                            type="checkbox"
                            checked={consent}
                            onChange={(e) => setConsent(e.target.checked)}
                          />
                          Kunde stimmt einem elektronischen Bon zu
                        </label>
                        <button
                          className="button secondary"
                          disabled={busy || !consent}
                          onClick={() =>
                            run(async () => {
                              await command("digital", { consent: true });
                              await refresh();
                            })
                          }
                        >
                          Downloadcode anzeigen
                        </button>
                      </>
                    )}
                    {url && (
                      <>
                        {qr && (
                          <Image
                            unoptimized
                            src={qr}
                            alt="QR-Code zum Download des Kassenbons"
                            width={260}
                            height={260}
                          />
                        )}
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-link"
                        >
                          Digitalbon öffnen / herunterladen
                        </a>
                        <p className="fineprint">
                          Nur dem betreffenden Kunden zeigen. Der Link
                          ermöglicht den Zugriff auf diesen Bon.
                        </p>
                        <button
                          className="button"
                          disabled={busy || !qr}
                          onClick={() =>
                            run(async () => {
                              await command("digital_offered");
                              complete();
                            })
                          }
                        >
                          Digitalbon dem Kunden angeboten · Fertig
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="receipt-links">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  receiptDownload(id);
                  setManual(true);
                }}
              >
                Archivierten PDF-Bon öffnen
              </button>
              <button
                className="text-link"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await refresh();
                  })
                }
              >
                Ausgabestatus aktualisieren
              </button>
              <Link href="/crm/einstellungen" className="text-link">
                Epson-Einrichtung öffnen
              </Link>
            </div>
            {manual && data.workflow?.stage !== "done" && (
              <div className="notice">
                <p>
                  Manuelle Ersatzausgabe: Im PDF-Fenster selbst drucken. Das
                  Öffnen der PDF bestätigt keinen Ausdruck.
                </p>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={paperConfirmed}
                    onChange={(e) => setPaperConfirmed(e.target.checked)}
                  />
                  Papierbon wurde tatsächlich ausgedruckt und dem Kunden
                  angeboten
                </label>
                <button
                  className="button secondary"
                  disabled={busy || !paperConfirmed}
                  onClick={() =>
                    run(async () => {
                      await command("manual_paper", { confirmed: true });
                      complete();
                    })
                  }
                >
                  Manuelle Papierausgabe dokumentieren
                </button>
              </div>
            )}
            {data.workflow?.stage === "done" && (
              <button
                className="button full"
                disabled={busy}
                onClick={complete}
              >
                Fertig · Nächster Kunde
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
