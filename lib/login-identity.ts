/** Login aliases resolve to regular Supabase accounts; they never bypass authentication. */
export function resolveLoginEmail(identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  return normalized === "global_admin"
    ? "global_admin@getraenke-elias.local"
    : normalized;
}
