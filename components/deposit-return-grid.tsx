"use client";
import { BottleWine, Package } from "lucide-react";
import { returnTypes } from "@/lib/deposits";
import { euro } from "@/lib/money";
import NumberInput from "./number-input";
export default function DepositReturnGrid({
  value,
  onChange,
}: {
  value: Record<string, number>;
  onChange: (value: Record<string, number>) => void;
}) {
  const change = (cents: number, quantity: number) =>
    onChange({
      ...value,
      [cents]: Math.max(
        0,
        Math.min(1000, Math.floor(Number.isFinite(quantity) ? quantity : 0)),
      ),
    });
  return (
    <div className="return-grid">
      {returnTypes.map((d) => (
        <div className="return-tile" key={d.cents}>
          <button
            type="button"
            onClick={() => change(d.cents, (value[d.cents] || 0) + 1)}
          >
            {d.kind === "bottle" ? (
              <BottleWine size={22} />
            ) : (
              <Package size={22} />
            )}
            <strong>{d.label}</strong>
            <span>{euro(d.cents)}</span>
          </button>
          <label>
            Menge
            <NumberInput
              aria-label={`Rückgabe ${d.label}`}
              placeholder="Menge eingeben"
              min="0"
              max="1000"
              step="1"
              value={value[d.cents] || 0}
              onChange={(e) => change(d.cents, Number(e.target.value))}
            />
          </label>
        </div>
      ))}
    </div>
  );
}
