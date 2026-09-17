import { writeFile, mkdir } from "node:fs/promises";
import { buildFinanceReport } from "../lib/finance-report.ts";
import { createFinancePdf } from "../lib/finance-pdf.ts";
import { totals } from "../lib/money.ts";
const sales = [];
for (let day = 1; day <= 30; day++)
  for (let n = 1; n <= (day % 4) + 1; n++) {
    const items = [
      {
        id: "demo-water",
        name: "Mineralwasser 12 x 0,7 l",
        quantity: n + (day % 3),
        price_cents: 649,
        deposit_cents: 330,
        tax_rate: 19,
        deposit_tax_rate: 19,
      },
      ...(day % 5 === 0
        ? [
            {
              id: "demo-milk",
              name: "Milch - fiktiver Layoutartikel",
              quantity: 2,
              price_cents: 107,
              deposit_cents: 0,
              tax_rate: 7,
              deposit_tax_rate: 19,
            },
          ]
        : []),
      ...(day % 3 === 0
        ? [
            {
              id: "return",
              name: "Pfandrücknahme",
              quantity: -4,
              price_cents: 0,
              deposit_cents: 15,
              tax_rate: 19,
              deposit_tax_rate: 19,
            },
          ]
        : []),
    ];
    const t = totals(items);
    sales.push({
      id: crypto.randomUUID(),
      number: 1000 + sales.length,
      created_at: `2026-09-${String(day).padStart(2, "0")}T${String(8 + n).padStart(2, "0")}:15:00Z`,
      items,
      payment: n % 2 ? "cash" : "card",
      test_mode: true,
      total_cents: t.gross,
      net_cents: t.net,
      tax_cents: t.tax,
      deposit_cents: t.deposit,
    });
  }
const invoices = sales
  .filter((_, i) => i % 13 === 0)
  .map((s, i) => ({
    ...s,
    id: crypto.randomUUID(),
    number: 2000 + i,
    mode: "setup",
    status: i % 2 ? "paid" : "open",
  }));
const settings = {
  business_name: "Getränkeshop Elias · LAYOUTMUSTER (fiktive Daten)",
  business_address: "Wartbergstraße 3 · 74076 Heilbronn",
};
await mkdir("output/pdf", { recursive: true });
for (const period of ["2026-09", "2026-09-17"]) {
  const report = buildFinanceReport(
    sales,
    invoices,
    period,
    settings,
    [],
    "2026-09-30T18:00:00Z",
  );
  const pdf = await createFinancePdf(report);
  const file = `output/pdf/Elias-${report.title}-Muster.pdf`;
  await writeFile(file, Buffer.from(pdf.output("arraybuffer")));
  console.log(file, pdf.getNumberOfPages(), "pages");
}
