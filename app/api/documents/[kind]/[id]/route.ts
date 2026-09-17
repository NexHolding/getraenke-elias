import { serviceDb, requireStaff, safeError } from "@/lib/server";
import { signedCustomer } from "@/lib/customer-server";
import { businessDocument } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { z } from "zod";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id } = await params;
    const type = z.enum(["invoice", "delivery"]).parse(kind);
    z.uuid().parse(id);
    const db = serviceDb();
    const { data: record, error } = await db
      .from(type === "invoice" ? "invoices" : "deliveries")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    let allowed = false;
    try {
      const a = await requireStaff();
      allowed =
        type === "invoice"
          ? ["finanzen", "kunden"].some((m) => can(a, m))
          : ["lieferung", "bestellungen", "kunden"].some((m) => can(a, m));
    } catch {}
    if (!allowed) {
      const c = await signedCustomer();
      if (c.id !== record.customer_id) throw new Error("FORBIDDEN");
    }
    const { data: order } = await db
      .from("orders")
      .select("*")
      .eq("id", record.order_id)
      .single();
    const { data: cfg } = await db
      .from("settings")
      .select("value")
      .eq("id", 1)
      .single();
    const pdf = businessDocument(type, record, order, cfg?.value || {});
    return new Response(new Uint8Array(pdf.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return safeError(e);
  }
}
