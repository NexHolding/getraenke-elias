import { serviceDb } from "@/lib/server";
import { initialProducts } from "@/lib/catalog";
export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return Response.json({ products: initialProducts, instagram: "" });
  const db = serviceDb();
  const [{ data, error }, { data: settings }] = await Promise.all([
    db.from("products").select("*").eq("active", true).order("name"),
    db.from("settings").select("value").eq("id", 1).single(),
  ]);
  if (error) return Response.json({ products: initialProducts, instagram: "" });
  return Response.json(
    {
      products: data.map((p) => ({
        ...p,
        stock: null,
        loose_stock: 0,
        cost_net_cents: null,
        stock_version: 0,
        min_stock: 0,
        target_stock: 0,
        supplier_id: null,
        reorder_enabled: false,
      })),
      instagram: settings?.value?.instagram || "",
      guest_orders: settings?.value?.guest_orders !== false,
    },
    { headers: { "Cache-Control": "public, max-age=30" } },
  );
}
