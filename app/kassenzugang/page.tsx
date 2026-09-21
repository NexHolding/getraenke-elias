"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Delete, LockKeyhole, UserRound } from "lucide-react";
import { Logo } from "@/components/site-shell";

type Employee = { user_id: string; name: string; number: number; has_pin: boolean };
export default function Terminal() {
  const router = useRouter();
  const [data, setData] = useState<{ registered: boolean; employees?: Employee[] } | null>(null);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/terminal", { cache: "no-store" })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || "Kassengerät nicht erreichbar.");
        if (!cancelled) setData(result);
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (selected?.has_pin) input.current?.focus(); }, [selected]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current || !selected?.has_pin || !/^\d{4}$/.test(pin)) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/terminal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlock", user_id: selected.user_id, pin }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Anmeldung fehlgeschlagen.");
      setPin("");
      // A fresh page also discards any cached data of the previous operator.
      router.push("/crm/kasse");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anmeldung fehlgeschlagen.");
      setPin("");
      input.current?.focus();
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <main className="login-page terminal-login-page">
      <section className={`login-card terminal-login-card ${selected ? "terminal-pin-card" : ""}`}>
        <Logo />
        <span className="eyebrow"><LockKeyhole size={15} /> KASSE GESPERRT</span>
        <h1>{selected ? selected.name : "Wer ist an der Kasse?"}</h1>
        {data?.registered ? selected ? (
          <>
            <button type="button" className="text-link terminal-back" disabled={busy} onClick={() => { setSelected(null); setPin(""); setError(""); }}>
              <ArrowLeft size={18} /> Anderen Mitarbeiter wählen
            </button>
            {selected.has_pin ? (
              <form onSubmit={unlock} className="terminal-pin-form">
                <label htmlFor="terminal-pin">Deine vierstellige Kassen-PIN</label>
                <input ref={input} id="terminal-pin" type="password" inputMode="none" pattern="[0-9]{4}" maxLength={4} autoComplete="off" required disabled={busy}
                  value={pin} placeholder="••••" onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} />
                <div className="terminal-keypad" aria-label="PIN-Ziffernblock">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((key) => (
                    <button key={key} type="button" disabled={busy} aria-label={key === "clear" ? "PIN löschen" : key === "back" ? "Letzte Ziffer löschen" : key}
                      onClick={() => { setPin((value) => key === "clear" ? "" : key === "back" ? value.slice(0, -1) : (value + key).slice(0, 4)); setError(""); }}>
                      {key === "clear" ? "Löschen" : key === "back" ? <Delete size={24} /> : key}
                    </button>
                  ))}
                </div>
                <button className="button terminal-unlock" disabled={busy || pin.length !== 4}><LockKeyhole size={20} /> {busy ? "Kasse wird geöffnet …" : "Kasse entsperren"}</button>
              </form>
            ) : <p className="notice">Für diesen Mitarbeiter ist noch keine Kassen-PIN hinterlegt. Der Inhaber kann sie unter Einstellungen → Mitarbeiter vergeben.</p>}
          </>
        ) : (
          <>
            <p>Tippe auf deinen Namen und gib deine PIN ein.</p>
            <div className="terminal-employee-grid">
              {data.employees?.map((employee) => (
                <button type="button" key={employee.user_id} onClick={() => { setSelected(employee); setPin(""); setError(""); }}>
                  <span className="terminal-employee-avatar"><UserRound size={25} /></span>
                  <strong>{employee.name}</strong>
                  <small>{employee.has_pin ? "Mit PIN entsperren" : "PIN noch nicht eingerichtet"}</small>
                </button>
              ))}
            </div>
            {!data.employees?.length && <p className="notice">Noch keine aktiven Mitarbeiter mit Kassenzugang vorhanden.</p>}
          </>
        ) : data ? (
          <p>Bitte einmal mit deinem Mitarbeiter-Passwort anmelden. Beim Sperren der Kasse wird die Namensauswahl für dieses Gerät aktiviert.</p>
        ) : !error ? <p role="status">Mitarbeiter werden geladen …</p> : null}
        {error && <p role="alert" className="notice danger">{error}</p>}
        <Link className="terminal-password-link" href="/login">Mit Passwort anmelden</Link>
      </section>
    </main>
  );
}
