import { deliveryAddressFields, formatDeliveryAddress } from "./delivery-address";
import type { Settings } from "./types";
export function businessAddressFields(settings: Partial<Settings>) {
  const a = deliveryAddressFields({ street: settings.business_street, house_number: settings.business_house_number, postal_code: settings.business_postal_code, city: settings.business_city, address: (settings.business_address || "Wartbergstraße 3 · 74076 Heilbronn").replace(/\s*·\s*/g, ", ") });
  return { business_street:a.street, business_house_number:a.house_number, business_postal_code:a.postal_code, business_city:a.city };
}
export function businessAddress(settings: ReturnType<typeof businessAddressFields>) {
  return formatDeliveryAddress({street:settings.business_street,house_number:settings.business_house_number,postal_code:settings.business_postal_code,city:settings.business_city}).replace(", ", " · ");
}
