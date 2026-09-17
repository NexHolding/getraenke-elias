import { z } from "zod";
export type DeliveryAddress = {
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
};
export const deliveryAddressShape = {
  street: z.string().trim().min(2).max(150),
  house_number: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^\d[\p{L}\d\s/.-]*$/u, "Bitte eine gültige Hausnummer eingeben."),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Bitte eine fünfstellige Postleitzahl eingeben."),
  city: z.string().trim().min(2).max(100),
};
export function formatDeliveryAddress(a: DeliveryAddress) {
  return `${a.street.trim()} ${a.house_number.trim()}, ${a.postal_code.trim()} ${a.city.trim()}`;
}
export function deliveryAddressFields(
  value: (Partial<DeliveryAddress> & { address?: string }) | null | undefined,
): DeliveryAddress {
  const empty = { street: "", house_number: "", postal_code: "", city: "" };
  if (!value) return empty;
  if (value.street || value.house_number || value.postal_code || value.city)
    return {
      street: value.street || "",
      house_number: value.house_number || "",
      postal_code: value.postal_code || "",
      city: value.city || "",
    };
  const match = value.address
    ?.trim()
    .match(
      /^([^,\n]+?)\s+(\d+\s?[a-zA-Z]?(?:\s?[-/]\s?\d+\s?[a-zA-Z]?)?)(?:\s*,\s*|\s*\n\s*|\s+)(\d{5})\s+([^,\n]+)$/,
    );
  return match
    ? {
        street: match[1].trim(),
        house_number: match[2].trim(),
        postal_code: match[3],
        city: match[4].trim(),
      }
    : empty;
}
