import type { Product, Sale } from "./types";
import { euro, pack, totals } from "./money";
export { createReceiptPdf } from "./receipt";
import { createReceiptPdf } from "./receipt";
export function csvDownload(name: string, rows: (string | number)[][]) {
  const text =
    "\ufeff" +
    rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[=+@-]/, "'$&")
                .replace(/"/g, '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
async function documentBase(title: string, subtitle: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFillColor(35, 48, 34);
  doc.rect(0, 0, 210, 42, "F");
  doc.setTextColor(196, 219, 116);
  doc.setFontSize(11);
  doc.text("GETRÄNKESHOP ELIAS", 16, 14);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(title, 16, 27);
  doc.setFontSize(9);
  doc.text(subtitle, 16, 35);
  doc.setTextColor(45, 48, 40);
  return doc;
}
async function finish(
  doc: Awaited<ReturnType<typeof documentBase>>,
  name: string,
) {
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFontSize(8);
    doc.setTextColor(100, 105, 90);
    doc.text(
      "Getränkeshop Elias · Wartbergstraße 3 · 74076 Heilbronn",
      16,
      285,
    );
    doc.text(`${n} / ${pages}`, 185, 285);
  }
  doc.save(name);
}
export async function catalogPdf(products: Product[]) {
  const doc = await documentBase(
    "Deine Getränkeauswahl",
    "Lieferpreisliste · Preise inkl. MwSt. · zzgl. Pfand · Importstand Februar 2026",
  );
  const { default: autoTable } = await import("jspdf-autotable");
  autoTable(doc, {
    startY: 50,
    margin: { left: 16, right: 16, bottom: 22 },
    head: [["Artikel / Gebinde", "MwSt.", "Netto", "Brutto", "Pfand"]],
    body: products.map((p) => [
      `${p.name}\n${pack(p)} · ${p.sku}`,
      `${p.tax_rate} %`,
      euro(Math.round((p.price_cents * 100) / (100 + p.tax_rate))),
      euro(p.price_cents),
      p.deposit_cents === null ? "zu prüfen" : euro(p.deposit_cents),
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [153, 183, 43], textColor: [30, 40, 25] },
    alternateRowStyles: { fillColor: [246, 248, 239] },
    columnStyles: {
      0: { cellWidth: 99 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });
  await finish(doc, "Elias-Artikelliste.pdf");
}
export async function financePdf(
  sales: Sale[],
  period: string,
  closing?: { opening?: number; counted?: number; difference?: number },
) {
  const doc = await documentBase(
    period.length === 10 ? "Tagesbericht" : "Monatsbericht",
    `${period} · Einrichtungsmodus · Netto / Umsatzsteuer / Brutto`,
  );
  const { default: autoTable } = await import("jspdf-autotable");
  autoTable(doc, {
    startY: 50,
    margin: { left: 16, right: 16, bottom: 25 },
    head: [
      ["Bon", "Datum / Zahlart", "Netto", "USt.", "Brutto", "davon Pfand"],
    ],
    body: sales.map((s) => [
      `E-${s.number}`,
      new Date(s.created_at).toLocaleDateString("de-DE", {
        timeZone: "Europe/Berlin",
      }) + ` / ${s.payment === "cash" ? "Bar" : "Karte"}`,
      euro(s.net_cents),
      euro(s.tax_cents),
      euro(s.total_cents),
      euro(s.deposit_cents),
    ]),
    foot: [
      [
        "Summe",
        "",
        euro(sales.reduce((a, s) => a + s.net_cents, 0)),
        euro(sales.reduce((a, s) => a + s.tax_cents, 0)),
        euro(sales.reduce((a, s) => a + s.total_cents, 0)),
        euro(sales.reduce((a, s) => a + s.deposit_cents, 0)),
      ],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [45, 63, 38] },
    footStyles: { fillColor: [153, 183, 43], textColor: [30, 40, 25] },
  });
  let y =
    (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 12;
  if (y > 245) {
    doc.addPage();
    y = 25;
  }
  doc.setFontSize(11);
  doc.text(
    `Bar: ${euro(sales.filter((s) => s.payment === "cash").reduce((a, s) => a + s.total_cents, 0))}    Karte: ${euro(sales.filter((s) => s.payment === "card").reduce((a, s) => a + s.total_cents, 0))}`,
    16,
    y,
  );
  const all = totals(sales.flatMap((s) => s.items));
  for (const [rate, v] of Object.entries(all.taxes)) {
    y += 7;
    doc.text(
      `${rate}% USt. · Netto ${euro(v.net)} · Steuer ${euro(v.tax)} · Brutto ${euro(v.gross)}`,
      16,
      y,
    );
  }
  if (closing) {
    y += 10;
    if (y > 260) {
      doc.addPage();
      y = 25;
    }
    doc.text(
      `Anfangsbestand ${euro(closing.opening || 0)} · Gezählt ${euro(closing.counted || 0)} · Differenz ${euro(closing.difference || 0)}`,
      16,
      y,
    );
  }
  await finish(doc, `Elias-Finanzen-${period}.pdf`);
}
export async function receiptPdf(sale: Sale) {
  const doc = await createReceiptPdf(sale);
  doc.save(`Elias-Bon-${sale.number}.pdf`);
}
