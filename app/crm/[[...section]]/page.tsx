import { can } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/server";
import AdminApp from "@/components/admin-app";
export const metadata = {
  title: "Elias Verwaltung",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const access = await requireStaff().catch(() => null);
  if (!access) redirect("/login");
  const { section } = await params;
  const requested = section?.[0] || "uebersicht";
  if (!can(access, requested)) {
    const first = [
      "uebersicht",
      "finanzen",
      "kasse",
      "artikel",
      "inventur",
      "bestellungen",
      "kunden",
      "lieferung",
      "einkauf",
      "lieferanten",
      "einstellungen",
    ].find((m) => can(access, m));
    if (first && first !== requested)
      redirect(first === "uebersicht" ? "/crm" : `/crm/${first}`);
  }
  return <AdminApp section={requested} />;
}
