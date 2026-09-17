import type { Product, Sale } from "./types";
import { euro, pack, totals } from "./money";
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
    head: [["Artikel / Gebinde", "Netto", "Brutto", "Pfand"]],
    body: products.map((p) => [
      `${p.name}\n${pack(p)} · ${p.sku}`,
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
export async function financePdf(sales: Sale[], period: string) {
  const doc = await documentBase(
    "Finanzübersicht · TESTDATEN",
    `${period} · Keine steuerliche Abrechnung / kein DSFinV-K-Export`,
  );
  const { default: autoTable } = await import("jspdf-autotable");
  autoTable(doc, {
    startY: 50,
    margin: { left: 16, right: 16, bottom: 25 },
    head: [["Testbon", "Datum", "Netto", "USt.", "Brutto", "davon Pfand"]],
    body: sales.map((s) => [
      `T-${s.number}`,
      new Date(s.created_at).toLocaleDateString("de-DE", {
        timeZone: "Europe/Berlin",
      }),
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
  await finish(doc, `Elias-Finanzen-TEST-${period}.pdf`);
}
export async function receiptPdf(sale: Sale) {
  const { jsPDF } = await import("jspdf");
  const height = Math.max(170, 120 + sale.items.length * 17);
  const doc = new jsPDF({ unit: "mm", format: [80, height] });
  doc.setFontSize(17);
  doc.text("ELIAS", 40, 12, { align: "center" });
  doc.setFontSize(8);
  doc.text(
    [
      "Getränkeshop · Frank Elias",
      "Wartbergstraße 3 · 74076 Heilbronn",
      "TESTBELEG – KEIN FISKALBELEG",
      `T-${sale.number} · ${new Date(sale.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`,
    ],
    40,
    18,
    { align: "center" },
  );
  let y = 38;
  for (const l of sale.items) {
    doc.text(doc.splitTextToSize(`${l.quantity} × ${l.name}`, 68), 6, y);
    y += 10;
    doc.text(
      `${euro(l.quantity * l.price_cents)} + Pfand ${euro(l.quantity * l.deposit_cents)}`,
      6,
      y,
    );
    y += 7;
  }
  const t = totals(sale.items);
  doc.setFontSize(11);
  doc.text(`GESAMT ${euro(t.gross)}`, 6, y + 3);
  doc.setFontSize(8);
  y += 12;
  doc.text(`Netto ${euro(t.net)} · USt. ${euro(t.tax)}`, 6, y);
  y += 6;
  for (const [rate, v] of Object.entries(t.taxes)) {
    doc.text(`${rate}%: Netto ${euro(v.net)} / USt. ${euro(v.tax)}`, 6, y);
    y += 5;
  }
  doc.text(
    [
      `Zahlart: ${sale.payment === "cash" ? "Bar" : "Karte (Simulation)"}`,
      `Pfand enthalten: ${euro(t.deposit)}`,
      "Ohne TSE-Signatur. Keine reale Zahlung.",
      "Vielen Dank für deinen Besuch!",
    ],
    6,
    y + 5,
  );
  doc.save(`Elias-Testbon-${sale.number}.pdf`);
}
