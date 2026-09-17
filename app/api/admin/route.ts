import { z } from "zod";
import type { Sale } from "@/lib/types";
async function allSales() {
  const db = serviceDb();
  const rows: Sale[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const { data, error } = await db
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return { data: rows, error: null };
  }
  throw new Error("Export too large");
}
import { requireStaff, serviceDb, safeError, sameOrigin } from "@/lib/server";
import {
  productSchema,
  supplierSchema,
  settingsSchema,
} from "@/lib/validation";
import { smtpTransport } from "@/lib/mail";
import { encrypt } from "@/lib/secrets";
export async function GET() {
  try {
    const { role } = await requireStaff();
    const db = serviceDb();
    const results = await Promise.all([
      db.from("products").select("*").order("name"),
      db.from("suppliers").select("*").order("name"),
      db
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      allSales(),
      db
        .from("purchases")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      db.from("settings").select("value,smtp_secret").eq("id", 1).single(),
      db
        .from("closings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("mail_outbox")
        .select("id,kind,recipient,subject,status,error,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (results.some((r) => r.error)) throw new Error("Database error");
    return Response.json(
      {
        products: results[0].data,
        suppliers: results[1].data,
        orders: results[2].data,
        sales: results[3].data,
        purchases: results[4].data,
        settings: {
          ...results[5].data?.value,
          smtp_password_set: !!results[5].data?.smtp_secret,
        },
        closings: results[6].data,
        mail: results[7].data,
        role,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { user, role } = await requireStaff();
    const db = serviceDb();
    const body = await req.json();
    const action = z.string().parse(body.action);
    let result: unknown = { ok: true };
    if (
      [
        "product",
        "bulk",
        "supplier",
        "settings",
        "closing",
        "receive",
        "order-status",
        "purchase-status",
        "smtp-test",
      ].includes(action) &&
      role !== "owner"
    )
      throw new Error("FORBIDDEN");
    if (action === "product") {
      const value = productSchema.parse(body.value);
      const { data: saved, error } = await db.rpc("save_product", {
        p_value: value,
        p_expected_revision: value.revision ?? null,
        p_actor: user.id,
      });
      if (error || !saved)
        throw new Error(
          "Artikel wurde zwischenzeitlich geändert. Bitte neu laden.",
        );
      await db
        .from("audit_log")
        .insert({
          table_name: "products",
          record_id: value.id,
          action: "staff_edit",
          actor: user.id,
        });
      const { error: re } = await db.rpc("generate_reorders");
      if (re) throw re;
    } else if (action === "bulk") {
      const ids = z.array(z.string()).min(1).max(500).parse(body.ids);
      const patch = z
        .object({
          price_cents: z.number().int().min(0).max(10000000).optional(),
          deposit_cents: z.number().int().min(0).max(100000).optional(),
          supplier_id: z.string().optional(),
          active: z.boolean().optional(),
        })
        .strict()
        .parse(body.patch);
      if (!Object.keys(patch).length) throw new Error("Empty patch");
      const { error } = await db.from("products").update(patch).in("id", ids);
      if (error) throw error;
      await db
        .from("audit_log")
        .insert({
          table_name: "products",
          action: "bulk_edit",
          actor: user.id,
          details: { ids, patch },
        });
    } else if (action === "supplier") {
      const value = supplierSchema.parse(body.value);
      const { error } = await db.from("suppliers").upsert(value);
      if (error) throw error;
    } else if (action === "settings") {
      const v = settingsSchema.parse(body.value);
      const { smtp_password, ...publicValue } = v;
      const payload: { value: typeof publicValue; smtp_secret?: string } = {
        value: publicValue,
      };
      if (smtp_password) payload.smtp_secret = encrypt(smtp_password);
      const { error } = await db.from("settings").update(payload).eq("id", 1);
      if (error) throw error;
    } else if (action === "smtp-test") {
      const { transport } = await smtpTransport();
      await transport.verify();
      transport.close();
      result = { ok: true };
    } else if (action === "reorder") {
      const { data, error } = await db.rpc("generate_reorders");
      if (error) throw error;
      result = { created: data };
    } else if (action === "receive") {
      const { error } = await db.rpc("receive_purchase", {
        p_id: z.uuid().parse(body.id),
        p_actor: user.id,
      });
      if (error) throw error;
    } else if (action === "purchase-status") {
      const { error } = await db
        .from("purchases")
        .update({ status: "cancelled" })
        .eq("id", z.uuid().parse(body.id))
        .eq("status", "draft");
      if (error) throw error;
    } else if (action === "order-status") {
      const { error } = await db
        .from("orders")
        .update({
          status: z
            .enum(["new", "confirmed", "delivering", "completed", "cancelled"])
            .parse(body.status),
        })
        .eq("id", z.uuid().parse(body.id));
      if (error) throw error;
    } else if (action === "sale") {
      const v = z
        .object({
          id: z.uuid(),
          lines: z
            .array(
              z.object({
                id: z.string(),
                quantity: z.number().int().min(1).max(1000),
              }),
            )
            .max(200),
          payment: z.enum(["cash", "card"]),
          returns: z
            .array(
              z.object({
                quantity: z.number().int().min(1).max(1000),
                deposit_cents: z.union([
                  z.literal(8),
                  z.literal(15),
                  z.literal(25),
                  z.literal(150),
                ]),
              }),
            )
            .max(4),
        })
        .parse(body.value);
      const { data, error } = await db.rpc("save_test_sale", {
        p_id: v.id,
        p_lines: v.lines,
        p_payment: v.payment,
        p_actor: user.id,
        p_returns: v.returns,
      });
      if (error) throw error;
      result = data;
    } else if (action === "closing") {
      const v = z
        .object({
          kind: z.enum(["day", "month"]),
          period: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
        })
        .parse(body.value);
      const { data, error } = await db.rpc("close_test_period", {
        p_kind: v.kind,
        p_period: v.period,
        p_actor: user.id,
      });
      if (error) throw error;
      result = data;
    } else throw new Error("Invalid action");
    return Response.json(result);
  } catch (e) {
    if (e instanceof z.ZodError)
      return Response.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" · "),
        },
        { status: 400 },
      );
    return safeError(e);
  }
}
