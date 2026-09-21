"use client";
import { useState } from "react";
import DepositReturnGrid from "./deposit-return-grid";
import { euro } from "@/lib/money";
import { returnAmount } from "@/lib/delivery-totals";
import { useDialog } from "./use-dialog";
export default function DeliveryDepositDialog({
  value,
  save,
  close,
}: {
  value: Record<string, number>;
  save: (value: Record<string, number>) => Promise<boolean>;
  close: () => void;
}) {
  const [draft, setDraft] = useState(value),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useDialog(true, () => {
    if (!busy) close();
  });
  return (
    <div className="modal-backdrop delivery-deposit-overlay">
      <section
        className="modal delivery-deposit-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Pfand erfassen"
      >
        <div className="panel-head">
          <div>
            <span className="eyebrow">Leergut bei Lieferung</span>
            <h2>Pfand erfassen</h2>
          </div>
          <button className="button secondary" disabled={busy} onClick={close}>
            Abbrechen
          </button>
        </div>
        <p>
          Zurückgenommene Flaschen und Kästen antippen oder die Menge eingeben.
          Die gleichen Pfandarten wie in der Kasse.
        </p>
        <fieldset disabled={busy} className="delivery-fields">
          <DepositReturnGrid value={draft} onChange={setDraft} />
        </fieldset>
        <div className="delivery-deposit-footer">
          <strong>Pfandabzug: {euro(returnAmount(draft))}</strong>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (await save(draft)) close();
                else
                  setError(
                    "Pfand nicht gespeichert. Bitte die Meldung im Lieferschein prüfen.",
                  );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Wird gespeichert …" : "Pfand speichern"}
          </button>
        </div>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
