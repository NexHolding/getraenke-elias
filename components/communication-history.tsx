"use client";
import { useEffect, useState } from "react";
import { Mail, Paperclip, RefreshCw } from "lucide-react";
import { mailStatus, type Communication } from "@/lib/communication-types";
const date = (value: string) =>
  new Date(value).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
export function CommunicationHistory({ customerId }: { customerId?: string }) {
  const [messages, setMessages] = useState<Communication[]>([]);
  const [page, setPage] = useState(0),
    [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (customerId) params.set("customer", customerId);
    fetch("/api/communications?" + params, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : "Nachrichten konnten nicht geladen werden.",
          );
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [customerId, page, refresh]);
  const reload = () => {
    setLoading(true);
    setError("");
    setRefresh((n) => n + 1);
  };
  return (
    <section
      className="communication-history"
      aria-label="Kommunikationsverlauf"
    >
      <div className="panel-head">
        <div>
          <span className="eyebrow">E-MAIL-ARCHIV</span>
          <h2>Kommunikation</h2>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={reload}
        >
          <RefreshCw size={16} />
          Aktualisieren
        </button>
      </div>
      <p className="fineprint">
        Alle erfassten E-Mails, Versandzeiten und Originalanhänge. „An
        Mailserver übergeben“ bestätigt die Annahme durch den Versandserver,
        nicht das Lesen oder den Eingang im Postfach.
      </p>
      {error && (
        <p role="alert" className="notice danger">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Nachrichten werden geladen …</p>
      ) : (
        <>
          {!messages.length && !error && (
            <div className="empty">
              <Mail size={32} />
              <h3>Noch keine E-Mails erfasst</h3>
              <p>Neue Nachrichten erscheinen hier automatisch.</p>
            </div>
          )}
          {messages.map((m) => (
            <details className="communication-card" key={m.id}>
              <summary>
                <Mail size={20} />
                <span>
                  <strong>{m.subject}</strong>
                  <small>
                    {date(m.sent_at || m.created_at)} · {m.recipient}
                  </small>
                </span>
                <span className={"mail-status mail-status-" + m.status}>
                  {mailStatus[m.status]}
                </span>
              </summary>
              <div className="communication-content">
                <dl className="communication-meta">
                  <div>
                    <dt>Empfänger</dt>
                    <dd>{m.recipient}</dd>
                  </div>
                  <div>
                    <dt>Absender</dt>
                    <dd>{m.sender || "Nicht erfasst"}</dd>
                  </div>
                  <div>
                    <dt>Erstellt</dt>
                    <dd>{date(m.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Versand</dt>
                    <dd>
                      {m.sent_at ? date(m.sent_at) : "Noch nicht bestätigt"}
                    </dd>
                  </div>
                  <div>
                    <dt>Nachrichtenart</dt>
                    <dd>
                      {m.kind.startsWith("auth_")
                        ? "System-E-Mail"
                        : m.kind === "invoice_document"
                          ? "Rechnung"
                          : m.kind === "delivery_document"
                            ? "Lieferschein"
                            : "Bestellbestätigung"}
                    </dd>
                  </div>
                </dl>
                {m.error && (
                  <p className="notice" role="status">
                    {m.error}
                  </p>
                )}
                {m.legacy && (
                  <p className="notice">
                    Historischer Eintrag: Damals wurden Anhänge noch nicht
                    archiviert. Die ursprüngliche Versanddatei kann deshalb
                    nicht nachträglich nachgewiesen werden.
                  </p>
                )}
                <div className="communication-body">{m.body}</div>
                {!!m.attachments.length && (
                  <div className="communication-attachments">
                    <h3>Anhänge</h3>
                    {m.attachments.map((a) => (
                      <a
                        key={a.id}
                        className="document-link"
                        href={
                          "/api/communications/attachments/" +
                          a.id +
                          (customerId
                            ? "?customer=" + encodeURIComponent(customerId)
                            : "")
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          window.dispatchEvent(
                            new CustomEvent("elias:pdf-preview", {
                              detail: e.currentTarget.getAttribute("href"),
                            }),
                          );
                        }}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Paperclip size={18} />
                        <span>
                          {a.filename}
                          <small>
                            PDF · {Math.ceil(a.size_bytes / 1024)} KB ·
                            Originaldatei des Versandvorgangs
                          </small>
                        </span>
                      </a>
                    ))}
                  </div>
                )}
                {m.kind.startsWith("auth_") && (
                  <p className="fineprint">
                    Persönliche Bestätigungslinks und Sicherheitscodes sind im
                    Archiv ausgeblendet.
                  </p>
                )}
              </div>
            </details>
          ))}
          {(page > 0 || hasMore) && (
            <div className="table-toolbar">
              <button
                className="button secondary"
                disabled={page === 0}
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setPage((p) => p - 1);
                }}
              >
                Neuere Nachrichten
              </button>
              <span>Seite {page + 1}</span>
              <button
                className="button secondary"
                disabled={!hasMore}
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setPage((p) => p + 1);
                }}
              >
                Ältere Nachrichten
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
