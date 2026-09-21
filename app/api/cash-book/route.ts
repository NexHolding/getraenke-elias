import { createHash } from "node:crypto";
import { cashAccess, readCashBook } from "@/lib/cash-book-server";
import { cashBookCsv, cashCommandSchema } from "@/lib/cash-book";
import { berlinDate, validFinancePeriod } from "@/lib/finance-report";
import { serviceDb, sameOrigin, safeError } from "@/lib/server";
import { readAllRows } from "@/lib/database-read";
import { financeReadOnly } from "@/lib/permissions";
import type { Invoice, InvoicePayment } from "@/lib/types";
export async function GET(req: Request) {
  try {
    const a = await cashAccess();
    const url = new URL(req.url);
    if (url.searchParams.get("check") === "1") {
      const [last, cfg] = await Promise.all([
        serviceDb()
          .from("cash_days")
          .select("day,closed_at,test_mode")
          .order("day", { ascending: false })
          .limit(1),
        serviceDb().from("settings").select("value").eq("id", 1).single(),
      ]);
      if (last.error || cfg.error) throw Error("Kassenstatus nicht verfügbar");
      const d = last.data?.[0];
      return Response.json(
        {
          enabled: !!d,
          open:
            !!d &&
            !d.closed_at &&
            d.day === berlinDate(new Date().toISOString()) &&
            d.test_mode === !cfg.data.value.live_mode,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const period =
      url.searchParams.get("period") || berlinDate(new Date().toISOString());
    if (!validFinancePeriod(period))
      throw Error("HINWEIS:Gültigen Tag oder Monat auswählen.");
    const data = await readCashBook(period);
    const format = url.searchParams.get("format");
    if (format) {
      if (!["pdf", "csv"].includes(format))
        throw Error("HINWEIS:PDF oder CSV auswählen.");
      const headers = {
        "Content-Type":
          format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
        "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="Elias-Kassenbuch-${period}.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      };
      if (format === "csv")
        return new Response(cashBookCsv(data.report), { headers });
      const { createCashBookPdf } = await import("@/lib/cash-book-pdf");
      const pdf = await createCashBookPdf(data.report, data.settings);
      return new Response(new Uint8Array(pdf.output("arraybuffer")), {
        headers,
      });
    }
    const [payments, invoices, sources] = await Promise.all([
      readAllRows<InvoicePayment>("invoice_payments"),
      readAllRows<Invoice>("invoices"),
      readAllRows<{ source_key: string | null }>("cash_entries", {
        columns: "id,source_key",
      }),
    ]);
    const transferred = new Set(sources.map((e) => e.source_key));
    const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
    const pending = payments
      .filter((p) => p.method === "cash" && !transferred.has("payment:" + p.id))
      .map((p) => ({
        id: p.id,
        amount_cents: p.amount_cents,
        paid_at: p.paid_at,
        number: invoiceMap.get(p.invoice_id)?.number,
        mode: invoiceMap.get(p.invoice_id)?.mode,
      }));
    return Response.json(
      { ...data, operatorId: a.user.id, readOnly: financeReadOnly(a), pending },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await cashAccess(true);
    if (Number(req.headers.get("content-length") || 0) > 3000000)
      throw Error("HINWEIS:Belegdatei zu groß (max. 2 MB).");
    const value = cashCommandSchema.parse(await req.json());
    let document;
    if (value.document) {
      const file = Buffer.from(value.document.base64, "base64");
      const mime = value.document.mime;
      const valid =
        mime === "application/pdf"
          ? file.subarray(0, 5).toString() === "%PDF-"
          : mime === "image/png"
            ? file
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : file[0] === 255 && file[1] === 216 && file[2] === 255;
      if (!valid || file.length > 2 * 1024 * 1024)
        throw Error(
          "HINWEIS:Bitte ein gültiges PDF, PNG oder JPEG bis 2 MB wählen.",
        );
      document = {
        ...value.document,
        base64: file.toString("base64"),
        sha256: createHash("sha256").update(file).digest("hex"),
      };
    }
    const { data, error } = await serviceDb().rpc("cash_book_command", {
      p_value: { ...value, ...(document ? { document } : {}) },
      p_actor: a.user.id,
    });
    if (error) throw Error(error.message);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return safeError(e);
  }
}
