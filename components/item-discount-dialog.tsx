"use client";
import { useState } from "react";
import { X, Percent } from "lucide-react";
import { useDialog } from "./use-dialog";
import { discountReasons, discountedPrice } from "@/lib/discounts";
import { euro, pack } from "@/lib/money";
import type { Product } from "@/lib/types";
export default function ItemDiscountDialog({
  product,
  percent,
  reason,
  cartDiscount,
  onClose,
  onApply,
}: {
  product: Product;
  percent: number;
  reason: string;
  cartDiscount: number;
  onClose: () => void;
  onApply: (percent: number, reason: string) => void;
}) {
  const [value, setValue] = useState(percent ? String(percent) : "");
  const [why, setWhy] = useState(reason || discountReasons[0]);
  const rate = Number(value),
    valid = /^\d{1,3}$/.test(value) && rate >= 0 && rate <= 100;
  useDialog(true, onClose);
  return (
    <div className="modal-backdrop">
      <section
        className="modal item-discount-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-discount-title"
      >
        <div className="panel-head">
          <h2 id="item-discount-title">
            <Percent size={23} /> Artikelrabatt
          </h2>
          <button
            className="icon-button"
            aria-label="Rabattfenster schließen"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <p className="discount-product">
          <strong>{product.name}</strong>
          <span>
            {pack(product)} · {euro(product.price_cents)} je Gebinde
          </span>
        </p>
        {cartDiscount > 0 && (
          <p className="notice">
            Dieser Artikelrabatt ersetzt den Warenkorbrabatt von {cartDiscount}{" "}
            %. Pfand bleibt unverändert.
          </p>
        )}
        <label className="discount-entry">
          Rabatt für diesen Artikel (%)
          <div>
            <input
              autoFocus
              aria-label="Artikelrabatt (%)"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Prozent eingeben"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
            />
            <span>%</span>
          </div>
        </label>
        <div className="discount-shortcuts">
          {[10, 20, 30, 50].map((n) => (
            <button key={n} onClick={() => setValue(String(n))}>
              {n} %
            </button>
          ))}
        </div>
        <label className="discount-reason">
          Rabattgrund
          <select value={why} onChange={(e) => setWhy(e.target.value)}>
            {discountReasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        {value && !valid && (
          <p role="alert" className="error">
            Bitte einen ganzen Prozentsatz von 0 bis 100 eingeben.
          </p>
        )}
        {valid && (
          <p className="discount-preview">
            Neuer Preis je Gebinde{" "}
            <strong>{euro(discountedPrice(product.price_cents, rate))}</strong>
            <small>
              + {euro(product.deposit_cents ?? 0)} Pfand · für alle Einheiten
              dieser Bonposition
            </small>
          </p>
        )}
        <button
          className="button full"
          disabled={!valid}
          onClick={() => {
            if (valid) onApply(rate, why);
          }}
        >
          {cartDiscount > 0
            ? "Gesamtrabatt ersetzen & übernehmen"
            : "Artikelrabatt übernehmen"}
        </button>
        {percent > 0 && (
          <button
            className="button secondary full"
            onClick={() => onApply(0, "")}
          >
            Artikelrabatt entfernen
          </button>
        )}
      </section>
    </div>
  );
}
