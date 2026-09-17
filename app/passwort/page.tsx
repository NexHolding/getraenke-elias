"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/site-shell";
export default function Password() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-card">
        <Logo />
        <h1>Dein neues Passwort.</h1>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (f.get("password") !== f.get("confirm")) {
              setMessage("Die Passwörter stimmen nicht überein.");
              return;
            }
            setBusy(true);
            try {
              const db = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              );
              const {
                data: { user },
              } = await db.auth.getUser();
              if (!user) {
                setMessage("Bitte zuerst mit deinem Erstzugang anmelden.");
                return;
              }
              const { error } = await db.auth.updateUser({
                password: String(f.get("password")),
              });
              setMessage(
                error
                  ? "Passwort konnte nicht geändert werden. Bitte erneut anmelden."
                  : "Dein Passwort wurde geändert.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Neues Passwort (mindestens 12 Zeichen)
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <label>
            Passwort wiederholen
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <button className="button" disabled={busy}>
            Passwort speichern
          </button>
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          <Link className="text-link" href="/konto">
            Zum Kundenkonto
          </Link>
          <Link className="text-link" href="/crm">
            Zur Verwaltung
          </Link>
        </form>
      </div>
    </main>
  );
}
