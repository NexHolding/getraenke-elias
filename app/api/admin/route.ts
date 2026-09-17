import { z } from "zod";
import { can } from "@/lib/permissions";
import { depositFor } from "@/lib/deposits";
import type { Sale, Order } from "@/lib/types";
import { readAllRows } from "@/lib/database-read";
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
    const access = await requireStaff();
    const { role, permissions, name } = access;
    const db = serviceDb();
    const results = await Promise.all([
      db.from("products").select("*").order("name"),
      db.from("suppliers").select("*").order("name"),
      readAllRows<Order>("orders", {
        order: "created_at",
        ascending: false,
      }).then((data) => ({ data, error: null })),
      can(access, "finanzen")
        ? readAllRows<Sale>("sales", {
            order: "created_at",
            ascending: false,
          }).then((data) => ({ data, error: null }))
        : { data: [], error: null },
      readAllRows("purchases", { order: "created_at", ascending: false }).then(
        (data) => ({ data, error: null }),
      ),
      db.from("settings").select("value,smtp_secret").eq("id", 1).single(),
      readAllRows("closings", { order: "created_at", ascending: false }).then(
        (data) => ({ data, error: null }),
      ),
      db
        .from("mail_outbox")
        .select("id,kind,recipient,subject,status,error,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (results.some((r) => r.error)) throw new Error("Database error");
    return Response.json(
      {
        products: ["artikel", "kasse"].some((m) => can(access, m))
          ? results[0].data
          : [],
        suppliers: ["lieferanten", "artikel", "einkauf"].some((m) =>
          can(access, m),
        )
          ? results[1].data
          : [],
        orders: ["bestellungen", "lieferung", "kunden"].some((m) =>
          can(access, m),
        )
          ? results[2].data
          : [],
        sales: can(access, "finanzen") ? results[3].data : [],
        purchases: can(access, "einkauf") ? results[4].data : [],
        settings: can(access, "einstellungen")
          ? {
              ...results[5].data?.value,
              smtp_password_set: !!results[5].data?.smtp_secret,
            }
          : {
              live_mode: results[5].data?.value?.live_mode,
              discount_percent: results[5].data?.value?.discount_percent,
            },
        closings: can(access, "finanzen") ? results[6].data : [],
        mail: can(access, "einstellungen") ? results[7].data : [],
        role,
        permissions,
        name,
        summary: can(access, "uebersicht")
          ? {
              open: results[2].data?.filter(
                (o) => !["completed", "cancelled"].includes(o.status),
              ).length,
              partial: results[2].data?.filter((o) => o.status === "partial")
                .length,
            }
          : null,
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
    const access = await requireStaff();
    const { user } = access;
    const db = serviceDb();
    const body = await req.json();
    const action = z.string().parse(body.action);
    let result: unknown = { ok: true };
    const actionModules: Record<string, string> = {
      product: "artikel",
      bulk: "artikel",
      supplier: "lieferanten",
      settings: "einstellungen",
      closing: "finanzen",
      receive: "einkauf",
      "order-status": "bestellungen",
      "purchase-status": "einkauf",
      "smtp-test": "einstellungen",
      reorder: "einkauf",
      sale: "kasse",
    };
    if (!actionModules[action] || !can(access, actionModules[action]))
      throw new Error("FORBIDDEN");
    if (action === "product") {
      const value = productSchema.parse(body.value);
      value.deposit_cents = depositFor(
        value.deposit_profile,
        value.pack_count,
        value.deposit_cents ?? 0,
      );
      const { data: saved, error } = await db.rpc("save_product", {
        p_value: value,
        p_expected_revision: value.revision ?? null,
        p_actor: user.id,
      });
      if (error || !saved)
        throw new Error(
          "Artikel wurde zwischenzeitlich geändert. Bitte neu laden.",
        );
      await db.from("audit_log").insert({
        table_name: "products",
        record_id: value.id,
        action: "staff_edit",
        actor: user.id,
      });
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
      const { error } = await db
        .from("products")
        .update({
          ...patch,
          ...(patch.deposit_cents !== undefined
            ? { deposit_profile: "custom" }
            : {}),
        })
        .in("id", ids);
      if (error) throw error;
      await db.from("audit_log").insert({
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
      if (v.live_mode)
        throw new Error(
          "HINWEIS:Live-Aktivierung erfolgt nach Einrichtung und Abnahme des TSE-Adapters. Alle Abläufe sind im Einrichtungsmodus verfügbar.",
        );
      if (v.delivery_from >= v.delivery_to)
        throw new Error("HINWEIS:Lieferende muss nach Lieferbeginn liegen.");
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
      const { data: changed, error } = await db
        .from("orders")
        .update({
          status: z
            .enum(["new", "confirmed", "delivering", "cancelled"])
            .parse(body.status),
        })
        .eq("id", z.uuid().parse(body.id))
        .in("status", ["new", "confirmed", "delivering"])
        .select("id");
      if (error) throw error;
      if (!changed?.length)
        throw new Error(
          "HINWEIS:Gelieferte, teilweise gelieferte oder stornierte Aufträge können hier nicht umgestellt werden. Bitte die offenen Mengen in der Auslieferung bearbeiten.",
        );
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
          discount: z.number().int().min(0).max(100).default(0),
          returns: z
            .array(
              z.object({
                quantity: z.number().int().min(1).max(1000),
                deposit_cents: z
                  .number()
                  .int()
                  .refine((v) =>
                    [
                      8, 15, 25, 150, 240, 285, 330, 310, 342, 450, 510,
                    ].includes(v),
                  ),
              }),
            )
            .max(11),
        })
        .parse(body.value);
      const { data, error } = await db.rpc("save_sale", {
        p_id: v.id,
        p_lines: v.lines,
        p_payment: v.payment,
        p_actor: user.id,
        p_returns: v.returns,
        p_discount: v.discount,
      });
      if (error) throw error;
      result = data;
    } else if (action === "closing") {
      const v = z
        .object({
          opening: z.number().int().min(0).default(0),
          counted: z.number().int().min(0).default(0),
          kind: z.enum(["day", "month"]),
          period: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
        })
        .parse(body.value);
      const { data, error } = await db.rpc("close_business_period", {
        p_kind: v.kind,
        p_opening: v.opening,
        p_counted: v.counted,
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
