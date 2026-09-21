import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  deliveryAddressFields,
  deliveryAddressShape,
  formatDeliveryAddress,
} from "./delivery-address";

const addressSchema = z.object(deliveryAddressShape);
const addressKeys = [
  "address",
  "street",
  "house_number",
  "postal_code",
  "city",
] as const;
type CustomerContact = {
  id: string;
  user_id?: string | null;
  address?: string;
  street?: string;
  house_number?: string;
  postal_code?: string;
  city?: string;
  phone?: string;
};
const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function registrationDeliveryDetails(source: Record<string, unknown>) {
  const parsed = addressSchema.safeParse(source);
  const phone = clean(source.phone);
  return {
    ...(parsed.success
      ? { ...parsed.data, address: formatDeliveryAddress(parsed.data) }
      : {}),
    ...(phone && phone.length <= 80 ? { phone } : {}),
  };
}

// A saved profile always wins over signup metadata or an order-specific address.
// Never combine fragments from two different addresses.
export function missingCustomerDeliveryDetails(
  current: CustomerContact,
  source: Record<string, unknown>,
) {
  const patch: Record<string, string> = {};
  const ownAddress = addressSchema.safeParse(deliveryAddressFields(current));
  if (ownAddress.success) {
    const normalized = {
      ...ownAddress.data,
      address: formatDeliveryAddress(ownAddress.data),
    };
    for (const key of addressKeys)
      if (!clean(current[key])) patch[key] = normalized[key];
  } else if (addressKeys.every((key) => !clean(current[key]))) {
    const candidate = registrationDeliveryDetails(source);
    if (candidate.address)
      for (const key of addressKeys) patch[key] = candidate[key]!;
  }
  const phone = clean(source.phone);
  if (!clean(current.phone) && phone && phone.length <= 80) patch.phone = phone;
  return patch;
}

export async function fillCustomerDeliveryDefaults<T extends CustomerContact>(
  db: SupabaseClient,
  current: T,
  userId: string,
  source: Record<string, unknown>,
): Promise<T> {
  if (current.user_id !== userId) throw new Error("FORBIDDEN");
  const patch = missingCustomerDeliveryDetails(current, source);
  if (!Object.keys(patch).length) return current;
  let update = db
    .from("customers")
    .update(patch)
    .eq("id", current.id)
    .eq("user_id", userId);
  // Compare-and-set prevents a simultaneous profile edit being overwritten.
  for (const key of [...addressKeys, "phone"] as const)
    update = update.eq(key, current[key] || "");
  const { data, error } = await update.select("*").maybeSingle();
  if (error) throw error;
  if (data) return data as T;
  const fresh = await db
    .from("customers")
    .select("*")
    .eq("id", current.id)
    .eq("user_id", userId)
    .single();
  if (fresh.error) throw fresh.error;
  return fresh.data as T;
}
