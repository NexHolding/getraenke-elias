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
  try {
    await requireStaff();
  } catch {
    redirect("/login");
  }
  const { section } = await params;
  return <AdminApp section={section?.[0] || "uebersicht"} />;
}
