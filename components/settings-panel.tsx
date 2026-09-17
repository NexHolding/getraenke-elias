"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Settings as Config, Employee } from "@/lib/types";
import { modules } from "@/lib/permissions";
import { useOperations } from "./operations";
const tabs = [
  ["betrieb", "Betrieb"],
  ["automatik", "Bestellautomatik"],
  ["lieferung", "Auslieferung"],
  ["schnittstellen", "Schnittstellen"],
  ["tse", "TSE"],
  ["drucker", "Bon-Drucker"],
  ["apps", "Apps & Zugang"],
  ["mitarbeiter", "Mitarbeiter"],
];
export default function SettingsPanel({
  settings,
  save,
  busy,
  testMail,
  owner,
}: {
  settings: Config;
  save: (v: Config & { smtp_password?: string }) => Promise<unknown>;
  busy: boolean;
  testMail: () => Promise<unknown>;
  owner: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("betrieb");
  const [v, setV] = useState({ ...settings, smtp_password: "" });
  const op = useOperations();
  const [employee, setEmployee] = useState<
    (Partial<Employee> & { pin?: string; password?: string }) | null
  >(null);
  const [note, setNote] = useState("");
  const [reset, setReset] = useState("");
  const text = (key: keyof typeof v, label: string, type = "text") => (
    <label>
      {label}
      <input
        type={type}
        value={String(v[key] ?? "")}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
      />
    </label>
  );
  const toggle = (key: keyof typeof v, label: string) => (
    <label className="checkline">
      <input
        type="checkbox"
        checked={!!v[key]}
        onChange={(e) => setV({ ...v, [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  const num = (
    key: keyof typeof v,
    label: string,
    min: number,
    max: number,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={Number(v[key] || 0)}
        onChange={(e) => setV({ ...v, [key]: Number(e.target.value) })}
      />
    </label>
  );
  const days = (key: "reorder_days" | "delivery_days") => (
    <div className="weekdays">
      {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d, i) => (
        <label key={d}>
          <input
            type="checkbox"
            checked={(v[key] || []).includes(i + 1)}
            onChange={(e) =>
              setV({
                ...v,
                [key]: e.target.checked
                  ? [...(v[key] || []), i + 1]
                  : (v[key] || []).filter((x) => x !== i + 1),
              })
            }
          />
          {d}
        </label>
      ))}
    </div>
  );
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Einstellungsbereiche">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div>
        <section className="panel">
          <span className="eyebrow">DEIN ELIAS SYSTEM</span>
          <h2>{tabs.find((t) => t[0] === tab)?.[1]}</h2>
          {tab !== "mitarbeiter" && (
            <form
              className="form-grid two-columns"
              onSubmit={async (e) => {
                e.preventDefault();
                const result = await save(v);
                if (result !== null) setNote("Einstellungen gespeichert.");
              }}
            >
              {tab === "betrieb" && (
                <>
                  {text("business_name", "Unternehmensname")}
                  {text("business_address", "Geschäftsanschrift")}
                  {text("tax_number", "Steuernummer / USt-IdNr.")}
                  {num("discount_percent", "Mitarbeiterrabatt (%)", 0, 100)}
                  {toggle(
                    "guest_orders",
                    "Bestellungen ohne Kundenkonto erlauben",
                  )}
                  <div className="span-two mode-card">
                    <strong>
                      {v.live_mode ? "Live-Modus" : "Einrichtungsmodus"}
                    </strong>
                    <p>
                      Verkauf, Pfand, Lieferungen und Auswertungen sind
                      bedienbar. Einrichtungsbelege bleiben rücksetzbar.
                    </p>
                    {toggle("live_mode", "Live-Modus aktivieren")}
                    <p className="fineprint">
                      Die Aktivierung erfolgt nach Anschluss und Abnahme des
                      TSE-Adapters. Das Umschalten allein erzeugt keine
                      Fiskalisierung.
                    </p>
                  </div>
                </>
              )}
              {tab === "automatik" && (
                <>
                  <p className="span-two">
                    Der Bedarf wird gesammelt. Zum eingestellten Termin entsteht
                    eine Sammelbestellung je Lieferant. Bereits offene
                    Bestellungen werden abgezogen.
                  </p>
                  {toggle(
                    "auto_reorder",
                    "Automatische Sammelbestellung einschalten",
                  )}
                  <div className="span-two">
                    Bestelltage{days("reorder_days")}
                  </div>
                  {text("reorder_time", "Bestellzeit · Europe/Berlin", "time")}
                  {num("reorder_weeks", "Rhythmus (Wochen)", 1, 12)}
                  {text("reorder_anchor", "Startwoche des Rhythmus", "date")}
                  <p className="notice span-two">
                    Höchstens ein Durchlauf je Bestelltag, zum ersten
                    stündlichen Lauf nach der eingestellten Uhrzeit.
                    Versandfreigabe und Bestell-E-Mail werden am Lieferanten
                    gepflegt.
                  </p>
                </>
              )}
              {tab === "lieferung" && (
                <>
                  <div className="span-two">
                    Mögliche Liefertage{days("delivery_days")}
                  </div>
                  {text("delivery_from", "Auslieferung von", "time")}
                  {text("delivery_to", "Auslieferung bis", "time")}
                  {num(
                    "delivery_stop_minutes",
                    "Übergabezeit pro Stopp (Minuten)",
                    1,
                    120,
                  )}
                  {toggle(
                    "route_geocoding",
                    "Adressabgleich mit OpenStreetMap/Nominatim erlauben",
                  )}
                  <p className="fineprint span-two">
                    Beim Adressabgleich wird die Lieferadresse an den
                    Kartendienst übertragen. Ohne Koordinaten arbeitet die
                    Planung mit Zeitpuffern. Kundenzeitfenster haben Vorrang;
                    nicht passende Aufträge bleiben offen.
                  </p>
                </>
              )}
              {tab === "schnittstellen" && (
                <>
                  {text("smtp_host", "E-Mail-Server (SMTP)")}
                  {text("smtp_user", "SMTP-Benutzer")}
                  <label>
                    SMTP-Port
                    <select
                      value={v.smtp_port || 587}
                      onChange={(e) =>
                        setV({ ...v, smtp_port: Number(e.target.value) })
                      }
                    >
                      <option value={587}>587 · STARTTLS</option>
                      <option value={465}>465 · TLS</option>
                    </select>
                  </label>
                  {text("smtp_from", "Absender-E-Mail", "email")}
                  {text(
                    "smtp_password",
                    settings.smtp_password_set
                      ? "SMTP-Passwort ersetzen (optional)"
                      : "SMTP-Passwort",
                    "password",
                  )}
                  {toggle(
                    "smtp_enabled",
                    "Automatischen E-Mail-Versand einschalten",
                  )}
                  {text("domain", "Webdomain")}
                  {text(
                    "instagram",
                    "Instagram-Profil (https://www.instagram.com/…)",
                  )}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={testMail}
                  >
                    Gespeicherte SMTP-Verbindung prüfen
                  </button>
                  <p className="fineprint span-two">
                    Die Domain muss zusätzlich im Hosting und per DNS verbunden
                    werden. E-Mail-Zugangsdaten werden verschlüsselt
                    gespeichert.
                  </p>
                </>
              )}
              {tab === "tse" && (
                <>
                  <label>
                    TSE-Anbieter
                    <select
                      value={v.tse_provider}
                      onChange={(e) =>
                        setV({ ...v, tse_provider: e.target.value })
                      }
                    >
                      <option value="">Noch nicht verbunden</option>
                      <option value="fiskaly">fiskaly</option>
                      <option value="other">
                        Anderer zertifizierter Anbieter
                      </option>
                    </select>
                  </label>
                  <p className="notice span-two">
                    Vor Live-Aktivierung: TSE-Vertrag, Transaktionssignierung,
                    Kassenseriennummer, DSFinV-K-Export und Meldung einrichten
                    und abnehmen. Die Anbieterauswahl allein verbindet noch
                    keine TSE.
                  </p>
                </>
              )}
              {tab === "drucker" && (
                <>
                  <label>
                    Druckweg
                    <select
                      value={v.printer_mode}
                      onChange={(e) =>
                        setV({ ...v, printer_mode: e.target.value })
                      }
                    >
                      <option value="browser">PDF / Browserdruck</option>
                      <option value="epson">
                        Epson ePOS (Hardwareanbindung geplant)
                      </option>
                      <option value="star">
                        Star (Hardwareanbindung geplant)
                      </option>
                    </select>
                  </label>
                  {text("printer_address", "Druckeradresse / Gerätename")}
                  <p className="span-two">
                    Bons werden im 80-mm-Format über die PDF-Druckfunktion
                    ausgegeben. Die direkte Druckeransteuerung wird mit dem
                    konkreten Modell am iPad eingerichtet.
                  </p>
                </>
              )}
              {tab === "apps" && (
                <>
                  <p className="span-two">
                    CRM, Kasse, Kundenportal und mobile Auslieferung sind im
                    Browser nutzbar. Auf iPad und iPhone: Safari → Teilen → Zum
                    Home-Bildschirm hinzufügen.
                  </p>
                  <Link className="button secondary" href="/konto">
                    Kundenportal
                  </Link>
                  <Link className="button secondary" href="/kassenzugang">
                    Mitarbeiterwahl
                  </Link>
                  <button
                    type="button"
                    disabled={!owner}
                    className="button"
                    onClick={async () => {
                      const r = await fetch("/api/terminal", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "enroll",
                          name: "Elias Kasse",
                        }),
                      });
                      const d = await r.json();
                      if (!r.ok) setNote(d.error);
                      else {
                        router.push("/kassenzugang");
                        router.refresh();
                      }
                    }}
                  >
                    Dieses Gerät als Kasse freigeben
                  </button>
                  <p className="fineprint span-two">
                    Gerätefreigabe: 30 Tage. PIN-Sitzung: 8 Stunden, über
                    „Mitarbeiter wechseln“ sperrbar. Native App-Store-Versionen
                    folgen als eigener Entwicklungsschritt.
                  </p>
                </>
              )}
              <button disabled={busy} className="button span-two">
                Einstellungen speichern
              </button>
            </form>
          )}
          {tab === "mitarbeiter" &&
            (!owner ? (
              <p>
                Du hast keinen Zugriff auf diese Inhalte. Mitarbeiterrechte
                verwaltet der Inhaber.
              </p>
            ) : (
              <>
                <p>
                  Alle Bereiche bleiben sichtbar. Freigaben bestimmen, welche
                  Inhalte gelesen und bearbeitet werden dürfen.
                </p>
                <button
                  className="button"
                  onClick={() =>
                    setEmployee({
                      name: "",
                      email: "",
                      phone: "",
                      address: "",
                      notes: "",
                      active: true,
                      permissions: ["uebersicht", "kasse"],
                    })
                  }
                >
                  Mitarbeiter anlegen
                </button>
                {op.data.employees.map((e) => (
                  <button
                    className="employee-row"
                    key={e.user_id}
                    onClick={() => setEmployee(e)}
                  >
                    <span>
                      <strong>{e.name}</strong>
                      <small>
                        M-{String(e.number).padStart(5, "0")} · {e.email}
                      </small>
                    </span>
                    <span>
                      {e.role === "owner"
                        ? "Inhaber"
                        : e.active
                          ? "Aktiv"
                          : "Gesperrt"}{" "}
                      · {e.has_pin ? "PIN eingerichtet" : "Ohne PIN"}
                    </span>
                  </button>
                ))}
                {employee && (
                  <form
                    className="form-grid two-columns employee-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const record = { ...employee };
                      if (!record.pin) delete record.pin;
                      if (!record.password) delete record.password;
                      if (await op.act("employee", { value: record }))
                        setEmployee(null);
                    }}
                  >
                    <h3 className="span-two">Mitarbeiterdaten</h3>
                    {(
                      ["name", "email", "phone", "address", "notes"] as const
                    ).map((k, i) => (
                      <label key={k}>
                        {
                          [
                            "Name",
                            "E-Mail (optional bei PIN-Zugang)",
                            "Telefon",
                            "Adresse",
                            "Notizen",
                          ][i]
                        }
                        <input
                          required={k === "name"}
                          type={k === "email" ? "email" : "text"}
                          value={employee[k] || ""}
                          onChange={(e) =>
                            setEmployee({ ...employee, [k]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Neue vierstellige PIN
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        autoComplete="new-password"
                        value={employee.pin || ""}
                        onChange={(e) =>
                          setEmployee({ ...employee, pin: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Neues Login-Passwort
                      <input
                        type="password"
                        minLength={10}
                        autoComplete="new-password"
                        value={employee.password || ""}
                        onChange={(e) =>
                          setEmployee({ ...employee, password: e.target.value })
                        }
                      />
                    </label>
                    <label className="checkline">
                      <input
                        type="checkbox"
                        checked={employee.active}
                        onChange={(e) =>
                          setEmployee({ ...employee, active: e.target.checked })
                        }
                      />
                      Zugang aktiv
                    </label>
                    <div className="permission-grid span-two">
                      {Object.entries(modules).map(([id, label]) => (
                        <label key={id} className="checkline">
                          <input
                            type="checkbox"
                            disabled={employee.role === "owner"}
                            checked={
                              employee.role === "owner" ||
                              employee.permissions?.includes(id) ||
                              false
                            }
                            onChange={(e) =>
                              setEmployee({
                                ...employee,
                                permissions: e.target.checked
                                  ? [...(employee.permissions || []), id]
                                  : (employee.permissions || []).filter(
                                      (x) => x !== id,
                                    ),
                              })
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <button disabled={op.busy} className="button">
                      Mitarbeiter speichern
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setEmployee(null)}
                    >
                      Abbrechen
                    </button>
                  </form>
                )}
              </>
            ))}
          {(note || op.message) && (
            <p role="status" className="notice">
              {op.message || note}
            </p>
          )}
        </section>
        {tab === "betrieb" && owner && (
          <section className="panel reset-panel">
            <h3>Einrichtung vor Übergabe zurücksetzen</h3>
            <p>
              Entfernt Einrichtungsbons, Abschlüsse, Lieferbelege und
              Rechnungen; zugehörige Lagerabgänge werden ausgeglichen.
              Stammdaten, Benutzer und Änderungsprotokoll bleiben erhalten.
            </p>
            <label>
              „EINRICHTUNG ZURÜCKSETZEN“ eingeben
              <input value={reset} onChange={(e) => setReset(e.target.value)} />
            </label>
            <button
              className="button secondary"
              disabled={op.busy || reset !== "EINRICHTUNG ZURÜCKSETZEN"}
              onClick={async () => {
                if (await op.act("reset", { confirm: reset })) setReset("");
              }}
            >
              Einrichtungsdaten zurücksetzen
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
