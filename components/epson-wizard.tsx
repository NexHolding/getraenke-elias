"use client";
import { useState } from "react";
import type { Settings } from "@/lib/types";
import { printerOrigin, printerFingerprint } from "@/lib/epson";
import { probePrinter, printPdf, verifyPrinter } from "@/lib/epson-client";
import { receiptLogo } from "@/lib/receipt-logo";
export default function EpsonWizard({
  value,
  onChange,
  save,
  disabled = false,
}: {
  value: Settings;
  onChange: (v: Settings) => void;
  save: (v: Settings) => Promise<unknown>;
  disabled?: boolean;
}) {
  const [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [checked, setChecked] = useState(false),
    [connected, setConnected] = useState(""),
    [tested, setTested] = useState(""),
    [visible, setVisible] = useState(false);
  let fingerprint = "";
  try {
    fingerprint = printerFingerprint(value);
  } catch {}
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Druckereinrichtung fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="span-two printer-wizard"
      aria-label="Epson-Einrichtungsassistent"
    >
      <p className="eyebrow">BON-DRUCKER</p>
      <h3>Epson Schritt für Schritt verbinden</h3>
      <p>
        Direkter Bondruck ohne Druckdialog über einen Epson-TM-Netzwerkdrucker
        mit ePOS-Print XML. Einrichtung auf jedem Kassentablet durchführen. USB
        und Bluetooth benötigen eine passende native App und werden hier nicht
        direkt verbunden.
      </p>
      <nav className="wizard-steps" aria-label="Einrichtungsschritte">
        {["Gerät", "Netzwerk", "Verbindung", "Testdruck"].map((label, i) => (
          <button
            type="button"
            key={label}
            className={step === i + 1 ? "active" : ""}
            onClick={() => setStep(i + 1)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </nav>
      {step === 1 && (
        <div>
          <h4>1 · Kompatibles Gerät vorbereiten</h4>
          <p>
            Zum Beispiel Epson TM-m30III mit LAN/WLAN. Im Handbuch des konkreten
            Modells muss ePOS-Print XML unterstützt sein. Eine 80-mm-Papierrolle
            einlegen und den Drucker einschalten.
          </p>
          <label>
            Modell
            <input
              aria-label="Epson-Modell"
              placeholder="z. B. TM-m30III"
              value={value.printer_model || ""}
              onChange={(e) =>
                onChange({ ...value, printer_model: e.target.value })
              }
            />
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() => setStep(2)}
          >
            Weiter zum Netzwerk
          </button>
        </div>
      )}
      {step === 2 && (
        <div>
          <h4>2 · Netzwerk und HTTPS einrichten</h4>
          <ol>
            <li>
              Tablet und Drucker mit demselben lokalen Netz verbinden.
              Gastnetz-Isolierung ausschalten und dem Drucker eine feste
              Adresse/DHCP-Reservierung zuweisen.
            </li>
            <li>
              In Epson Web Config ePOS-Print aktivieren, Gerätekennung prüfen
              und den Druck-Spooler ausschalten. Nur dann bestätigt die direkte
              Antwort den abgeschlossenen Druck.
            </li>
            <li>
              HTTPS mit einem auf dem Tablet vertrauenswürdigen Zertifikat
              einrichten. Der verwendete Hostname muss zum Zertifikat passen.
              Die App kann Zertifikatswarnungen nicht umgehen.
            </li>
            <li>
              Dem Browser lokalen Netzwerkzugriff erlauben, wenn danach gefragt
              wird. Diese Einrichtung bei jedem neuen Tablet prüfen.
            </li>
          </ol>
          <a
            href="https://files.support.epson.com/pdf/pos/bulk/tm-m30iii_trg_en_revf.pdf"
            target="_blank"
            rel="noreferrer"
            className="text-link"
          >
            Epson TM-m30III: offizielles Einrichtungshandbuch
          </a>
          <label className="checkline">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            ePOS aktiv, HTTPS eingerichtet und Spooler ausgeschaltet
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={!checked}
            onClick={() => setStep(3)}
          >
            Verbindung prüfen
          </button>
        </div>
      )}
      {step === 3 && (
        <div>
          <h4>3 · Drucker auf diesem Tablet erreichen</h4>
          <label>
            HTTPS-Druckeradresse
            <input
              aria-label="HTTPS-Druckeradresse"
              placeholder="https://drucker.example.de"
              value={value.printer_address}
              onChange={(e) =>
                onChange({ ...value, printer_address: e.target.value })
              }
            />
          </label>
          <label>
            ePOS-Gerätekennung
            <input
              aria-label="ePOS-Gerätekennung"
              value={value.printer_device_id || "local_printer"}
              onChange={(e) =>
                onChange({ ...value, printer_device_id: e.target.value })
              }
            />
          </label>
          <label>
            Druckbreite für 80-mm-Papier
            <select
              aria-label="Druckbreite"
              value={value.printer_width_dots || 576}
              onChange={(e) =>
                onChange({
                  ...value,
                  printer_width_dots: Number(e.target.value) as 512 | 576,
                })
              }
            >
              <option value={576}>576 Punkte (z. B. TM-m30III)</option>
              <option value={512}>512 Punkte (modellabhängig)</option>
            </select>
          </label>
          {fingerprint && (
            <a
              href={printerOrigin(value.printer_address)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              Epson Web Config öffnen
            </a>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy || !checked || !fingerprint}
            onClick={() =>
              work(async () => {
                const status = await probePrinter(value);
                setConnected(fingerprint);
                setMessage(
                  status.nearEnd
                    ? "Verbindung erfolgreich. Papier geht zur Neige."
                    : "Drucker antwortet. Noch kein Papier ausgegeben.",
                );
                setStep(4);
              })
            }
          >
            Status ohne Papierausgabe prüfen
          </button>
          {!checked && (
            <p>Bitte zuerst die Voraussetzungen in Schritt 2 bestätigen.</p>
          )}
        </div>
      )}
      {step === 4 && (
        <div>
          <h4>4 · Testbon drucken und bestätigen</h4>
          <p>
            Der Testbon enthält das Elias-Logo und löst keine Buchung aus. Bei
            fehlender Antwort zuerst am Gerät prüfen, ob Papier ausgegeben
            wurde.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !fingerprint || connected !== fingerprint}
            onClick={() =>
              work(async () => {
                setTested("");
                setVisible(false);
                const { jsPDF } = await import("jspdf");
                const pdf = new jsPDF({ unit: "mm", format: [80, 115] });
                const logo = pdf.getImageProperties(receiptLogo);
                pdf.addImage(
                  receiptLogo,
                  "PNG",
                  14,
                  6,
                  52,
                  (52 * logo.height) / logo.width,
                );
                pdf.setFontSize(12);
                pdf.text("EPSON TESTDRUCK", 40, 42, { align: "center" });
                pdf.setFontSize(9);
                pdf.text(
                  [
                    "Getränke Elias · Einrichtung",
                    "Keine Buchung / kein Kassenbeleg",
                    "Umlaute: Ä Ö Ü ä ö ü ß",
                    "80 mm · Logo · Text · Papierschnitt",
                    new Date().toLocaleString("de-DE"),
                  ],
                  6,
                  54,
                );
                await printPdf(
                  value,
                  new Uint8Array(pdf.output("arraybuffer")),
                );
                setTested(fingerprint);
                setMessage(
                  "Epson hat den Auftrag bestätigt. Bitte Ausdruck prüfen.",
                );
              })
            }
          >
            Testbon automatisch drucken
          </button>
          {connected !== fingerprint && (
            <p>Bitte zuerst in Schritt 3 die aktuelle Verbindung prüfen.</p>
          )}
          <label className="checkline">
            <input
              type="checkbox"
              checked={visible}
              disabled={tested !== fingerprint || !tested}
              onChange={(e) => setVisible(e.target.checked)}
            />
            Bon ist vollständig, Logo und Text sind lesbar, Papier wurde
            abgeschnitten
          </label>
          <button
            type="button"
            className="button"
            disabled={
              disabled || busy || !visible || !tested || tested !== fingerprint
            }
            onClick={() =>
              work(async () => {
                const next = { ...value, printer_mode: "epson" };
                const result = await save(next);
                if (!result)
                  throw new Error(
                    "Einstellungen konnten nicht gespeichert werden.",
                  );
                verifyPrinter(next);
                onChange(next);
                setMessage("Epson ist auf diesem Tablet eingerichtet.");
              })
            }
          >
            Epson aktivieren & speichern
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <p className="fineprint">
        Aktueller Druckweg:{" "}
        {value.printer_mode === "epson"
          ? "Epson ePOS"
          : "PDF / manuelle Ausgabe"}
        . Kein automatischer Suchlauf im Netzwerk. Eine erfolgreiche Verbindung
        ersetzt keine TSE-Anbindung.
      </p>
      <button
        type="button"
        className="text-link"
        onClick={() => onChange({ ...value, printer_mode: "browser" })}
      >
        Auf PDF-Ausgabe umstellen (anschließend speichern)
      </button>
    </section>
  );
}
