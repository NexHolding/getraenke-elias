"use client";
import {
  deliveryAddressFields,
  type DeliveryAddress,
} from "@/lib/delivery-address";
export function DeliveryAddressFields({
  value,
  onChange,
}: {
  value?: (Partial<DeliveryAddress> & { address?: string }) | null;
  onChange?: (address: DeliveryAddress) => void;
}) {
  const address = deliveryAddressFields(value);
  const fields = [
    ["street", "Straße", "address-line1", 150],
    ["house_number", "Hausnummer", "address-line2", 30],
    ["postal_code", "Postleitzahl", "postal-code", 5],
    ["city", "Ort", "address-level2", 100],
  ] as const;
  return (
    <fieldset className="delivery-address-fields">
      <legend>Lieferadresse</legend>
      {value?.address && !Object.values(address).some(Boolean) && (
        <p className="notice">
          Bisherige Adresse: {value.address}. Bitte die Angaben auf die
          einzelnen Felder verteilen.
        </p>
      )}
      <div className="delivery-address-grid">
        {fields.map(([key, label, autocomplete, max]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              required
              maxLength={max}
              minLength={key === "street" || key === "city" ? 2 : 1}
              autoComplete={autocomplete}
              inputMode={key === "postal_code" ? "numeric" : undefined}
              pattern={key === "postal_code" ? "[0-9]{5}" : undefined}
              title={
                key === "postal_code" ? "Fünfstellige Postleitzahl" : undefined
              }
              {...(onChange
                ? {
                    value: address[key],
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      onChange({ ...address, [key]: e.target.value }),
                  }
                : { defaultValue: address[key] })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
