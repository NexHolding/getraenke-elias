import type { Product, Sale } from "./types";
import { euro, pack, totals } from "./money";
import { discountTotal } from "./discounts";
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
export async function createReceiptPdf(sale: Sale) {
  const { jsPDF } = await import("jspdf");
  const height = Math.min(350, Math.max(180, 150 + sale.items.length * 38));
  const doc = new jsPDF({ unit: "mm", format: [80, height] });
  doc.setTextColor(35, 48, 34);
  doc.setFontSize(17);
  doc.text("ELIAS", 40, 12, { align: "center" });
  doc.setFontSize(8);
  doc.text(
    [
      "Getränkeshop · Frank Elias",
      "Wartbergstraße 3 · 74076 Heilbronn",
      sale.test_mode
        ? "Einrichtungsbeleg · ohne Fiskalisierung"
        : "Kassenbeleg",
      `E-${sale.number} · ${new Date(sale.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`,
    ],
    40,
    18,
    { align: "center" },
  );
  let y = 38;
  function space(needed: number) {
    if (y + needed <= height - 12) return;
    doc.addPage();
    doc.setFontSize(8);
    doc.text(`ELIAS · E-${sale.number} · Fortsetzung`, 6, 12);
    y = 22;
  }
  for (const line of sale.items) {
    const name = doc.splitTextToSize(`${line.quantity} × ${line.name}`, 68);
    const saving = discountTotal([line]);
    const reason =
      saving > 0 && line.discount_reason
        ? doc.splitTextToSize(`Grund: ${line.discount_reason}`, 68)
        : [];
    space(name.length * 4 + 15 + (saving > 0 ? 14 + reason.length * 4 : 0));
    doc.setFontSize(8);
    doc.text(name, 6, y);
    y += name.length * 4 + 2;
    if (saving > 0) {
      doc.text(
        `Vor Rabatt: ${euro(line.quantity * (line.original_price_cents ?? line.price_cents))}`,
        6,
        y,
      );
      y += 5;
      const label =
        line.discount_scope === "cart"
          ? "Warenkorbrabatt"
          : line.discount_scope === "item"
            ? "Artikelrabatt"
            : "Rabatt";
      doc.text(
        `${label}${line.discount_percent ? ` ${line.discount_percent}%` : ""}: -${euro(saving)}`,
        6,
        y,
      );
      y += 5;
      if (reason.length) {
        doc.text(reason, 6, y);
        y += reason.length * 4 + 1;
      }
    }
    doc.text(
      `${euro(line.quantity * line.price_cents)} + Pfand ${euro(line.quantity * line.deposit_cents)}`,
      6,
      y,
    );
    y += 8;
  }
  const total = totals(sale.items);
  const saving = discountTotal(sale.items);
  space(67 + Object.keys(total.taxes).length * 5 + (saving > 0 ? 12 : 0));
  doc.setDrawColor(180, 190, 165);
  doc.line(6, y - 2, 74, y - 2);
  if (saving > 0) {
    doc.text("Rabatt gesamt (bereits enthalten):", 6, y + 3);
    doc.text(`-${euro(saving)}`, 74, y + 8, { align: "right" });
    y += 15;
  }
  doc.setFontSize(11);
  doc.text(
    `${total.gross < 0 ? "AUSZAHLUNG" : "GESAMT"} ${euro(Math.abs(total.gross))}`,
    6,
    y + 3,
  );
  doc.setFontSize(8);
  y += 12;
  doc.text(`Netto ${euro(total.net)} · USt. ${euro(total.tax)}`, 6, y);
  y += 6;
  for (const [rate, value] of Object.entries(total.taxes)) {
    doc.text(
      `${rate}%: Netto ${euro(value.net)} / USt. ${euro(value.tax)}`,
      6,
      y,
    );
    y += 5;
  }
  doc.text(
    [
      `Zahlart: ${sale.payment === "cash" ? "Bar" : "Karte"}`,
      `Pfand enthalten: ${euro(total.deposit)}`,
      ...(saving > 0 ? ["Pfand ist vom Rabatt ausgenommen."] : []),
      ...(sale.test_mode ? ["Einrichtungsmodus · keine TSE-Signatur"] : []),
      "Vielen Dank für deinen Besuch!",
    ],
    6,
    y + 5,
  );
  return doc;
}
export async function receiptPdf(sale: Sale) {
  const doc = await createReceiptPdf(sale);
  doc.save(`Elias-Bon-${sale.number}.pdf`);
}
