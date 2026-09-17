export const modules = {
  uebersicht: "Übersicht",
  finanzen: "Finanzen",
  kasse: "Kasse",
  artikel: "Artikel & Lager",
  inventur: "Inventur",
  bestandskorrektur:
    "Bruch / Bestandskorrektur buchen (zusätzlich zu Inventur)",
  bestellungen: "Bestellungen",
  kunden: "Kunden",
  lieferung: "Lieferplanung",
  einkauf: "Einkauf",
  lieferanten: "Lieferanten",
  einstellungen: "Einstellungen",
  rabatt: "Rabatte auf Artikel und Warenkorb vergeben",
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
