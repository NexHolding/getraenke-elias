"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import SiteShell from "@/components/site-shell";
import { nativeApp, nativeRequest } from "@/lib/native-app";
const storageKey = "elias-account-deletion";
type Result = {
  status: string;
  request_id?: string;
  retained_business_records?: boolean;
};
export default function DeleteAccount() {
  const [email, setEmail] = useState<string | null>(null);
  const [identityMessage, setIdentityMessage] = useState(
    "Anmeldung wird geprüft …",
  );
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(storageKey),
  );
  const cleaned = useRef(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/customer/delete-account", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!active) return;
        if (r.ok) {
          setEmail(data.email);
          setIdentityMessage("");
        } else
          setIdentityMessage(
            r.status === 403
              ? "Mitarbeiterkonten werden im CRM verwaltet. Diese Funktion ist nur für Kundenkonten."
              : "Bitte melde dich zuerst mit dem Kundenkonto an, das du löschen möchtest.",
          );
      })
      .catch(() => {
        if (active)
          setIdentityMessage(
            "Deine Anmeldung konnte nicht geprüft werden. Bitte die Seite erneut laden.",
          );
      });
    if (nativeApp() === "customer")
      document.documentElement.classList.add("native-customer-account");
    return () => {
      active = false;
      document.documentElement.classList.remove("native-customer-account");
    };
  }, []);
  useEffect(() => {
    if (!requestId || result?.status === "completed") return;
    let active = true;
    const check = async () => {
      try {
        const r = await fetch(
          `/api/customer/delete-account?request_id=${encodeURIComponent(requestId)}`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const d: Result = await r.json();
        if (active && ["pending", "completed"].includes(d.status)) setResult(d);
      } catch {
        /* Keep the request ID so a interrupted connection is recoverable. */
      }
    };
    void check();
    const timer = setInterval(check, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [requestId, result?.status]);
  useEffect(() => {
    if (result?.status !== "completed" || cleaned.current) return;
    cleaned.current = true;
    localStorage.removeItem(storageKey);
    sessionStorage.removeItem("elias-cart");
    window.dispatchEvent(new Event("elias-cart-change"));
    void (async () => {
      const db = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      await db.auth.signOut({ scope: "local" });
      if (nativeApp() === "customer") {
        try {
          await nativeRequest({ type: "account.deleted" });
        } catch {
          /* Older app builds still get the server-side deletion. */
        }
      }
    })();
  }, [result?.status]);
  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setMessage("");
    const id = requestId || crypto.randomUUID();
    // Save before sending: a lost response must not lose the completion status.
    localStorage.setItem(storageKey, id);
    setRequestId(id);
    try {
      const r = await fetch("/api/customer/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: id,
          password,
          confirmation: "KONTO LÖSCHEN",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Konto konnte nicht gelöscht werden.");
      setPassword("");
      if (d.request_id) {
        localStorage.setItem(storageKey, d.request_id);
        setRequestId(d.request_id);
      }
      setResult(d);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Verbindung unterbrochen. Bitte den Status prüfen oder erneut versuchen.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SiteShell>
      <section className="container account-page">
        <div className="account-delete panel">
          <span className="eyebrow">DEIN KUNDENKONTO</span>
          <h1>Konto löschen</h1>
          {result?.status === "completed" ? (
            <div role="status">
              <h2>Dein Konto wurde gelöscht.</h2>
              <p>
                Dein Online-Zugang und deine persönlichen Profildaten wurden
                entfernt. Deine Lieferabos sind beendet.
              </p>
              {result.retained_business_records && (
                <p>
                  Aufbewahrungspflichtige Belege und Daten zu bestätigten
                  Aufträgen bleiben zweckgebunden erhalten. Offene Zahlungen und
                  vereinbarte Lieferungen bestehen weiter.
                </p>
              )}
              <Link className="button" href="/">
                Zur Startseite
              </Link>
            </div>
          ) : result?.status === "pending" ? (
            <div role="status">
              <h2>Deine Löschung wird abgeschlossen.</h2>
              <p>
                Deine Profildaten wurden entfernt und Lieferabos beendet. Die
                endgültige Entfernung des Anmeldekontos wird automatisch erneut
                versucht, normalerweise innerhalb weniger Minuten. Diese Seite
                zeigt den Abschluss an; du kannst sie auf diesem Gerät später
                erneut öffnen.
              </p>
              <p>
                Du musst keine E-Mail schreiben und keinen weiteren Antrag
                stellen.
              </p>
            </div>
          ) : (
            <>
              <p>
                Hier kannst du dein Kundenkonto endgültig löschen. Melde dich
                dafür mit dem zu löschenden Konto an und bestätige mit deinem
                aktuellen Passwort.
              </p>
              <ul>
                <li>
                  Dein Online-Zugang und persönliche Profildaten werden
                  gelöscht; Lieferabos werden beendet.
                </li>
                <li>
                  Noch unbestätigte Lieferanfragen werden entfernt. Bestätigte
                  Aufträge und offene Zahlungen bleiben bestehen.
                </li>
                <li>
                  Gesetzlich aufzubewahrende Rechnungen, Lieferscheine und
                  zugehörige Geschäftsdaten bleiben für ihre Aufbewahrungsfrist
                  erhalten. Lade benötigte Dokumente vorher herunter.
                </li>
              </ul>
              <p>
                Die Löschung erfolgt normalerweise sofort. Bei einer technischen
                Unterbrechung wird sie automatisch weiterbearbeitet und hier
                bestätigt. Sie kann nicht rückgängig gemacht werden.
              </p>
              {email ? (
                <p className="notice">
                  Du löschst das Kundenkonto <strong>{email}</strong>.
                </p>
              ) : (
                <p role="status">{identityMessage}</p>
              )}
              <form onSubmit={remove} className="account-delete-form">
                <label>
                  Aktuelles Passwort
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={256}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Passwort deines Kundenkontos"
                  />
                </label>
                <label className="account-delete-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    required
                  />
                  <span>
                    Ja, ich möchte mein Kundenkonto und meine Profildaten
                    endgültig löschen und meine Lieferabos beenden.
                  </span>
                </label>
                {message && (
                  <p className="notice" role="alert">
                    {message}
                  </p>
                )}
                <button
                  className="button account-delete-button"
                  disabled={busy || !confirmed || !password || !email}
                >
                  {busy
                    ? "Löschung wird verarbeitet …"
                    : "Konto endgültig löschen"}
                </button>
              </form>
              <div className="portal-account-actions">
                <Link className="text-link" href="/konto">
                  Zurück / anmelden
                </Link>
                <Link className="text-link" href="/passwort-vergessen">
                  Passwort vergessen
                </Link>
                <Link className="text-link" href="/datenschutz">
                  Datenschutz
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </SiteShell>
  );
}
