import { SYSTEM_ACCOUNT_EMAIL } from "./account-visibility";
/** Login aliases resolve to regular Supabase accounts; they never bypass authentication. */
export function resolveLoginEmail(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  if (normalized === "steuerberater")
    return "steuerberater@getraenke-elias.local";
  return normalized === "global_admin" ? SYSTEM_ACCOUNT_EMAIL : normalized;
}
