/** Reserved support identity; ordinary owner accounts remain visible. */
export const SYSTEM_ACCOUNT_EMAIL = "global_admin@getraenke-elias.local";

export function isSystemAccountEmail(email: unknown): boolean {
  return (
    typeof email === "string" &&
    email.trim().toLowerCase() === SYSTEM_ACCOUNT_EMAIL
  );
}

export function isVisibleBusinessAccount(
  account: { email?: unknown; user_id?: unknown },
  systemUserIds: ReadonlySet<string>,
): boolean {
  return (
    !isSystemAccountEmail(account.email) &&
    !(typeof account.user_id === "string" && systemUserIds.has(account.user_id))
  );
}
