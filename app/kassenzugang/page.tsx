"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/site-shell";
export default function Terminal() {
  const router = useRouter();
  const [data, setData] = useState<{
    registered: boolean;
    employees?: { user_id: string; name: string; number: number }[];
  } | null>(null);
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/terminal")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Kassengerät nicht erreichbar."));
  }, []);
  return (
    <main className="login-page">
      <section className="login-card">
        <Logo />
        <span className="eyebrow">DEINE ELIAS KASSE</span>
        <h1>Wer ist heute dran?</h1>
        {data?.registered ? (
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await fetch("/api/terminal", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "unlock", user_id: id, pin }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                router.push("/crm/kasse");
                router.refresh();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Anmeldung fehlgeschlagen.",
                );
                setPin("");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Mitarbeiter
              <select
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
              >
                <option value="">Bitte auswählen</option>
                {data.employees?.map((e) => (
                  <option key={e.user_id} value={e.user_id}>
                    {e.name} · M-{e.number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vierstellige PIN
              <input
                required
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </label>
            <button disabled={busy} className="button">
              Kasse öffnen
            </button>
            <button
              type="button"
              className="text-link"
              onClick={async () => {
                const r = await fetch("/api/terminal", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "release" }),
                });
                if (r.ok) {
                  router.push("/login");
                  router.refresh();
                } else
                  setError(
                    "Zum Aufheben der Gerätefreigabe ist eine Inhaber-Passwortsitzung erforderlich.",
                  );
              }}
            >
              Gerätefreigabe aufheben
            </button>
          </form>
        ) : (
          <p>
            Dieses Gerät ist noch nicht freigegeben. Der Inhaber kann es unter
            Einstellungen → Apps & Zugang freigeben und Mitarbeiter-PINs
            vergeben.
          </p>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <Link href="/login">Zum Mitarbeiter-Login</Link>
      </section>
    </main>
  );
}
