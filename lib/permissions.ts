export const modules = {
  uebersicht: "Übersicht",
  finanzen: "Finanzen",
  kasse: "Kasse",
  artikel: "Artikel & Lager",
  bestellungen: "Bestellungen",
  kunden: "Kunden",
  lieferung: "Lieferplanung",
  einkauf: "Einkauf",
  lieferanten: "Lieferanten",
  einstellungen: "Einstellungen",
  rabatt: "Mitarbeiterrabatt vergeben",
} as const;
export type Permission = keyof typeof modules;
export type StaffAccess = {
  role: string;
  permissions?: string[];
  active?: boolean;
};
export function can(access: StaffAccess, module: string) {
  return (
    access.active !== false &&
    (access.role === "owner" || (access.permissions || []).includes(module))
  );
}
