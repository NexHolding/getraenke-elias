"use client";
import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { Logo } from "@/components/site-shell";
export default function ForgotPassword() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <main className="login-page">
      <div className="login-card">
        <Logo />
        <h1>Passwort vergessen?</h1>
        <p>
          Wir senden dir einen Link. Damit kannst du ein neues Passwort
          festlegen.
        </p>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            const email = String(new FormData(e.currentTarget).get("email"))
              .trim()
              .toLowerCase();
            try {
              const db = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              );
              const { error } = await db.auth.resetPasswordForEmail(email, {
                redirectTo: location.origin + "/auth/callback?next=/passwort",
              });
              if (error) throw error;
              setMessage(
                "Falls ein Kundenkonto zu dieser E-Mail-Adresse existiert, erhältst du einen Link zum Zurücksetzen. Bitte prüfe auch deinen Spam-Ordner.",
              );
            } catch {
              setMessage(
                "Die Anfrage konnte gerade nicht bearbeitet werden. Bitte versuche es später erneut.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            E-Mail-Adresse
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <button className="button" disabled={busy}>
            {busy ? "Anfrage läuft …" : "Link zum Zurücksetzen senden"}
          </button>
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          <Link className="text-link" href="/konto">
            Zur Kundenanmeldung
          </Link>
        </form>
      </div>
    </main>
  );
}
