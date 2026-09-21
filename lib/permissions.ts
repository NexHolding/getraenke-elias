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
  storno: "Belege stornieren und Rückgaben buchen",
  rabatt: "Rabatte auf Artikel und Warenkorb vergeben",
} as const;
export type Permission = keyof typeof modules;
export type StaffAccess = {
  role: string;
  permissions?: string[];
  active?: boolean;
  finance_readonly?: boolean;
};
export function can(access: StaffAccess, module: string) {
  if (financeReadOnly(access) && module !== "finanzen") return false;
  return (
    access.active !== false &&
    (access.role === "owner" || (access.permissions || []).includes(module))
  );
}

export function financeReadOnly(access: StaffAccess) {
  return access.role !== "owner" && access.finance_readonly === true;
}
