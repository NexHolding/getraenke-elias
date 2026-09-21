import "server-only";
import {
  SYSTEM_ACCOUNT_EMAIL,
  isVisibleBusinessAccount,
} from "./account-visibility";
import { serviceDb } from "./server";
import { readAllRows } from "./database-read";
import { buildTourPreview } from "./subscription-preview";
import type { Order, Subscription, Customer, Product } from "./types";
export async function loadTourPreview(date: string) {
  const [orders, subscriptions, customers, products, settings, systemStaff] =
    await Promise.all([
      readAllRows("orders", { order: "id" }),
      readAllRows("subscriptions", { order: "id" }),
      readAllRows("customers", { order: "id" }),
      readAllRows("products", { order: "id" }),
      serviceDb().from("settings").select("value").eq("id", 1).single(),
      serviceDb()
        .from("staff")
        .select("user_id")
        .eq("email", SYSTEM_ACCOUNT_EMAIL),
    ]);
  if (settings.error) throw settings.error;
  if (systemStaff.error) throw systemStaff.error;
  const systemIds = new Set((systemStaff.data || []).map((s) => s.user_id));
  const visibleCustomers = (customers as Customer[]).filter((c) =>
    isVisibleBusinessAccount(c, systemIds),
  );
  const hiddenCustomers = new Set(
    (customers as Customer[])
      .filter((c) => !isVisibleBusinessAccount(c, systemIds))
      .map((c) => c.id),
  );
  return {
    preview: buildTourPreview(
      (orders as Order[]).filter(
        (o) => !o.customer_id || !hiddenCustomers.has(o.customer_id),
      ),
      subscriptions as Subscription[],
      visibleCustomers,
      products as Product[],
      date,
      settings.data.value,
    ),
    settings: settings.data.value,
  };
}
