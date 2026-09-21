import { z } from "zod";
import { serviceDb, requireStaff, safeError } from "@/lib/server";
import { deliveryListPdf } from "@/lib/delivery-list";
export async function GET(req: Request) {
  try {
    await requireStaff("lieferung");
    const url = new URL(req.url),
      date = z.iso.date().parse(url.searchParams.get("date"));
    const db = serviceDb();
    const [orders, settings] = await Promise.all([
      db
        .from("orders")
        .select("*")
        .eq("delivery_date", date)
        .in("status", ["confirmed", "partial", "delivering"])
        .order("route_position", { nullsFirst: false })
        .order("number"),
      db.from("settings").select("value").eq("id", 1).single(),
    ]);
    if (orders.error) throw orders.error;
    if (settings.error) throw settings.error;
    const bytes = deliveryListPdf(orders.data, date, settings.data.value);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="Elias-Lieferliste-${date}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return safeError(error);
  }
}
