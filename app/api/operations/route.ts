import { invoiceDetails } from "@/lib/invoice-details";
import { requestCustomerAccess } from "@/lib/customer-access";
import { invoicePaymentSchema } from "@/lib/billing";
import { archiveDeliveryDocuments } from "@/lib/business-document-archive";
import { subscriptionCommandSchema } from "@/lib/subscriptions";
import { staffOrderSchema, staffSubscriptionSchema } from "@/lib/staff-orders";
import { deliveryAddressFields } from "@/lib/delivery-address";
import {
  SYSTEM_ACCOUNT_EMAIL,
  isSystemAccountEmail,
  isVisibleBusinessAccount,
} from "@/lib/account-visibility";
import { z } from "zod";
import { requireStaff, serviceDb, sameOrigin, safeError } from "@/lib/server";
import { can, financeReadOnly } from "@/lib/permissions";
import { employeeSchema, customerSchema } from "@/lib/operations-validation";
import { hashPin } from "@/lib/terminal";
import { readAllRows } from "@/lib/database-read";
import { planDay } from "@/lib/delivery-plan";
export async function GET() {
  try {
    const a = await requireStaff();
    const { data: systemAccounts, error: systemError } = await serviceDb()
      .from("staff")
      .select("user_id")
      .eq("email", SYSTEM_ACCOUNT_EMAIL);
    if (systemError) throw systemError;
    const systemIds = new Set((systemAccounts || []).map((row) => row.user_id));
    const visible = (row: { email?: unknown; user_id?: unknown }) =>
      isVisibleBusinessAccount(row, systemIds);
    const read = (table: string, allowed: boolean) =>
      allowed
        ? readAllRows(table, { order: table === "staff" ? "user_id" : "id" })
        : Promise.resolve([]);
    const [customers, employees, deliveries, invoices, subscriptions] =
      await Promise.all([
        read(
          "customers",
          ["kunden", "lieferung", "bestellungen"].some((m) => can(a, m)),
        ),
        read("staff", a.role === "owner"),
        read(
          "deliveries",
          ["lieferung", "bestellungen", "kunden"].some((m) => can(a, m)),
        ),
        read(
          "invoices",
          ["finanzen", "kunden"].some((m) => can(a, m)),
        ),
        read("subscriptions", can(a, "kunden") || can(a, "bestellungen")),
      ]);
    const db = serviceDb();
    const [access, detailedInvoices] = await Promise.all([
      can(a, "kunden") && customers.length
        ? db.rpc("customer_login_status", {
            p_ids: customers.filter(visible).map((c) => c.id),
          })
        : Promise.resolve({ data: [], error: null }),
      invoiceDetails(invoices as { id: string }[]),
    ]);
    if (access.error) throw access.error;
    return Response.json(
      {
        customers: customers
          .filter(visible)
          .map((c) => ({
            ...c,
            ...deliveryAddressFields(c),
            online_account: access.data?.find(
              (x: { customer_id: string }) => x.customer_id === c.id,
            ),
          })),
        employees: employees.filter(visible).map((row) => {
          const { pin_hash, ...rest } = row as unknown as Record<
            string,
            unknown
          >;
          return { ...rest, has_pin: !!pin_hash };
        }),
        deliveries,
        invoices: detailedInvoices,
        can_manage_payments: a.role === "owner",
        subscriptions: subscriptions.filter((s) =>
          customers.some((c) => c.id === s.customer_id && visible(c)),
        ),
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
    const a = await requireStaff();
    if (financeReadOnly(a)) throw new Error("FORBIDDEN");
    const db = serviceDb();
    const b = await req.json();
    const action = z.string().parse(b.action);
    const check = (module: string) => {
      if (!can(a, module)) throw new Error("FORBIDDEN");
    };
    const owner = () => {
      if (a.role !== "owner") throw new Error("FORBIDDEN");
    };
    if (action === "delivery-subscription") {
      if (!can(a, "kunden") && !can(a, "bestellungen"))
        throw new Error("FORBIDDEN");
      const value = subscriptionCommandSchema.parse(b.value);
      const { data, error } = await db.rpc("save_delivery_subscription", {
        p_value: value,
        p_actor: a.user.id,
        p_customer: false,
      });
      if (error) throw new Error(error.message);
      return Response.json(data);
    } else if (action === "staff-order" || action === "staff-subscription") {
      check("bestellungen");
      const value =
        action === "staff-order"
          ? staffOrderSchema.parse(b.value)
          : staffSubscriptionSchema.parse(b.value);
      const { data, error } = await db.rpc(
        action === "staff-order"
          ? "create_staff_order"
          : "save_staff_subscription",
        { p_value: value, p_actor: a.user.id },
      );
      if (error)
        throw new Error(
          error.message.startsWith("HINWEIS:") || error.message === "FORBIDDEN"
            ? error.message
            : "HINWEIS:Die Bestellung konnte nicht gespeichert werden. Bitte Eingaben prüfen.",
        );
      return Response.json(data);
    } else if (action === "employee") {
      owner();
      const v = employeeSchema.parse(b.value);
      if (isSystemAccountEmail(v.email)) throw new Error("FORBIDDEN");
      const { pin, password, user_id, ...record } = v;
      let id = user_id;
      if (id === a.user.id && !v.active)
        throw new Error(
          "HINWEIS:Der eigene Zugang kann nicht deaktiviert werden.",
        );
      if (id) {
        const { data: old } = await db
          .from("staff")
          .select("role,email")
          .eq("user_id", id)
          .single();
        if (isSystemAccountEmail(old?.email)) throw new Error("FORBIDDEN");
        if (old?.role === "owner" && id !== a.user.id)
          throw new Error("HINWEIS:Andere Inhaberkonten bleiben geschützt.");
        if (!old) throw new Error("HINWEIS:Mitarbeiter wurde nicht gefunden.");
        if (old.role === "owner" && record.email !== old.email)
          throw new Error(
            "HINWEIS:Die Anmeldeadresse des Inhabers bleibt geschützt.",
          );
        const emailChanged = old.role !== "owner" && record.email !== old.email;
        if (emailChanged && !record.email)
          throw new Error(
            "HINWEIS:Eine bestehende Anmeldeadresse kann nicht gelöscht werden.",
          );
        if (password || emailChanged) {
          const { error } = await db.auth.admin.updateUserById(id, {
            ...(password ? { password } : {}),
            ...(emailChanged
              ? { email: record.email, email_confirm: true }
              : {}),
          });
          if (error) throw error;
        }
      } else {
        if (!password && !pin)
          throw new Error(
            "HINWEIS:Bitte ein Passwort oder eine Kassen-PIN vergeben.",
          );
        const { data, error } = await db.auth.admin.createUser({
          email:
            record.email ||
            `mitarbeiter-${crypto.randomUUID()}@getraenke-elias.local`,
          password: password || crypto.randomUUID() + crypto.randomUUID(),
          email_confirm: true,
          user_metadata: { name: record.name },
        });
        if (error) throw error;
        id = data.user.id;
      }
      const payload = {
        ...record,
        user_id: id,
        ...(pin ? { pin_hash: hashPin(pin) } : {}),
        ...(!user_id ? { role: "staff" } : {}),
      };
      const { error } = user_id
        ? await db.from("staff").update(payload).eq("user_id", id)
        : await db.from("staff").insert(payload);
      if (error) {
        if (!user_id) await db.auth.admin.deleteUser(id!);
        throw error;
      }
      await db.from("audit_log").insert({
        table_name: "staff",
        record_id: id,
        action: "access_changed",
        actor: a.user.id,
      });
    } else if (action === "customer") {
      check("kunden");
      const v = customerSchema.parse(b.value);
      if (isSystemAccountEmail(v.email)) throw new Error("FORBIDDEN");
      if (v.id) {
        const { data: existing, error } = await db
          .from("customers")
          .select("email,user_id")
          .eq("id", v.id)
          .single();
        if (error) throw error;
        if (isSystemAccountEmail(existing.email)) throw new Error("FORBIDDEN");
        if (existing.user_id && existing.email.toLowerCase() !== v.email)
          throw new Error(
            "HINWEIS:Die E-Mail eines verknüpften Online-Kontos kann hier nicht geändert werden.",
          );
        if (existing.user_id) {
          const { data: account, error: accountError } = await db
            .from("staff")
            .select("email")
            .eq("user_id", existing.user_id)
            .maybeSingle();
          if (accountError) throw accountError;
          if (isSystemAccountEmail(account?.email))
            throw new Error("FORBIDDEN");
        }
      }
      const { id, ...record } = v;
      const { error } = id
        ? await db.from("customers").update(record).eq("id", id)
        : await db.from("customers").insert(record);
      if (error) throw error;
    } else if (action === "customer-invite" || action === "customer-access") {
      check("kunden");
      return Response.json(
        await requestCustomerAccess(z.uuid().parse(b.id), a.user.id),
      );
    } else if (action === "delivery") {
      check("lieferung");
      const v = z
        .object({
          order_id: z.uuid(),
          id: z.uuid(),
          revision: z.number().int().min(0),
          items: z
            .array(
              z.object({
                id: z.string().max(80),
                quantity: z.number().int().min(0).max(1000),
              }),
            )
            .min(1)
            .max(200),
          returns: z
            .array(
              z.object({
                deposit_cents: z
                  .number()
                  .int()
                  .refine((v) =>
                    [
                      8, 15, 25, 150, 240, 285, 330, 310, 342, 450, 510,
                    ].includes(v),
                  ),
                quantity: z.number().int().min(1).max(1000),
              }),
            )
            .max(11)
            .optional(),
          finalize: z.boolean(),
          expected_payment_method: z
            .enum(["cash", "card", "invoice"])
            .default("invoice"),
          payment_method: z
            .enum(["cash", "card", "invoice"])
            .default("invoice"),
          payment_confirmed: z.boolean().default(false),
          signature: z
            .string()
            .max(180000)
            .nullable()
            .refine(
              (s) => !s || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s),
            ),
          signed_name: z.string().max(150),
        })
        .parse(b.value);
      const { data, error } = await db.rpc("save_delivery_payment", {
        p_value: v,
        p_actor: a.user.id,
      });
      if (error)
        throw new Error(
          error.message.startsWith("HINWEIS:")
            ? error.message
            : "HINWEIS:Lieferung nicht gespeichert. Bitte Mengen, Lagerbestand, Unterschrift und Zahlungsbestätigung prüfen.",
        );
      let documents = null,
        archivePending = false;
      if (v.finalize) {
        try {
          documents = await archiveDeliveryDocuments(data.id);
        } catch {
          archivePending = true;
        }
      }
      return Response.json({
        ...data,
        invoice: documents,
        archive_pending: archivePending,
        mail_status: v.finalize ? "queued" : null,
      });
    } else if (action === "plan") {
      check("lieferung");
      const date = z.iso.date().parse(b.date);
      const { data: cfg } = await db
        .from("settings")
        .select("value")
        .eq("id", 1)
        .single();
      const { data: orders, error } = await db
        .from("orders")
        .select("*")
        .in("status", ["confirmed", "partial", "delivering"])
        .or(`delivery_date.is.null,delivery_date.eq.${date}`)
        .or(
          `requested_delivery_date.is.null,requested_delivery_date.lte.${date}`,
        );
      if (error) throw error;
      const plan = planDay(orders || [], date, cfg?.value || {});
      for (const stop of plan.stops) {
        const { error } = await db
          .from("orders")
          .update({
            delivery_date: date,
            eta_start: stop.eta_start,
            eta_end: stop.eta_end,
            route_position: stop.position,
          })
          .eq("id", stop.id);
        if (error) throw error;
      }
      return Response.json(plan);
    } else if (action === "geocode") {
      check("lieferung");
      const { data: cfg } = await db
        .from("settings")
        .select("value")
        .eq("id", 1)
        .single();
      if (!cfg?.value?.route_geocoding)
        throw new Error(
          "HINWEIS:Adress-Geocodierung zuerst in den Liefer-Einstellungen aktivieren.",
        );
      const { error: rateError } = await db.from("automation_runs").insert({
        kind: "geocode-rate",
        slot: new Date().toISOString().slice(0, 19),
      });
      if (rateError)
        throw new Error(
          "HINWEIS:Bitte eine Sekunde bis zur nächsten Adressabfrage warten.",
        );
      const id = z.uuid().parse(b.id);
      const { data: c } = await db
        .from("customers")
        .select("address")
        .eq("id", id)
        .single();
      if (!c) throw new Error("Missing");
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(c.address)}`,
        {
          headers: {
            "User-Agent": "GetraenkeElias/1.0 (info@getraenke-elias.de)",
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!r.ok) throw new Error("HINWEIS:Adressdienst nicht erreichbar.");
      const rows = await r.json();
      if (!rows[0])
        throw new Error(
          "HINWEIS:Adresse nicht gefunden. Bitte Stammdaten prüfen.",
        );
      const { error } = await db
        .from("customers")
        .update({
          latitude: Number(rows[0].lat),
          longitude: Number(rows[0].lon),
        })
        .eq("id", id);
      if (error) throw error;
      const { data: orders } = await db
        .from("orders")
        .select("id,preference_snapshot")
        .eq("customer_id", id)
        .in("status", ["new", "confirmed", "partial"]);
      for (const o of orders || [])
        await db
          .from("orders")
          .update({
            preference_snapshot: {
              ...o.preference_snapshot,
              latitude: Number(rows[0].lat),
              longitude: Number(rows[0].lon),
            },
          })
          .eq("id", o.id);
    } else if (action === "invoice-paid") {
      owner();
      const v = invoicePaymentSchema.parse(b);
      const { error } = await db.rpc("mark_invoice_paid", {
        p_id: v.id,
        p_method: v.method,
        p_paid_on: v.paid_on,
        p_actor: a.user.id,
      });
      if (error) throw new Error(error.message);
    } else if (action === "reset") {
      owner();
      if (b.confirm !== "EINRICHTUNG ZURÜCKSETZEN")
        throw new Error("FORBIDDEN");
      const { error } = await db.rpc("reset_setup", { p_actor: a.user.id });
      if (error) throw error;
    } else throw new Error("Invalid action");
    return Response.json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
