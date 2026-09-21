import { requireStaff, serviceDb, safeError } from "@/lib/server";
import { readAllRows } from "@/lib/database-read";
import {
  buildFinanceReport,
  financeCsv,
  validFinancePeriod,
  type FinanceClosing,
} from "@/lib/finance-report";
import { createFinancePdf } from "@/lib/finance-pdf";
import type { Sale, Invoice, InvoicePayment } from "@/lib/types";
export async function GET(req: Request) {
  try {
    await requireStaff("finanzen");
    const url = new URL(req.url),
      period = url.searchParams.get("period") || "",
      format = url.searchParams.get("format");
    if (!validFinancePeriod(period))
      return Response.json(
        { error: "Bitte einen gültigen Tag oder Monat auswählen." },
        { status: 400 },
      );
    if (!["pdf", "csv"].includes(format || ""))
      return Response.json(
        { error: "PDF oder CSV auswählen." },
        { status: 400 },
      );
    const [sales, invoices, closings, settings, payments] = await Promise.all([
      readAllRows<Sale>("sales"),
      readAllRows<Invoice>("invoices"),
      readAllRows<FinanceClosing>("closings"),
      serviceDb().from("settings").select("value").eq("id", 1).single(),
      readAllRows<InvoicePayment>("invoice_payments"),
    ]);
    if (settings.error) throw settings.error;
    const report = buildFinanceReport(
      sales,
      invoices,
      period,
      settings.data.value,
      closings,
      new Date().toISOString(),
      payments,
    );
    const headers = {
      "Content-Type":
        format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Elias-${report.title}-${period}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (format === "csv") return new Response(financeCsv(report), { headers });
    const pdf = await createFinancePdf(report);
    return new Response(new Uint8Array(pdf.output("arraybuffer")), { headers });
  } catch (e) {
    return safeError(e);
  }
}
