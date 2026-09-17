"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { Logo } from "@/components/site-shell";
import { resolveLoginEmail } from "@/lib/login-identity";
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const db = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error } = await db.auth.signInWithPassword({
        email: resolveLoginEmail(String(f.get("email"))),
        password: String(f.get("password")),
      });
      if (error) throw error;
      router.push("/crm");
      router.refresh();
    } catch {
      setError("Anmeldung fehlgeschlagen. Bitte Benutzername oder E-Mail und Passwort prüfen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <Link className="login-back text-link" href="/">
        <ArrowLeft size={18} /> Zur Website
      </Link>
      <div className="login-card">
        <Logo />
        <span className="eyebrow">DEIN ELIAS ARBEITSPLATZ</span>
        <h1>Schön, dass du da bist.</h1>
        <p>Artikel, Bestellungen und Kasse – alles an einem Ort.</p>
        <form className="form-grid" onSubmit={login}>
          <label>
            E-Mail-Adresse oder Benutzername
            <input
              type="text"
              name="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </label>
          <label>
            Passwort
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
            />
          </label>
          {error && (
            <p role="alert" className="notice danger">
              {error}
            </p>
          )}
          <button disabled={busy} className="button">
            {busy ? "Anmeldung läuft …" : "Anmelden"}
            <ArrowRight size={18} />
          </button>
        </form>
        <small>
          <LockKeyhole size={14} /> Geschützter Mitarbeiterbereich · Zugang nur
          auf Einladung
        </small>
      </div>
    </main>
  );
}
