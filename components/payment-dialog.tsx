"use client";
import { useState } from "react";
import { Banknote, CreditCard, Check, X } from "lucide-react";
import { euro } from "@/lib/money";
import { cashCents, cashChange } from "@/lib/cash-payment";
import { useDialog } from "./use-dialog";

export default function PaymentDialog({
  total,
  payment,
  stale,
  onCancel,
  onConfirm,
}: {
  total: number;
  payment: string;
  stale: boolean;
  onCancel: () => void;
  onConfirm: (received: number | null) => void;
}) {
  const [given, setGiven] = useState("");
  useDialog(true, onCancel);
  const cash = payment === "cash",
    refund = total < 0,
    zero = total === 0;
  const received = cashCents(given),
    change = cashChange(total, received);
  const valid =
    !stale &&
    Number.isSafeInteger(total) &&
    (!cash || refund || zero || change !== null);
  const suggestions = [500, 1000, 2000, 5000, 10000, 20000]
    .filter((v) => v > total)
    .slice(0, 4);
  return (
    <div className="modal-backdrop">
      <section
        className="modal payment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
      >
        <div className="payment-dialog-head">
          <span className="payment-icon">
            {cash ? <Banknote size={28} /> : <CreditCard size={28} />}
          </span>
          <div>
            <p className="eyebrow">ZAHLUNG ABSCHLIESSEN</p>
            <h2 id="payment-title">
              {zero
                ? "Betrag ausgeglichen"
                : cash
                  ? refund
                    ? "Barauszahlung"
                    : "Barzahlung"
                  : refund
                    ? "EC-Erstattung"
                    : "EC-Kartenzahlung"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Zahlungsfenster schließen"
            onClick={onCancel}
          >
            <X />
          </button>
        </div>
        <div className="payment-amount">
          <span>
            {refund
              ? "An den Kunden auszahlen"
              : cash
                ? "Zu bezahlen"
                : "Diesen Betrag am EC-Gerät eingeben"}
          </span>
          <strong>{euro(Math.abs(total))}</strong>
        </div>
        {cash && !refund && !zero ? (
          <>
            <label className="cash-given">
              Vom Kunden gegeben (€)
              <input
                autoFocus
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Betrag eingeben"
                aria-label="Vom Kunden gegeben (€)"
                value={given}
                onChange={(e) => setGiven(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <div
              className="cash-shortcuts"
              aria-label="Bargeldbetrag auswählen"
            >
              <button
                onClick={() =>
                  setGiven((total / 100).toFixed(2).replace(".", ","))
                }
              >
                Passend
              </button>
              {suggestions.map((c) => (
                <button key={c} onClick={() => setGiven(String(c / 100))}>
                  {euro(c)}
                </button>
              ))}
            </div>
            <div
              className={`cash-change ${change !== null ? "ready" : ""}`}
              role="status"
            >
              <span>Rückgeld</span>
              <strong>{change === null ? "—" : euro(change)}</strong>
            </div>
            {given && received === null && (
              <p className="error" role="alert">
                Bitte einen gültigen Betrag mit höchstens zwei Nachkommastellen
                eingeben.
              </p>
            )}
            {received !== null && received < total && (
              <p className="payment-hint">
                Es fehlen noch {euro(total - received)}.
              </p>
            )}
          </>
        ) : (
          <p className="payment-instruction">
            {zero
              ? "Es ist keine Zahlung erforderlich. Den ausgeglichenen Vorgang jetzt verbuchen."
              : cash
                ? "Den angezeigten Betrag auszahlen und anschließend bestätigen."
                : refund
                  ? "Erstattung am separaten SumUp-Gerät durchführen. Erst nach erfolgreicher Erstattung bestätigen."
                  : "Zahlung am separaten SumUp-Gerät durchführen. Erst nach erfolgreicher Zahlung bestätigen."}
          </p>
        )}
        {stale && (
          <p role="alert" className="error">
            Der Bon wurde geändert. Bitte abbrechen und den aktuellen Betrag
            erneut prüfen.
          </p>
        )}
        <button
          className="button payment-confirm"
          disabled={!valid}
          onClick={() => {
            if (valid) onConfirm(cash && !refund && !zero ? received : null);
          }}
        >
          <Check size={23} />
          {zero
            ? "Vorgang abschließen"
            : cash
              ? refund
                ? "Auszahlung bestätigt"
                : "Barzahlung abschließen"
              : refund
                ? "EC-Erstattung erfolgreich"
                : "EC-Kartenzahlung erfolgreich"}
        </button>
        <button className="button secondary full" onClick={onCancel}>
          Zurück zum Bon
        </button>
      </section>
    </div>
  );
}
